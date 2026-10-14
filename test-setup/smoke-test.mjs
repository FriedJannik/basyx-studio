// Smoke test for the local Studio test environment.
//
// Verifies that the targets, the OIDC provider configuration and the BaSyx
// access rules behave the way Studio development relies on. Uses only Node
// built-ins so it runs without installing anything.
//
// Run with: pnpm testenv:smoke

import { createHash, randomBytes } from 'node:crypto'

const issuer = 'http://keycloak.localhost:18080/realms/basyx-studio'
const openUrl = 'http://localhost:18081'
const securedUrl = 'http://localhost:18082'

const b64url = value => Buffer.from(value).toString('base64url')
const decodeJwt = token => JSON.parse(Buffer.from(token.split('.', 2)[1], 'base64url').toString())

const results = []
async function check (name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail })
  } catch (error) {
    results.push({ name, ok: false, detail: error.message })
  }
}

function expect (condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function get (url, token) {
  return request('GET', url, token)
}

async function request (method, url, token, { headers = {}, body: payload } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    redirect: 'manual',
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: response.status, body, headers: response.headers }
}

async function expectStatus (url, token, status) {
  const response = await get(url, token)
  expect(response.status === status, `expected HTTP ${status}, got ${response.status}`)
  return response
}

const idShorts = body => body.result.map(item => item.idShort).toSorted().join(', ')

// --- IdP ---------------------------------------------------------------------

const discovery = await (await fetch(`${issuer}/.well-known/openid-configuration`)).json()

async function tokenRequest (params) {
  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(`token request failed: ${body.error}: ${body.error_description}`)
  }
  return body
}

function userTokens (username, scope = 'openid basyx-api') {
  return tokenRequest({ grant_type: 'password', client_id: 'test-cli', username, password: username, scope })
}

function serviceTokens () {
  return tokenRequest({
    grant_type: 'client_credentials',
    client_id: 'studio-service',
    client_secret: 'studio-service-test-secret',
  })
}

await check('IdP discovery issuer matches the configured issuer', () => {
  expect(discovery.issuer === issuer, `issuer is ${discovery.issuer}`)
  expect(discovery.code_challenge_methods_supported?.includes('S256'), 'S256 PKCE not advertised')
  return discovery.issuer
})

const tokens = {}
for (const user of ['studio-admin', 'alice', 'dave', 'carol', 'bob']) {
  tokens[user] = (await userTokens(user)).access_token
}
const service = await serviceTokens()
tokens.service = service.access_token

await check('User access token is Entra-shaped (flat roles, BaSyx audience, sub)', () => {
  const claims = decodeJwt(tokens.alice)
  expect(claims.iss === issuer, `iss is ${claims.iss}`)
  expect([claims.aud].flat().includes('basyx-api'), `aud is ${JSON.stringify(claims.aud)}`)
  expect(Array.isArray(claims.roles) && claims.roles.includes('basyx-reader'), `roles is ${JSON.stringify(claims.roles)}`)
  expect(typeof claims.sub === 'string' && claims.sub.length > 0, 'sub missing')
  expect(claims.realm_access === undefined, 'Keycloak-specific realm_access present; Studio must not depend on it')
  return `aud=${claims.aud} roles=${claims.roles}`
})

await check('ID token carries roles for Studio authorization (studio-admin)', async () => {
  const { id_token: idToken } = await userTokens('studio-admin', 'openid')
  const claims = decodeJwt(idToken)
  expect(claims.roles?.includes('studio-admin'), `roles is ${JSON.stringify(claims.roles)}`)
  return `roles=${claims.roles}`
})

await check('BaSyx audience is only issued when the basyx-api scope is requested', async () => {
  const { access_token: accessToken } = await userTokens('alice', 'openid')
  const aud = [decodeJwt(accessToken).aud].flat()
  expect(!aud.includes('basyx-api'), `aud unexpectedly contains basyx-api: ${aud}`)
  return `aud=${JSON.stringify(decodeJwt(accessToken).aud)}`
})

await check('Client-credentials token for the Studio deployment identity', () => {
  const claims = decodeJwt(tokens.service)
  expect([claims.aud].flat().includes('basyx-api'), `aud is ${JSON.stringify(claims.aud)}`)
  expect(claims.roles?.includes('basyx-editor'), `roles is ${JSON.stringify(claims.roles)}`)
  expect(service.refresh_token === undefined, 'client credentials should not return a refresh token')
  return `azp=${claims.azp} roles=${claims.roles}`
})

async function authorizationStatus (clientId, redirectUri) {
  const verifier = randomBytes(32).toString('base64url')
  const url = new URL(discovery.authorization_endpoint)
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid basyx-api',
    state: randomBytes(8).toString('hex'),
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString()
  const response = await fetch(url, { redirect: 'manual' })
  const html = await response.text()
  return { status: response.status, loginPage: html.includes('kc-form-login') }
}

