import { z } from 'zod'

// IDTA 02008 Time Series Data 1.1, read through `studio.timeseries.read`
// (ADR 0040, CON-004). The app names the submodel, the segment and the
// records; Studio reads the submodel and the data behind the segment.

export const timeSeriesSemanticId = 'https://admin-shell.io/idta/TimeSeries/1/1'

export const segmentKinds = ['internal', 'linked', 'external'] as const
export type SegmentKind = (typeof segmentKinds)[number]

/** The semantic ID of each segment kind. */
export const segmentSemanticIds: Record<SegmentKind, string> = {
  internal: 'https://admin-shell.io/idta/TimeSeries/Segments/InternalSegment/1/1',
  linked: 'https://admin-shell.io/idta/TimeSeries/Segments/LinkedSegment/1/1',
  external: 'https://admin-shell.io/idta/TimeSeries/Segments/ExternalSegment/1/1',
}

/** The longest range a read may span. */
export const maxTimeSeriesRangeMs = 5 * 366 * 24 * 60 * 60 * 1000

/** The most points per series Studio returns; more are thinned out evenly. */
export const maxTimeSeriesPoints = 20_000

/** An idShort as AAS 3 allows it; no quotes or other Flux syntax. */
const idShortSchema = z.string().max(128).regex(/^[a-z][\w-]*$/i, 'must be an idShort')

const dateTimeSchema = z.iso.datetime({ offset: true })

export const timeSeriesRangeSchema = z.object({
  start: dateTimeSchema,
  stop: dateTimeSchema,
  /**
   * `latest` moves the range so that it ends at the latest point of the data
   * (InternalSegment and ExternalSegment), as the BaSyx AAS Web UI does for
   * relative ranges; `fixed` keeps it.
   */
  anchor: z.enum(['fixed', 'latest']).default('fixed'),
}).strict().superRefine((range, context) => {
  const duration = Date.parse(range.stop) - Date.parse(range.start)
  if (duration <= 0) {
    context.addIssue({ code: 'custom', path: ['stop'], message: 'must be after start' })
  } else if (duration > maxTimeSeriesRangeMs) {
    context.addIssue({ code: 'custom', path: ['stop'], message: 'the range may span at most five years' })
  }
})

export const timeSeriesReadParamsSchema = z.object({
  submodelId: z.string().min(1).max(2048),
  /** The idShort of the segment in `Segments`. */
  segment: idShortSchema,
  /** The idShort of the record that holds the time. */
  time: idShortSchema,
  /** The idShorts of the records to read, one series each. */
  values: z.array(idShortSchema).min(1).max(20),
  range: timeSeriesRangeSchema,
  maxPoints: z.number().int().min(10).max(maxTimeSeriesPoints).default(5000),
}).strict()
export type TimeSeriesReadParams = z.input<typeof timeSeriesReadParamsSchema>

export const timeSeriesWarningCodes = [
  /** A selected record is not in the segment's data (`value`). */
  'value_missing',
  /** The time record is not in the segment's data (`time`). */
  'time_missing',
  /** Points without a valid time or a numeric value were left out (`value`, `count`). */
  'points_skipped',
  /** A series had more points than `maxPoints` and was thinned out evenly (`value`, `count`, `limit`). */
  'points_reduced',
] as const

export const timeSeriesResultSchema = z.object({
  kind: z.enum(segmentKinds),
  /** The range the series cover, after `anchor`. */
  range: z.object({ start: z.string(), stop: z.string() }),
  /** One per selected value, in order. */
  series: z.array(z.object({
    key: z.string(),
    /** From the record's concept description, if it names one. */
    unit: z.string().nullable(),
    /** `[epoch milliseconds, value]`, in time order. */
    points: z.array(z.tuple([z.number(), z.number()])),
  })),
  warnings: z.array(z.object({
    code: z.enum(timeSeriesWarningCodes),
    params: z.record(z.string(), z.union([z.string(), z.number()])),
  })),
})
export type TimeSeriesResult = z.infer<typeof timeSeriesResultSchema>
