import type { Connection } from '#shared/contract'
import type { ConnectionClient } from './client'
import type { ConnectionCheck } from './registry'
import { StudioProblem } from '../problem'
import { answerProblem } from './client'

// InfluxDB 2.x (ADR 0040): Flux queries over `/api/v2/query`, answered as
// annotated CSV. Studio sends the query that AAS content holds, after the
// time series reader checked and interpolated it, to the connection's own
// URL; the content's endpoint only selects the connection and organization.

type Influxdb2Connection = Extract<Connection, { type: 'influxdb2' }>

const queryPath = '/api/v2/query'

/** The organization parameters of a content endpoint, with the connection's organization taking precedence. */
export function influxQueryParameters (connection: Influxdb2Connection, endpoint: URL): Record<string, string> {
  const path = endpoint.pathname.replace(/\/+$/, '')
  if (!path.endsWith(queryPath)) {
    throw new StudioProblem('connection_request_refused', `${endpoint.origin}${endpoint.pathname} is not an InfluxDB 2 query endpoint (${queryPath}).`)
  }
  if (connection.settings.organization) {
    return { org: connection.settings.organization }
  }
  const parameters: Record<string, string> = {}
  for (const name of ['org', 'orgID']) {
    const value = endpoint.searchParams.get(name)
    if (value) {
      parameters[name] = value
    }
  }
  return parameters
}

/** Runs a Flux query and returns the annotated CSV. */
export async function runFluxQuery (client: ConnectionClient, query: string, parameters: Record<string, string>): Promise<string> {
  const response = await client.request(queryPath, {
    method: 'POST',
    query: parameters,
    headers: { 'Accept': 'application/csv', 'Content-Type': 'application/vnd.flux' },
    body: query,
  })
  if (!response.ok) {
    throw await answerProblem(client, response)
  }
  return client.text(response)
}

/** Splits one CSV line into fields (RFC 4180 quoting). */
export function splitCsvLine (line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      fields.push(field)
      field = ''
    } else {
      field += char
    }
  }
  fields.push(field)
  return fields
}

export interface RawPoint {
  time: string
  value: number
}

/**
 * The series key of a table, as the BaSyx AAS Web UI names it: the `_field`,
 * or for MQTT data written by Telegraf (`_field` = `value`) the last part of
 * the `topic`.
 */
function tableKey (header: string[], first: string[]): string | null {
  const field = (first[header.indexOf('_field')] ?? '').trim()
  const topic = (first[header.indexOf('topic')] ?? '').trim()
  if (field === 'value' && topic) {
    return topic.split('/').at(-1) || null
  }
  return field || null
}

/**
 * Parses InfluxDB's annotated CSV into series by key. Tables with the same
 * key (the same field from several tags) are merged. Annotation rows are
 * skipped; every header row starts a new group of tables.
 */
export function parseFluxCsv (csv: string): Map<string, RawPoint[]> {
  const series = new Map<string, RawPoint[]>()
  let header: string[] | null = null
  let rows: string[][] = []
  let table: string | null = null

  const flush = () => {
    if (header && rows.length > 0) {
      const time = header.indexOf('_time')
      const value = header.indexOf('_value')
      const key = tableKey(header, rows[0]!)
      if (key && time !== -1 && value !== -1) {
        const points = rows.map(row => ({ time: (row[time] ?? '').trim(), value: Number.parseFloat(row[value] ?? '') }))
        series.set(key, [...(series.get(key) ?? []), ...points])
      }
    }
    rows = []
    table = null
  }

  for (const line of csv.split(/\r?\n/)) {
    if (line.trim() === '') {
      flush()
      continue
    }
    if (line.startsWith('#')) {
      continue
    }
    const columns = splitCsvLine(line)
    if (columns[1]?.trim() === 'result') {
      flush()
      header = columns.map(column => column.trim())
      continue
    }
    if (!header || columns.length < 3) {
      continue
    }
    const tableIndex = header.indexOf('table')
    const current = columns[tableIndex === -1 ? 2 : tableIndex] ?? ''
    if (table !== null && current !== table) {
      flush()
    }
    table = current
    rows.push(columns)
  }
  flush()
  return series
}

/** *Test connection*: the service answers, and the token may read. */
export async function testInfluxdb2 (client: ConnectionClient): Promise<ConnectionCheck[]> {
  const connection = client.connection as Influxdb2Connection
  const checks: ConnectionCheck[] = []

  let started = performance.now()
  try {
    const health = await client.request('/health', { headers: { Accept: 'application/json' } })
    await health.body?.cancel()
    checks.push({ check: 'health', ok: health.ok, status: health.status, latencyMs: Math.round(performance.now() - started), message: health.ok ? null : `HTTP ${health.status}` })
  } catch (error) {
    checks.push({ check: 'health', ok: false, status: null, latencyMs: null, message: error instanceof Error ? error.message : 'request failed' })
    return checks
  }

  started = performance.now()
  try {
    // With an organization, as the time series reader queries; without one, a bucket listing needs the same read rights.
    const response = connection.settings.organization
      ? await client.request(queryPath, {
          method: 'POST',
          query: { org: connection.settings.organization },
          headers: { 'Accept': 'application/csv', 'Content-Type': 'application/vnd.flux' },
          body: 'buckets() |> limit(n: 1)',
        })
      : await client.request('/api/v2/buckets', { query: { limit: '1' }, headers: { Accept: 'application/json' } })
    const latencyMs = Math.round(performance.now() - started)
    if (response.ok) {
      await response.body?.cancel()
      checks.push({ check: 'query', ok: true, status: response.status, latencyMs, message: null })
    } else {
      const problem = await answerProblem(client, response)
      checks.push({ check: 'query', ok: false, status: response.status, latencyMs, message: problem.message })
    }
  } catch (error) {
    checks.push({ check: 'query', ok: false, status: null, latencyMs: null, message: error instanceof Error ? error.message : 'request failed' })
  }
  return checks
}