for (const port of [54_321, 61_234]) {
  await check(`Desktop client accepts loopback redirect on dynamic port ${port} (RFC 8252)`, async () => {
    const result = await authorizationStatus('studio-desktop', `http://127.0.0.1:${port}/api/studio/v1/auth/callback`)
    expect(result.status === 200 && result.loginPage, `HTTP ${result.status}, login page: ${result.loginPage}`)
    return 'login page shown'
  })
}

await check('Desktop client rejects a loopback redirect with a different path', async () => {
  const result = await authorizationStatus('studio-desktop', 'http://127.0.0.1:61234/somewhere-else')
  expect(result.status === 400, `HTTP ${result.status}`)
  return 'rejected'
})

await check('Web client accepts the dev/build callback and rejects other ports', async () => {
  const accepted = await authorizationStatus('studio-web', 'http://localhost:3000/api/studio/v1/auth/callback')
  const rejected = await authorizationStatus('studio-web', 'http://localhost:4000/api/studio/v1/auth/callback')
  expect(accepted.status === 200 && accepted.loginPage, `callback on :3000 gave HTTP ${accepted.status}`)
  expect(rejected.status === 400, `callback on :4000 gave HTTP ${rejected.status}`)
  return 'ok'
})

// --- Target "open" -------------------------------------------------------------

const edgeSm = b64url('urn:studio:test:sm:edge-cases')

await check('open: health', () => expectStatus(`${openUrl}/health`, undefined, 200).then(() => 'UP'))

await check('open: shell list is paged with a cursor', async () => {
  const first = (await expectStatus(`${openUrl}/shells?limit=25`, undefined, 200)).body
  expect(first.result.length === 25, `page 1 has ${first.result.length} shells`)
  const cursor = first.paging_metadata?.cursor
  expect(cursor, 'no cursor on page 1')
  let total = first.result.length
  let next = cursor
  let pages = 1
  while (next) {
    const page = (await expectStatus(`${openUrl}/shells?limit=25&cursor=${encodeURIComponent(next)}`, undefined, 200)).body
    total += page.result.length
    next = page.paging_metadata?.cursor
    pages += 1
    expect(pages < 20, 'paging does not terminate')
  }
  expect(total >= 62, `only ${total} shells in total`)
  return `${total} shells in ${pages} pages`
})

const pathCases = [
  ['Level1.Level2.Items%5B1%5D.Details.Deepest', 'deepest value of item 1'],
  ['Numbers%5B2%5D', '30'],
  ['NestedLists%5B1%5D%5B0%5D', 'c'],
  ['Name-With-Hyphen', 'idShort contains a hyphen'],
]
for (const [path, value] of pathCases) {
  await check(`open: idShortPath ${decodeURIComponent(path)}`, async () => {
    const { body } = await expectStatus(`${openUrl}/submodels/${edgeSm}/submodel-elements/${path}`, undefined, 200)
    expect(body.value === value, `value is ${JSON.stringify(body.value)}`)
    return 'ok'
  })
}

await check('open: operation with input/output/inoutput variables', async () => {
  const { body } = await expectStatus(`${openUrl}/submodels/${edgeSm}/submodel-elements/Calibrate`, undefined, 200)
  expect(body.inoutputVariables?.[0]?.value?.idShort === 'Settings', 'inoutput variable missing')
  return 'ok'
})

await check('open: dangling submodel reference resolves to 404', () =>
  expectStatus(`${openUrl}/submodels/${b64url('urn:studio:test:sm:missing')}`, undefined, 404).then(() => '404'))

await check('open: submodel elements carry a strong ETag', async () => {
  const { headers } = await expectStatus(`${openUrl}/submodels/${edgeSm}/submodel-elements/SimpleString`, undefined, 200)
  const etag = headers.get('etag')
  expect(etag && !etag.startsWith('W/'), `ETag is ${etag}`)
  return etag
})

const historyProfiles = [
  'https://admin-shell.io/aas/API/3/2/AssetAdministrationShellRepositoryServiceSpecification/SSP-006',
  'https://admin-shell.io/aas/API/3/2/SubmodelRepositoryServiceSpecification/SSP-007',
]
const eventFeedProfile = 'https://basyx.org/aas/API/3/2/EventFeed/1.0'

async function expectOptionalFeatures (url) {
  const { body } = await expectStatus(`${url}/description`, undefined, 200)
  const missing = [...historyProfiles, eventFeedProfile].filter(profile => !body.profiles?.includes(profile))
  expect(missing.length === 0, `missing profiles: ${missing.join(', ')}`)
  return 'history, event feed'
}

await check('open: /description announces history and the event feed', () => expectOptionalFeatures(openUrl))

await check('open: a submodel can be read as it was at a point in time', async () => {
  const date = new Date().toISOString()
  const { body } = await expectStatus(`${openUrl}/submodels/${edgeSm}/$history?date=${encodeURIComponent(date)}`, undefined, 200)
  expect(body.id === 'urn:studio:test:sm:edge-cases', `got ${body.id}`)
  return 'ok'
})

await check('open: the event feed lists events', async () => {
  const { body } = await expectStatus(`${openUrl}/events?limit=1`, undefined, 200)
  expect(Array.isArray(body.records), 'no records array')
  return `${body.records.length} event(s) on the first page`
})

