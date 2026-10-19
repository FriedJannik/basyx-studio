import type { TimeRangeSelection } from './timeRange'
import type { JsonObject, TimeSeriesReadParams, TimeSeriesResult } from '@basyx/studio-sdk'
import { langText } from '../../../shared/aas'
import { resolveTimeRange } from './timeRange'

// Reading an IDTA 02008 Time Series Data 1.1 submodel in the app: the
// segments and records the user picks from, as the BaSyx AAS Web UI finds
// them, and the preparation of Studio's result for the charts. Studio reads
// the data itself (`studio.timeseries.read`); the app never fetches it.

export type SegmentKind = 'InternalSegment' | 'LinkedSegment' | 'ExternalSegment'

export const SEGMENT_SEMANTIC_IDS: Record<SegmentKind, string> = {
  InternalSegment: 'https://admin-shell.io/idta/TimeSeries/Segments/InternalSegment/1/1',
  LinkedSegment: 'https://admin-shell.io/idta/TimeSeries/Segments/LinkedSegment/1/1',
  ExternalSegment: 'https://admin-shell.io/idta/TimeSeries/Segments/ExternalSegment/1/1',
}

export interface Segment {
  idShort: string
  kind: SegmentKind
  element: JsonObject
}

export interface TimeSeriesRecord {
  idShort: string
  element: JsonObject
}

function objects (value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => typeof item === 'object' && item !== null) : []
}

function itemsOf (element: JsonObject | undefined): JsonObject[] {
  if (!element) {
    return []
  }
  return objects(element.modelType === 'Submodel' || 'submodelElements' in element ? element.submodelElements : element.value)
}

/** The Web UI's `checkIdShort`: the same idShort, ignoring case. */
export function sameIdShort (element: JsonObject | undefined, idShort: string): boolean {
  return typeof element?.idShort === 'string' && element.idShort.toLowerCase() === idShort.toLowerCase()
}

function childNamed (element: JsonObject | undefined, idShort: string): JsonObject | undefined {
  return itemsOf(element).find(item => sameIdShort(item, idShort))
}

function semanticIdsOf (element: JsonObject): string[] {
  const reference = element.semanticId as { keys?: Array<{ value?: unknown }> } | undefined
  return (reference?.keys ?? []).flatMap(key => (typeof key.value === 'string' ? [key.value] : []))
}

/** The kind of a segment, from its semantic ID. */
export function segmentKind (element: JsonObject): SegmentKind | null {
  const ids = new Set(semanticIdsOf(element))
  return (Object.keys(SEGMENT_SEMANTIC_IDS) as SegmentKind[]).find(kind => ids.has(SEGMENT_SEMANTIC_IDS[kind])) ?? null
}

/** The segments of the submodel: children of `Segments` with a segment semantic ID. */
export function findSegments (submodel: JsonObject | null | undefined): Segment[] {
  return itemsOf(childNamed(submodel ?? undefined, 'Segments')).flatMap(element => {
    const kind = segmentKind(element)
    return kind && typeof element.idShort === 'string' ? [{ idShort: element.idShort, kind, element }] : []
  })
}

/** The variables of the time series: the children of `Metadata.Record`. */
export function findRecords (submodel: JsonObject | null | undefined): TimeSeriesRecord[] {
  const record = childNamed(childNamed(submodel ?? undefined, 'Metadata'), 'Record')
  return itemsOf(record).flatMap(element => (typeof element.idShort === 'string' ? [{ idShort: element.idShort, element }] : []))
}

/** What the view starts with: the first segment, and a record named `time` as the time variable. */
export function defaultSelection (segments: Segment[], records: TimeSeriesRecord[]): { segment: string | null, time: string | null } {
  return {
    segment: segments[0]?.idShort ?? null,
    time: records.find(record => sameIdShort(record.element, 'time'))?.idShort ?? null,
  }
}

/**
 * Relative ranges of Internal and External segments end at the latest data
 * point, as in the Web UI; LinkedSegments and absolute ranges are read as given.
 */
export function rangeAnchor (kind: SegmentKind, selection: TimeRangeSelection): 'fixed' | 'latest' {
  return selection.mode === 'relative' && kind !== 'LinkedSegment' ? 'latest' : 'fixed'
}

export interface ReadRequest {
  submodelId: string
  segment: Segment
  time: string
  values: string[]
  selection: TimeRangeSelection
  now: Date
  maxPoints?: number
}

