import type { Connection } from '#shared/contract'
import type { AddressInfo } from 'node:net'
import type { DatabaseHandle } from '~~/server/lib/database/client'
import type { Actor, StudioDeps } from '~~/server/lib/deps'
import type { InfrastructureRecord } from '~~/server/lib/infrastructures'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { auditEvents, infrastructures, studioSessions, targetCredentials } from '~~/server/database/schema'
import { loadStudioConfig } from '~~/server/lib/config'
import { authHeaders } from '~~/server/lib/connections/auth'
import { openConnection } from '~~/server/lib/connections/client'
import { influxQueryParameters, runFluxQuery } from '~~/server/lib/connections/influxdb2'
import { connectionFor } from '~~/server/lib/connections/registry'
import { testConnection } from '~~/server/lib/connections/test'
import { SecretCipher } from '~~/server/lib/crypto/cipher'
import { openDatabase } from '~~/server/lib/database/client'
import { applyMigrations, loadMigrationsFromDirectory } from '~~/server/lib/database/migrate'
import { forgetOidcClients, tokenAudiences } from '~~/server/lib/oidc/client'
import { CredentialBroker } from '~~/server/lib/targets/credentials'

const migrationsDirectory = new URL('../../server/database/migrations', import.meta.url).pathname

/** An unsigned JWT with the given claims; Studio reads, but never verifies, the tokens it got from the IdP. */
function jwt (claims: Record<string, unknown>): string {
  return ['{"alg":"none"}', JSON.stringify(claims)].map(part => Buffer.from(part).toString('base64url')).join('.') + '.signature'
}