// --- Target "secured" ----------------------------------------------------------

await check('secured: health without token', () => expectStatus(`${securedUrl}/health`, undefined, 200).then(() => 'UP'))
await check('secured: /description is public', () => expectStatus(`${securedUrl}/description`, undefined, 200).then(() => 'ok'))
await check('secured: anonymous shell list is denied with 403 (not 401)', () =>
  expectStatus(`${securedUrl}/shells`, undefined, 403).then(() => '403'))

await check('secured: token without BaSyx audience is rejected with 401', async () => {
  const { access_token: accessToken } = await userTokens('alice', 'openid')
  await expectStatus(`${securedUrl}/shells`, accessToken, 401)
  return '401'
})

const listExpectations = [
  ['studio-admin', 'SecuredInternalShell, SecuredPublicShell'],
  ['alice', 'SecuredInternalShell, SecuredPublicShell'],
  ['service', 'SecuredInternalShell, SecuredPublicShell'],
  ['carol', 'SecuredPublicShell'],
]
for (const [who, expected] of listExpectations) {
  await check(`secured: ${who} sees ${expected}`, async () => {
    const { body } = await expectStatus(`${securedUrl}/shells`, tokens[who], 200)
    expect(idShorts(body) === expected, `saw ${idShorts(body)}`)
    return 'ok'
  })
}

await check('secured: bob (no BaSyx role) is denied with 403', () =>
  expectStatus(`${securedUrl}/shells`, tokens.bob, 403).then(() => '403'))

await check('secured: carol sees both submodel refs of the public shell', async () => {
  const { body } = await expectStatus(`${securedUrl}/shells/${b64url('urn:studio:test:secured:aas:public')}/submodel-refs`, tokens.carol, 200)
  expect(body.result.length === 2, `saw ${body.result.length} refs`)
  return '2 refs'
})

await check('secured: carol may read the public nameplate', () =>
  expectStatus(`${securedUrl}/submodels/${b64url('urn:studio:test:secured:sm:public-nameplate')}`, tokens.carol, 200).then(() => '200'))

await check('secured: carol is denied the restricted submodel (partial access)', () =>
  expectStatus(`${securedUrl}/submodels/${b64url('urn:studio:test:secured:sm:restricted-costs')}`, tokens.carol, 403).then(() => '403'))

await check('secured: carol is denied the internal shell', () =>
  expectStatus(`${securedUrl}/shells/${b64url('urn:studio:test:secured:aas:internal')}`, tokens.carol, 403).then(() => '403'))

// Conditional writes. Rewriting the current value changes only the revision.
const serialNumber = `${securedUrl}/submodels/${b64url('urn:studio:test:secured:sm:public-nameplate')}/submodel-elements/SerialNumber`

await check('secured: dave (basyx-editor) updates a value with If-Match', async () => {
  const { headers } = await expectStatus(serialNumber, tokens.dave, 200)
  const etag = headers.get('etag')
  expect(etag, 'no ETag returned')
  const update = await request('PATCH', `${serialNumber}/$value`, tokens.dave, { headers: { 'If-Match': etag }, body: 'SEC-0001' })
  expect(update.status === 204, `expected HTTP 204, got ${update.status}`)
  expect(update.headers.get('etag') && update.headers.get('etag') !== etag, 'PATCH did not return a new ETag')
  return `${update.status}, new ETag`
})

await check('secured: a stale If-Match is rejected with 412', async () => {
  const update = await request('PATCH', `${serialNumber}/$value`, tokens.dave, { headers: { 'If-Match': '"0-00000000"' }, body: 'SEC-0001' })
  expect(update.status === 412, `expected HTTP 412, got ${update.status}`)
  return '412'
})

await check('secured: alice (basyx-reader) may not update values', async () => {
  const update = await request('PATCH', `${serialNumber}/$value`, tokens.alice, { body: 'SEC-0001' })
  expect(update.status === 403, `expected HTTP 403, got ${update.status}`)
  return '403'
})

await check('secured: /description announces history and the event feed', () => expectOptionalFeatures(securedUrl))

await check('secured: alice reads the history of the public nameplate', () =>
  expectStatus(`${securedUrl}/submodels/${b64url('urn:studio:test:secured:sm:public-nameplate')}/$history?date=${encodeURIComponent(new Date().toISOString())}`, tokens.alice, 200).then(() => '200'))

await check('secured: alice reads the event feed, bob is denied', async () => {
  await expectStatus(`${securedUrl}/events?limit=1`, tokens.alice, 200)
  await expectStatus(`${securedUrl}/events?limit=1`, tokens.bob, 403)
  return '200 / 403'
})

// --- Report ----------------------------------------------------------------------

const width = Math.max(...results.map(result => result.name.length))
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name.padEnd(width)}  ${result.detail ?? ''}`)
}
const failures = results.filter(result => !result.ok).length
console.log(`\n${results.length - failures}/${results.length} checks passed`)
if (failures > 0) {
  process.exitCode = 1
}
