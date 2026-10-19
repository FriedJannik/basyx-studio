import type { Connection, timeSeriesReadParamsSchema, TimeSeriesResult } from '#shared/contract'
import type { JsonObject } from '../aas/outline'
import type { ConnectionClient } from '../connections/client'
import type { RawPoint } from '../connections/influxdb2'
import type { BinaryContent } from '../targets/aas-target'
import type { TimeSeriesSelection } from './segments'
import { influxQueryParameters, parseFluxCsv, runFluxQuery } from '../connections/influxdb2'
import { sha256 } from '../crypto/cipher'
import { StudioProblem } from '../problem'
import { parseCsv } from './csv'
import { checkFluxQuery, interpolateFlux, isValueTemplate } from './flux'
import { childNamed, children, parseTime, selectTimeSeries, semanticIdsOf, unitOf } from './segments'

// `studio.timeseries.read` (ADR 0040, time series plan K2 to K7): one shape
// for the three segment kinds, so parsing and limits are tested once.

export type TimeSeriesReadParams = ReturnType<typeof timeSeriesReadParamsSchema.parse>

/** What the reader needs from the target and its infrastructure. */
export interface TimeSeriesSources {
  /** The submodel, read by Studio as the user. */
  submodel: JsonObject
  /** A concept description of the target, or `null` if it cannot be read. */
  conceptDescription: (id: string) => Promise<JsonObject | null>
  /** The content of a File element of the submodel. */
  attachment: (idShortPath: string) => Promise<BinaryContent>
  /** An element of the submodel with its Blob value, which a submodel read leaves out. */
  element: (idShortPath: string) => Promise<JsonObject>
  /** A file at an absolute URL on one of the target's endpoints; refuses others. */
  download: (url: string) => Promise<BinaryContent>
  /** The connection of the target's infrastructure that serves time series for a content endpoint; refuses when there is none. */
  linked: (endpoint: URL) => Promise<ConnectionClient>
}

export interface TimeSeriesReadOutcome {
  result: TimeSeriesResult
  /** For the audit: the connection used and the digests of the queries sent (never their text). */
  connection: { key: string, type: Connection['type'], downstreamIdentity: string | null, delegation?: string } | null
  queryDigests: string[]
}

type Warning = TimeSeriesResult['warnings'][number]

interface Range {
  startMs: number
  stopMs: number
}

/** Data per selected value idShort, before range and limits. */
type RawSeries = Map<string, RawPoint[] | undefined>

function stringValue (element: JsonObject | undefined): string | undefined {
  return typeof element?.value === 'string' ? element.value : undefined
}

function internalSeries (selection: TimeSeriesSelection, timeIdShort: string, values: string[], warnings: Warning[]): RawSeries {
  const records = children(childNamed(selection.segment, 'Records'))
  const series: RawSeries = new Map()
  const hasTime = records.length === 0 || records.some(record => childNamed(record, timeIdShort))
  if (!hasTime) {
    warnings.push({ code: 'time_missing', params: { time: timeIdShort } })
  }
  for (const value of values) {
    if (!records.every(record => childNamed(record, value))) {
      warnings.push({ code: 'value_missing', params: { value } })
      series.set(value, undefined)
      continue
    }
    series.set(value, hasTime
      ? records.map(record => ({ time: stringValue(childNamed(record, timeIdShort)) ?? '', value: Number(stringValue(childNamed(record, value))) }))
      : [])
  }
  return series
}

function columnIndex (header: string[], idShort: string): number {
  const exact = header.indexOf(idShort)
  return exact === -1 ? header.findIndex(name => name.toLowerCase() === idShort.toLowerCase()) : exact
}

