// Smoke test of the time series example (ADR 0040, time series plan phase E):
// starts the stack with a Studio image, then checks through Studio's API what
// a user's browser would do:
//
// - the declared infrastructure has the influxdb2 connection, as a summary;
// - Test connection passes;
// - the bundled Time Series Data app reads the linked, internal and external
//   segments, with units;
// - a record outside the submodel's metadata is refused;
// - the database token is in no answer and in no log line of Studio.
//
//   STUDIO_IMAGE=basyx-studio:dev node examples/deployment/time-series/smoke-test.mjs
//
// KEEP_STACK=1 leaves the stack running afterwards.

import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const project = process.env.SMOKE_PROJECT ?? 'basyx-studio-time-series-smoke'
const port = process.env.STUDIO_PORT ?? '3991'
const env = {
  ...process.env,
  STUDIO_PORT: port,
  INFLUX_PORT: process.env.INFLUX_PORT ?? '18086',
  STUDIO_IMAGE: process.env.STUDIO_IMAGE ?? 'eclipsebasyx/basyx-studio:SNAPSHOT',
}
const base = `http://localhost:${port}`
const api = `${base}/api/studio/v1`
const submodelId = 'https://example.org/basyx-studio/time-series/sm/ClimateSensorTimeSeries'
const answers = []

function compose (...args) {
  return execFileSync('docker', ['compose', '-p', project, '-f', `${directory}/compose.yaml`, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function fail (message) {
  throw new Error(message)
}

function check (condition, message) {
  if (!condition) {
    fail(message)
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor (what, probe, seconds = 240) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 2) {
    if (await probe().catch(() => false)) {
      return
    }
    await sleep(2000)
  }
  fail(`${what} within ${seconds} s`)
}

let cookie = ''
let csrf = ''

async function call (method, path, body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Origin': base, 'X-CSRF-Token': csrf }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  answers.push(text)
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function read (installationId, targetId, params) {
  const { status, body } = await call('POST', '/app-calls', { installationId, targetId, method: 'studio.timeseries.read', params: { submodelId, time: 'Time', values: ['Temperature', 'Humidity'], ...params } })
  return { status, result: body?.result, problem: status >= 400 ? body : null }
}

function hours (count) {
  const stop = new Date()
  return { start: new Date(stop.getTime() - count * 3_600_000).toISOString(), stop: stop.toISOString() }
}

async function run () {
  console.log(`Starting the time series example with ${env.STUDIO_IMAGE}`)
  compose('up', '-d', '--quiet-pull')

  await waitFor('Studio did not become ready', async () => (await fetch(`${base}/health/ready`)).ok)
  await waitFor('The seed job did not finish', async () => {
    const [state] = compose('ps', '-a', '--format', '{{.State}} {{.ExitCode}}', 'seed').trim().split('\n')
    if (state?.startsWith('exited') && state !== 'exited 0') {
      fail(`The seed job failed: ${compose('logs', 'seed')}`)
    }
    return state === 'exited 0'
  })

  // An anonymous session, as a browser gets it with the first page.
  const page = await fetch(`${base}/`, { headers: { Accept: 'text/html' } })
  cookie = page.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
  const session = await call('GET', '/session')
  check(session.status === 200, `GET /session answered ${session.status}`)
  csrf = session.body.csrfToken

  const { body: { items: infrastructures } } = await call('GET', '/infrastructures')
  const infrastructure = infrastructures.find(item => item.name === 'Local BaSyx')
  check(infrastructure?.managed, 'the declared infrastructure is missing')
  const [connection] = infrastructure.connections
  check(connection?.key === 'influx' && connection.type === 'influxdb2', `the influxdb2 connection is missing: ${JSON.stringify(infrastructure.connections)}`)
  const { scheme, token: summary, ...other } = connection.auth
  check(scheme === 'token' && summary?.kind === 'file' && summary.ref === '/run/influx/read-token' && Object.keys(other).length === 0 && Object.keys(summary).length === 2, `the connection's auth is not a summary: ${JSON.stringify(connection.auth)}`)

  const tested = await call('POST', `/infrastructures/${infrastructure.id}/connections/influx/test`, {})
  check(tested.status === 200 && tested.body.ok, `Test connection failed: ${JSON.stringify(tested.body)}`)
  console.log(`Test connection: ${tested.body.checks.map(item => `${item.check} ${item.ok ? 'ok' : 'failed'}`).join(', ')}`)

  const { body: { items: apps } } = await call('GET', '/app-installations')
  const app = apps.find(item => item.appId === 'org.eclipse.basyx.studio.time-series')
  check(app?.bundled && app.permissions.includes('studio.timeseries.read'), 'the bundled Time Series Data app is not installed')

  // The sensor writes every two seconds and wrote an hour of history at start.
  const linked = await read(app.id, infrastructure.id, { segment: 'LinkedSegment', range: { ...hours(1), anchor: 'fixed' } })
  check(linked.status === 200, `the LinkedSegment read failed: ${JSON.stringify(linked.problem)}`)
  check(linked.result.kind === 'linked', 'the LinkedSegment was not read as linked')
  const [temperature, humidity] = linked.result.series
  check(temperature.unit === '°C' && humidity.unit === '%', `units are missing: ${temperature.unit}, ${humidity.unit}`)
  check(temperature.points.length > 100 && humidity.points.length > 100, `too few points: ${temperature.points.length}, ${humidity.points.length}`)
  console.log(`LinkedSegment: ${temperature.points.length} temperature and ${humidity.points.length} humidity points`)

  const internal = await read(app.id, infrastructure.id, { segment: 'InternalSegment', range: { ...hours(1), anchor: 'latest' } })
  check(internal.status === 200 && internal.result.series.every(series => series.points.length === 12), `the InternalSegment read failed: ${JSON.stringify(internal.problem ?? internal.result)}`)
  check(internal.result.range.stop === '2026-10-19T12:00:00.000Z', `the relative range did not move to the latest record: ${JSON.stringify(internal.result.range)}`)

  const external = await read(app.id, infrastructure.id, { segment: 'ExternalSegment', range: { ...hours(1), anchor: 'latest' } })
  check(external.status === 200 && external.result.series.every(series => series.points.length === 60), `the ExternalSegment read failed: ${JSON.stringify(external.problem ?? external.result)}`)
  console.log('InternalSegment: 12 records; ExternalSegment: 60 CSV rows')

  const foreign = await read(app.id, infrastructure.id, { segment: 'LinkedSegment', values: ['Pressure'], range: hours(1) })
  check(foreign.status === 422 && foreign.problem.code === 'timeseries_invalid', `a record outside the metadata was not refused: ${foreign.status}`)

  const token = compose('exec', '-T', 'studio', 'cat', '/run/influx/read-token').trim()
  check(token.length > 20, 'the read token could not be read')
  check(!answers.some(answer => answer.includes(token)), 'an answer of Studio contains the database token')
  check(!compose('logs', '--no-color', 'studio').includes(token), 'Studio\'s log contains the database token')
  console.log('The database token is in no answer and no log line')
}

let failed = false
try {
  await run()
  console.log(`OK: the time series example works with ${env.STUDIO_IMAGE}`)
} catch (error) {
  failed = true
  console.error(`FAIL: ${error.message}`)
  try {
    console.error(compose('logs', '--no-color', '--tail', '80', 'studio'))
  } catch {
    // The stack did not start far enough to have logs.
  }
} finally {
  if (process.env.KEEP_STACK !== '1') {
    compose('down', '-v', '--remove-orphans')
  }
}
process.exitCode = failed ? 1 : 0