interface Recorded {
  path: string
  method: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

/** A local HTTP server that records requests and answers them with a handler. */
async function fakeService (handler: (request: Recorded, base: string) => { status?: number, headers?: Record<string, string>, body?: string }) {
  const requests: Recorded[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      const recorded = { path: req.url!, method: req.method!, headers: req.headers, body }
      requests.push(recorded)
      const answer = handler(recorded, base)
      res.writeHead(answer.status ?? 200, { 'Content-Type': 'application/json', ...answer.headers })
      res.end(answer.body ?? '')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { base, requests, close: () => new Promise(resolve => server.close(resolve)) }
}

describe('authentication headers', () => {
  it('sends each scheme\'s secret as the scheme says', () => {
    expect(authHeaders({ scheme: 'none' }, undefined)).toEqual({})
    expect(authHeaders({ scheme: 'token', token: null }, 's')).toEqual({ Authorization: 'Token s' })
    expect(authHeaders({ scheme: 'bearer', token: null }, 's')).toEqual({ Authorization: 'Bearer s' })
    expect(authHeaders({ scheme: 'header', name: 'X-Api-Key', value: null }, 's')).toEqual({ 'X-Api-Key': 's' })
    expect(authHeaders({ scheme: 'basic', username: 'reader', password: null }, 'pä:ss')).toEqual({ Authorization: `Basic ${Buffer.from('reader:pä:ss').toString('base64')}` })
    expect(authHeaders({ scheme: 'delegatedUser', audience: 'a', scopes: [], forwardUserToken: false }, undefined, 't')).toEqual({ Authorization: 'Bearer t' })
  })

  it('reads the audiences of JWTs only', () => {
    expect(tokenAudiences(jwt({ aud: 'imports' }))).toEqual(['imports'])
    expect(tokenAudiences(jwt({ aud: ['account', 'imports'] }))).toEqual(['account', 'imports'])
    expect(tokenAudiences(jwt({}))).toEqual([])
    expect(tokenAudiences('opaque-token')).toBeNull()
  })
})

describe('connections in use', () => {
  let handle: DatabaseHandle
  let deps: StudioDeps
  let broker: CredentialBroker
  let idp: Awaited<ReturnType<typeof fakeService>>
  let influx: Awaited<ReturnType<typeof fakeService>>
  let influxAnswer: { status?: number, headers?: Record<string, string>, body?: string } | null = null
  const sessionId = 'session-1'
  const actor = { subject: 'admin', name: 'Admin', roles: [], isAdmin: true, sessionId } as Actor
  const userToken = jwt({ sub: 'alice', aud: ['account', 'imports'] })

  beforeAll(async () => {
    handle = await openDatabase({ kind: 'memory' })
    await applyMigrations(handle.db, await loadMigrationsFromDirectory(migrationsDirectory))
    idp = await fakeService((request, base) => {
      if (request.path === '/.well-known/openid-configuration') {
        return { body: JSON.stringify({ issuer: base, token_endpoint: `${base}/token`, authorization_endpoint: `${base}/auth`, jwks_uri: `${base}/jwks`, response_types_supported: ['code'] }) }
      }
      const form = new URLSearchParams(request.body)
      if (form.get('grant_type') === 'client_credentials') {
        return form.get('client_secret') === 'cc-secret'
          ? { body: JSON.stringify({ access_token: `cc-token-${form.get('audience')}`, token_type: 'Bearer', expires_in: 300 }) }
          : { status: 401, body: JSON.stringify({ error: 'invalid_client' }) }
      }
      if (form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:token-exchange') {
        return { body: JSON.stringify({ access_token: `exchanged-for-${form.get('audience')}`, issued_token_type: 'urn:ietf:params:oauth:token-type:access_token', token_type: 'Bearer', expires_in: 300 }) }
      }
      return { status: 400, body: JSON.stringify({ error: 'unsupported_grant_type' }) }
    })
    influx = await fakeService(request => {
      if (influxAnswer) {
        return influxAnswer
      }
      if (request.headers.authorization !== 'Token influx-secret' && request.path !== '/health') {
        return { status: 401, body: JSON.stringify({ code: 'unauthorized', message: 'unauthorized access' }) }
      }
      if (request.path === '/health') {
        return { body: JSON.stringify({ status: 'pass' }) }
      }
      return { headers: { 'Content-Type': 'text/csv' }, body: ',result,table,_time,_value,_field\n,_result,0,2026-05-13T19:15:53Z,1.5,Temperature\n' }
    })
  })

  beforeEach(async () => {
    influxAnswer = null
    idp.requests.length = 0
    influx.requests.length = 0
    forgetOidcClients()
    await handle.db.delete(infrastructures)
    await handle.db.delete(studioSessions)
    await handle.db.delete(auditEvents)
    const config = loadStudioConfig({
      STUDIO_PUBLIC_URL: 'https://studio.example.org',
      STUDIO_DATA_KEY: randomBytes(32).toString('base64url'),
      STUDIO_OIDC_ISSUER: 'https://idp.example.org/realms/x',
      STUDIO_OIDC_CLIENT_ID: 'studio',
      STUDIO_PRIVATE_NETWORK_TARGETS: 'allow',
    }, 'hosted')
    deps = { config, db: handle.db, cipher: new SecretCipher(config.dataKey) }
    broker = new CredentialBroker(deps)
    await handle.db.insert(studioSessions).values({ id: sessionId, subject: 'alice', displayName: 'Alice', roles: [], csrfToken: 'c' })
  })

  afterAll(async () => {
    await idp.close()
    await influx.close()
    await handle.close()
  })

  async function insert (security: InfrastructureRecord['security'], connections: Connection[]): Promise<InfrastructureRecord> {
    const [record] = await handle.db.insert(infrastructures).values({
      id: 'plant',
      name: 'Plant',
      template: 'mono-all',
      endpoints: [{ type: 'aasEnvironment', url: 'http://127.0.0.1:1' }],
      security,
      connections,
      allowPrivateNetwork: true,
      createdBy: 'test',
    }).returning()
    return record!
  }

  const influxConnection = (url = influx.base): Connection => ({
    key: 'influx',
    type: 'influxdb2',
    url,
    aliases: ['http://localhost:8086'],
    allowPrivateNetwork: true,
    auth: { scheme: 'token', token: { kind: 'env', ref: 'AUTH_TEST_INFLUX_TOKEN' } },
    settings: { organization: 'basyx' },
  })

  it('tests a connection without revealing its token, and audits the test', async () => {
    process.env.AUTH_TEST_INFLUX_TOKEN = 'influx-secret'
    const record = await insert({ mode: 'unsecured' }, [influxConnection()])
    const result = await testConnection(deps, broker, record, 'influx', actor, 'r1')
    expect(result.ok).toBe(true)
    expect(result.checks.map(check => [check.check, check.ok])).toEqual([['token', true], ['health', true], ['query', true]])
    const query = influx.requests.find(request => request.path.startsWith('/api/v2/query'))!
    expect(query).toMatchObject({ method: 'POST', path: '/api/v2/query?org=basyx', body: 'buckets() |> limit(n: 1)' })
    expect(query.headers).toMatchObject({ 'authorization': 'Token influx-secret', 'content-type': 'application/vnd.flux', 'accept': 'application/csv' })

    process.env.AUTH_TEST_INFLUX_TOKEN = 'wrong'
    const refused = await testConnection(deps, broker, record, 'influx', actor, 'r2')
    expect(refused.ok).toBe(false)
    expect(refused.checks.at(-1)).toMatchObject({ check: 'query', ok: false, status: 401 })
    expect(JSON.stringify(refused)).not.toContain('wrong')

    const audits = await handle.db.select().from(auditEvents)
    expect(audits.map(audit => [audit.action, audit.outcome, audit.details.connection])).toEqual([['connection.test', 'success', 'influx'], ['connection.test', 'failure', 'influx']])
    expect(JSON.stringify(audits)).not.toContain('influx-secret')
    delete process.env.AUTH_TEST_INFLUX_TOKEN
  })

  it('tests an edited connection with the stored secret', async () => {
    process.env.AUTH_TEST_INFLUX_TOKEN = 'influx-secret'
    const record = await insert({ mode: 'unsecured' }, [influxConnection('http://127.0.0.1:1')])
    const edited = { key: 'influx', type: 'influxdb2', url: influx.base, allowPrivateNetwork: true, auth: { scheme: 'token' }, settings: { organization: 'basyx' } }
    expect((await testConnection(deps, broker, record, 'influx', actor, 'r1', edited)).ok).toBe(true)
    await expect(testConnection(deps, broker, record, 'other', actor, 'r2', { ...edited, key: 'other' })).rejects.toMatchObject({ code: 'invalid_request' })
    delete process.env.AUTH_TEST_INFLUX_TOKEN
  })

  it('tests only the saved connection where the deployment fixes or manages the infrastructure', async () => {
    process.env.AUTH_TEST_INFLUX_TOKEN = 'influx-secret'
    // An edit keeps the stored secret, so it would send it to the edited URL.
    const edited = { key: 'influx', type: 'influxdb2', url: 'http://127.0.0.1:2', allowPrivateNetwork: true, auth: { scheme: 'token' }, settings: { organization: 'basyx' } }
    const record = await insert({ mode: 'unsecured' }, [influxConnection()])
    const managed = { ...record, managedKey: 'plant' }
    await expect(testConnection(deps, broker, managed, 'influx', actor, 'r1', edited)).rejects.toMatchObject({ code: 'forbidden' })
    const fixed = { ...deps, config: { ...deps.config, infrastructuresEditable: false } }
    await expect(testConnection(fixed, broker, record, 'influx', actor, 'r2', edited)).rejects.toMatchObject({ code: 'forbidden' })
    expect(influx.requests).toHaveLength(0)
    expect((await testConnection(deps, broker, managed, 'influx', actor, 'r3')).ok).toBe(true)
    expect((await testConnection(fixed, broker, record, 'influx', actor, 'r4')).ok).toBe(true)
    delete process.env.AUTH_TEST_INFLUX_TOKEN
  })

  it('sends queries to the configured URL only, never following redirects', async () => {
    process.env.AUTH_TEST_INFLUX_TOKEN = 'influx-secret'
    const connection = influxConnection()
    const record = await insert({ mode: 'unsecured' }, [connection])
    const endpoint = new URL('http://localhost:8086/api/v2/query?org=other&bucket=x')
    expect(connectionFor(record.connections, 'timeseries', endpoint)?.key).toBe('influx')
    expect(connectionFor(record.connections, 'timeseries', new URL('http://attacker.example.org/api/v2/query'))).toBeUndefined()
    expect(influxQueryParameters(connection as Extract<Connection, { type: 'influxdb2' }>, endpoint)).toEqual({ org: 'basyx' })
    expect(() => influxQueryParameters(connection as Extract<Connection, { type: 'influxdb2' }>, new URL('http://localhost:8086/api/v2/delete'))).toThrow(expect.objectContaining({ code: 'connection_request_refused' }))

    const client = await openConnection(deps, broker, record, connection, sessionId)
    expect(await runFluxQuery(client, 'from(bucket: "x")', { org: 'basyx' })).toContain('Temperature')

    influxAnswer = { status: 307, headers: { Location: 'http://attacker.example.org/collect' } }
    await expect(runFluxQuery(client, 'from(bucket: "x")', { org: 'basyx' })).rejects.toMatchObject({ code: 'connection_request_refused' })
    influxAnswer = { status: 400, body: JSON.stringify({ code: 'invalid', message: 'compilation failed' }) }
    await expect(runFluxQuery(client, 'from(', { org: 'basyx' })).rejects.toMatchObject({ code: 'connection_error', message: expect.stringContaining('compilation failed') })
    delete process.env.AUTH_TEST_INFLUX_TOKEN
  })

  it('gets client-credentials tokens from the issuer and caches them', async () => {
    process.env.AUTH_TEST_CLIENT_SECRET = 'cc-secret'
    const connection: Connection = {
      ...influxConnection(),
      auth: { scheme: 'oauth2ClientCredentials', issuer: idp.base, clientId: 'svc', clientSecret: { kind: 'env', ref: 'AUTH_TEST_CLIENT_SECRET' }, scopes: ['read'], audience: 'tsdb' },
    } as Connection
    const record = await insert({ mode: 'unsecured' }, [connection])
    const first = await openConnection(deps, broker, record, connection, sessionId)
    const second = await openConnection(deps, broker, record, connection, sessionId)
    expect([first.downstreamIdentity, second.downstreamIdentity]).toEqual(['client:svc', 'client:svc'])
    const tokenRequests = idp.requests.filter(request => request.path === '/token')
    expect(tokenRequests).toHaveLength(1)
    expect(Object.fromEntries(new URLSearchParams(tokenRequests[0]!.body))).toMatchObject({ grant_type: 'client_credentials', scope: 'read', audience: 'tsdb', client_id: 'svc' })

    process.env.AUTH_TEST_CLIENT_SECRET = 'wrong'
    await expect(openConnection(deps, broker, record, connection, sessionId, true)).rejects.toMatchObject({ code: 'connection_rejected' })
    delete process.env.AUTH_TEST_CLIENT_SECRET
  })

  it('passes the user\'s identity by token exchange, or forwards it only to its audience', async () => {
    const security: InfrastructureRecord['security'] = { mode: 'delegated_user', issuer: idp.base, clientId: 'studio-web', scopes: ['openid'], clientSecret: null, desktopLoopbackHost: '127.0.0.1' }
    const exchanged: Connection = { ...influxConnection(), auth: { scheme: 'delegatedUser', audience: 'imports', scopes: [], forwardUserToken: false } } as Connection
    const record = await insert(security, [exchanged])

    await expect(broker.connectionToken(record, exchanged, sessionId, undefined)).rejects.toMatchObject({ code: 'target_auth_required' })
    await handle.db.insert(targetCredentials).values({
      sessionId,
      targetId: record.id,
      accessTokenCiphertext: deps.cipher.encrypt(userToken, 'target_credentials.access_token'),
      accessTokenExpiresAt: new Date(Date.now() + 600_000),
      subject: 'alice',
    })

    expect(await broker.connectionToken(record, exchanged, sessionId, undefined)).toEqual({ token: 'exchanged-for-imports', downstreamIdentity: 'user:alice', delegation: 'exchanged' })
    const exchange = Object.fromEntries(new URLSearchParams(idp.requests.find(request => request.path === '/token')!.body))
    expect(exchange).toMatchObject({ subject_token: userToken, subject_token_type: 'urn:ietf:params:oauth:token-type:access_token', audience: 'imports', client_id: 'studio-web' })

    const forwarded = { ...exchanged, auth: { scheme: 'delegatedUser', audience: 'imports', scopes: [], forwardUserToken: true } } as Connection
    expect(await broker.connectionToken(record, forwarded, sessionId, undefined)).toEqual({ token: userToken, downstreamIdentity: 'user:alice', delegation: 'forwarded' })
    const elsewhere = { ...exchanged, auth: { scheme: 'delegatedUser', audience: 'billing', scopes: [], forwardUserToken: true } } as Connection
    await expect(broker.connectionToken(record, elsewhere, sessionId, undefined)).rejects.toMatchObject({ code: 'connection_request_refused' })

    const unsecured = { ...record, security: { mode: 'unsecured' } } as InfrastructureRecord
    await expect(broker.connectionToken(unsecured, exchanged, sessionId, undefined)).rejects.toMatchObject({ code: 'connection_request_refused' })
  })
})