/** The parameters of `studio.timeseries.read`; throws a `RangeError` for an invalid range. */
export function readParams (request: ReadRequest): TimeSeriesReadParams {
  const range = resolveTimeRange(request.selection, request.now)
  return {
    submodelId: request.submodelId,
    segment: request.segment.idShort,
    time: request.time,
    values: [...request.values],
    range: { start: range.start, stop: range.stop, anchor: rangeAnchor(request.segment.kind, request.selection) },
    ...(request.maxPoints ? { maxPoints: request.maxPoints } : {}),
  }
}

/** The name of a record: its display name in the locale, else its idShort. */
export function recordName (record: TimeSeriesRecord | undefined, idShort: string, locale: string): string {
  return (record && langText(record.element.displayName, locale)) || idShort
}

export interface ChartSeries {
  key: string
  name: string
  unit: string
  /** `[epochMs, value]`, in time order. */
  points: Array<[number, number]>
}

/** Studio's series with their names and units, in the order of the selected values. */
export function prepareSeries (result: TimeSeriesResult | null, records: TimeSeriesRecord[], locale: string): ChartSeries[] {
  if (!result) {
    return []
  }
  return result.series.map(series => {
    const record = records.find(entry => sameIdShort(entry.element, series.key))
    return {
      key: series.key,
      name: recordName(record, series.key, locale),
      unit: series.unit ?? '',
      points: series.points.map(([time, value]) => [time, value] as [number, number]),
    }
  })
}

export function hasPoints (series: ChartSeries[]): boolean {
  return series.some(entry => entry.points.length > 0)
}

/** A value as the Web UI shows it: two decimals. */
export function formatValue (value: unknown): string {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number.toFixed(2) : String(value ?? '')
}

/** The legend entry of ChartHandling: `Temperature [°C]`. */
export function legendLabel (name: string, unit: string): string {
  return unit ? `${name} [${unit}]` : name
}

/** The tooltip value of ChartHandling: `21.50 °C`. */
export function tooltipLabel (value: unknown, unit: string): string {
  const text = formatValue(value)
  return unit ? `${text} ${unit}` : text
}

export interface LatestValue {
  key: string
  name: string
  unit: string
  value: number
}

/** The last point of each series that has one (gauge and display field). */
export function latestValues (series: ChartSeries[]): LatestValue[] {
  return series.flatMap(entry => {
    const last = entry.points.at(-1)
    return last && Number.isFinite(last[1]) ? [{ key: entry.key, name: entry.name, unit: entry.unit, value: last[1] }] : []
  })
}

export const DEFAULT_HISTOGRAM_BINS = 20
export const MAX_HISTOGRAM_BINS = 200

/** A bin count as typed: a whole number from 1 to 200, or `null`. */
export function parseBins (value: unknown): number | null {
  const bins = Number(value)
  return Number.isInteger(bins) && bins >= 1 && bins <= MAX_HISTOGRAM_BINS ? bins : null
}

export interface HistogramData {
  /** Counts per bin, one array per series. */
  histograms: number[][]
  /** `min - max` of each bin, with two decimals. */
  categories: string[]
}

/**
 * ChartHandling's `prepareHistogramData`: equal bins between the smallest
 * and largest value of all series; the largest value falls into the last
 * bin. When all values are equal, they fall into the first bin.
 */
export function histogramData (series: ChartSeries[], bins: number): HistogramData {
  const values = series.flatMap(entry => entry.points.map(([, value]) => value)).filter(value => Number.isFinite(value))
  if (values.length === 0 || !Number.isInteger(bins) || bins < 1) {
    return { histograms: [], categories: [] }
  }
  let minValue = values[0]!
  let maxValue = values[0]!
  for (const value of values) {
    minValue = Math.min(minValue, value)
    maxValue = Math.max(maxValue, value)
  }
  const interval = (maxValue - minValue) / bins

  const histograms = series.map(entry => {
    const histogram = Array.from({ length: bins }, () => 0)
    for (const [, value] of entry.points) {
      if (!Number.isFinite(value)) {
        continue
      }
      const index = interval > 0 ? Math.min(Math.floor((value - minValue) / interval), bins - 1) : 0
      histogram[index]! += 1
    }
    return histogram
  })

  const categories = Array.from({ length: bins }, (_, index) => {
    const rangeStart = minValue + index * interval
    return `${rangeStart.toFixed(2)} - ${(rangeStart + interval).toFixed(2)}`
  })

  return { histograms, categories }
}