async function externalSeries (selection: TimeSeriesSelection, sources: TimeSeriesSources, timeIdShort: string, values: string[], warnings: Warning[]): Promise<RawSeries> {
  const data = childNamed(selection.segment, 'Data')
  const dataPath = `${selection.segmentPath}.${data?.idShort as string}`
  let content: BinaryContent
  if (data?.modelType === 'Blob') {
    // AAS servers leave Blob values out of a submodel unless asked for them.
    const blob = stringValue(data) === undefined ? await sources.element(dataPath) : data
    content = { bytes: Buffer.from(stringValue(blob) ?? '', 'base64'), contentType: String(blob.contentType ?? 'text/csv'), fileName: null }
  } else if (data?.modelType === 'File' && stringValue(data)?.trim()) {
    const location = stringValue(data)!.trim()
    content = /^[a-z][\d+.a-z-]*:/i.test(location)
      ? await sources.download(location)
      : await sources.attachment(dataPath)
  } else {
    throw new StudioProblem('timeseries_invalid', `The segment ${selection.segmentIdShort} has no Data file with a path or URL.`)
  }

  const text = new TextDecoder().decode(content.bytes).trim()
  if (content.contentType.includes('text/html') || /^<!doctype html|^<html/i.test(text)) {
    throw new StudioProblem('timeseries_invalid', `The Data of the segment ${selection.segmentIdShort} is HTML, not CSV.`)
  }
  const [header = [], ...rows] = parseCsv(text)
  const columns = header.map(name => name.trim())
  const time = columnIndex(columns, timeIdShort)
  const series: RawSeries = new Map()
  if (time === -1 && rows.length > 0) {
    warnings.push({ code: 'time_missing', params: { time: timeIdShort } })
  }
  for (const value of values) {
    const column = columnIndex(columns, value)
    if (column === -1) {
      warnings.push({ code: 'value_missing', params: { value } })
      series.set(value, undefined)
      continue
    }
    series.set(value, time === -1 ? [] : rows.map(row => ({ time: (row[time] ?? '').trim(), value: Number.parseFloat(row[column] ?? '') })))
  }
  return series
}

/**
 * The series for a value among a query's tables: by key, then ignoring
 * case; a query made for this value alone may also name its only table
 * differently (e.g. by an MQTT topic).
 */
function seriesFor (tables: Map<string, RawPoint[]>, value: string, perValue: boolean): RawPoint[] | undefined {
  const exact = tables.get(value)
  if (exact) {
    return exact
  }
  const ignoringCase = [...tables].find(([key]) => key.toLowerCase() === value.toLowerCase())
  if (ignoringCase) {
    return ignoringCase[1]
  }
  return perValue && tables.size === 1 ? [...tables.values()][0] : undefined
}

async function linkedSeries (
  selection: TimeSeriesSelection,
  sources: TimeSeriesSources,
  values: string[],
  range: { start: string, stop: string },
  warnings: Warning[],
): Promise<{ series: RawSeries, connection: TimeSeriesReadOutcome['connection'], queryDigests: string[] }> {
  const endpointText = stringValue(childNamed(selection.segment, 'Endpoint'))?.trim()
  const query = stringValue(childNamed(selection.segment, 'Query'))
  if (!endpointText || !query?.trim()) {
    throw new StudioProblem('timeseries_invalid', `The LinkedSegment ${selection.segmentIdShort} needs both an Endpoint and a Query.`)
  }
  const endpoint = URL.parse(endpointText)
  if (!endpoint || !/^https?:$/.test(endpoint.protocol)) {
    throw new StudioProblem('timeseries_invalid', `The Endpoint of the LinkedSegment ${selection.segmentIdShort} is not an http(s) URL.`)
  }
  // The queries as sent: record idShorts take the place of `{{y-value}}`,
  // so the check reads each query after interpolation.
  const perValue = isValueTemplate(query)
  const queries = perValue ? values.map(value => interpolateFlux(query, value, range)) : [interpolateFlux(query, null, range)]
  for (const text of queries) {
    checkFluxQuery(text)
  }

  const client = await sources.linked(endpoint)
  const { connection } = client
  if (connection.type !== 'influxdb2') {
    throw new StudioProblem('connection_request_refused', `The connection ${(connection as Connection).key} cannot read time series.`)
  }
  const parameters = influxQueryParameters(connection, endpoint)
  const answers = await Promise.all(queries.map(text => runFluxQuery(client, text, parameters)))
  const tables = answers.map(answer => parseFluxCsv(answer))

  const series: RawSeries = new Map()
  for (const [index, value] of values.entries()) {
    const found = seriesFor(tables[perValue ? index : 0]!, value, perValue)
    if (!found) {
      warnings.push({ code: 'value_missing', params: { value } })
    }
    series.set(value, found)
  }
  return {
    series,
    connection: { key: connection.key, type: connection.type, downstreamIdentity: client.downstreamIdentity, ...(client.delegation ? { delegation: client.delegation } : {}) },
    queryDigests: queries.map(text => sha256(text)),
  }
}

/** Evenly thins out points, keeping the first and the last. */
export function reducePoints<T> (points: T[], limit: number): T[] {
  if (points.length <= limit) {
    return points
  }
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * (points.length - 1) / (limit - 1))]!)
}

/** Valid points in time order, and how many were not valid. */
function cleanPoints (raw: RawPoint[]): { points: [number, number][], skipped: number } {
  const points: [number, number][] = []
  for (const point of raw) {
    const time = parseTime(point.time)
    if (time !== null && Number.isFinite(point.value)) {
      points.push([time, point.value])
    }
  }
  points.sort((a, b) => a[0] - b[0])
  return { points, skipped: raw.length - points.length }
}

async function unitFor (record: JsonObject, sources: TimeSeriesSources): Promise<string | null> {
  for (const id of semanticIdsOf(record)) {
    const unit = unitOf(await sources.conceptDescription(id))
    if (unit) {
      return unit
    }
  }
  return unitOf(record)
}

/**
 * Reads a segment of a Time Series Data submodel (K2 to K7). The records
 * and segment must be the submodel's; a LinkedSegment's query is checked
 * and sent only through a connection of the same infrastructure.
 */
export async function readTimeSeries (params: TimeSeriesReadParams, sources: TimeSeriesSources): Promise<TimeSeriesReadOutcome> {
  const selection = selectTimeSeries(sources.submodel, params)
  const timeIdShort = selection.time.idShort as string
  const values = selection.values.map(record => record.idShort as string)
  const warnings: Warning[] = []

  let raw: RawSeries
  let connection: TimeSeriesReadOutcome['connection'] = null
  let queryDigests: string[] = []
  switch (selection.kind) {
    case 'internal': {
      raw = internalSeries(selection, timeIdShort, values, warnings)
      break
    }
    case 'external': {
      raw = await externalSeries(selection, sources, timeIdShort, values, warnings)
      break
    }
    case 'linked': {
      ;({ series: raw, connection, queryDigests } = await linkedSeries(selection, sources, values, params.range, warnings))
      break
    }
  }

  const cleaned = values.map(value => {
    const found = raw.get(value)
    const { points, skipped } = found ? cleanPoints(found) : { points: [], skipped: 0 }
    if (skipped > 0) {
      warnings.push({ code: 'points_skipped', params: { value, count: skipped } })
    }
    return points
  })

  const range: Range = { startMs: Date.parse(params.range.start), stopMs: Date.parse(params.range.stop) }
  if (params.range.anchor === 'latest' && selection.kind !== 'linked') {
    const latest = Math.max(...cleaned.flatMap(points => points.length > 0 ? [points.at(-1)![0]] : []))
    if (Number.isFinite(latest)) {
      range.startMs = latest - (range.stopMs - range.startMs)
      range.stopMs = latest
    }
  }

  const series = await Promise.all(values.map(async (value, index) => {
    const inRange = cleaned[index]!.filter(([time]) => time >= range.startMs && time <= range.stopMs)
    if (inRange.length > params.maxPoints) {
      warnings.push({ code: 'points_reduced', params: { value, count: inRange.length, limit: params.maxPoints } })
    }
    return { key: value, unit: await unitFor(selection.values[index]!, sources), points: reducePoints(inRange, params.maxPoints) }
  }))

  return {
    result: {
      kind: selection.kind,
      range: { start: new Date(range.startMs).toISOString(), stop: new Date(range.stopMs).toISOString() },
      series,
      warnings,
    },
    connection,
    queryDigests,
  }
}
