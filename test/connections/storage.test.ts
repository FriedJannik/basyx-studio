import type { DatabaseHandle } from '~~/server/lib/database/client'
import type { StudioDeps } from '~~/server/lib/deps'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { infrastructures } from '~~/server/database/schema'
import { loadStudioConfig } from '~~/server/lib/config'
import { resolveConnectionSecret, storeConnections } from '~~/server/lib/connections/secrets'
import { SecretCipher } from '~~/server/lib/crypto/cipher'
import { openDatabase } from '~~/server/lib/database/client'
import { applyMigrations, loadMigrationsFromDirectory } from '~~/server/lib/database/migrate'
import { analyzeInfrastructureFile, parseInfrastructureFile } from '~~/server/lib/infrastructure-file'
import { exportInfrastructures, reconcileManagedInfrastructures, toInfrastructure } from '~~/server/lib/infrastructures'
import { connectionInputSchema, infrastructureInputSchema } from '#shared/contract'

const migrationsDirectory = new URL('../../server/database/migrations', import.meta.url).pathname

const env = {
  STUDIO_PUBLIC_URL: 'https://studio.example.org',
  STUDIO_DATA_KEY: randomBytes(32).toString('base64url'),
  STUDIO_OIDC_ISSUER: 'https://idp.example.org/realms/x',
  STUDIO_OIDC_CLIENT_ID: 'studio',
}

function depsFor (mode: 'hosted' | 'desktop', db: StudioDeps['db'] = undefined as never): StudioDeps {
  const config = loadStudioConfig({ ...env, STUDIO_PRIVATE_NETWORK_TARGETS: 'allow' }, mode)
  return { config, db, cipher: new SecretCipher(config.dataKey) }
}

function influx (auth: unknown, extra: Record<string, unknown> = {}) {
  return connectionInputSchema.parse({
    key: 'influx',
    type: 'influxdb2',
    url: 'http://influxdb:8086',
    aliases: ['http://localhost:8086'],
    auth,
    ...extra,
  })
}

describe('connection contract', () => {
  const infrastructure = (connections: unknown[]) => infrastructureInputSchema.safeParse({
    name: 'Plant',
    template: 'mono-all',
    endpoints: [{ type: 'aasEnvironment', url: 'http://aas-env:8081' }],
    security: { mode: 'unsecured' },
    connections,
  })
  const token = { scheme: 'token', token: { ref: 'env:INFLUX_TOKEN' } }

  it('fills the defaults and accepts what the adapter accepts', () => {
    expect(influx(token)).toEqual({
      key: 'influx',
      type: 'influxdb2',
      url: 'http://influxdb:8086',
      aliases: ['http://localhost:8086'],
      allowPrivateNetwork: false,
      auth: token,
      settings: {},
    })
  })

  it('refuses schemes the type does not accept, and URLs with credentials', () => {
    expect(connectionInputSchema.safeParse({ key: 'influx', type: 'influxdb2', url: 'http://influxdb:8086', auth: { scheme: 'bearer', token: { ref: 'env:X' } } }).error?.issues[0]).toMatchObject({ path: ['auth', 'scheme'], message: 'influxdb2 connections accept token' })
    expect(connectionInputSchema.safeParse({ key: 'influx', type: 'influxdb2', url: 'http://user:secret@influxdb:8086', auth: token }).success).toBe(false)
    expect(connectionInputSchema.safeParse({ key: 'influx', type: 'influxdb2', url: 'http://influxdb:8086?token=x', auth: token }).success).toBe(false)
    expect(connectionInputSchema.safeParse({ key: 'influx', type: 'influxdb2', url: 'http://influxdb:8086', auth: token, timeoutSeconds: 121 }).success).toBe(false)
  })

  it('refuses duplicate keys', () => {
    const duplicate = infrastructure([{ key: 'a', type: 'influxdb2', url: 'http://a:8086', auth: token }, { key: 'a', type: 'influxdb2', url: 'http://b:8086', auth: token }])
    expect(duplicate.error?.issues.map(issue => issue.message)).toContain('each connection key may occur only once')
  })

  it('accepts every authentication scheme of CON-007 in its shape', async () => {
    const { connectionAuthInputSchema } = await import('#shared/contract')
    for (const auth of [
      { scheme: 'none' },
      { scheme: 'token', token: { ref: 'env:A' } },
      { scheme: 'bearer', token: { ref: 'file:/run/secrets/a' } },
      { scheme: 'header', name: 'X-Api-Key', value: { ref: 'env:A' } },
      { scheme: 'basic', username: 'reader', password: { ref: 'env:A' } },
      { scheme: 'oauth2ClientCredentials', issuer: 'https://idp.example.org/realms/x', clientId: 'svc', clientSecret: { ref: 'env:A' }, scopes: ['read'], audience: 'imports' },
      { scheme: 'delegatedUser', audience: 'imports' },
    ]) {
      expect(connectionAuthInputSchema.safeParse(auth).success, auth.scheme).toBe(true)
    }
    expect(connectionAuthInputSchema.safeParse({ scheme: 'header', name: 'Host', value: { ref: 'env:A' } }).success).toBe(false)
    expect(connectionAuthInputSchema.safeParse({ scheme: 'basic', username: 'a:b', password: { ref: 'env:A' } }).success).toBe(false)
    expect(connectionAuthInputSchema.parse({ scheme: 'delegatedUser', audience: 'imports' })).toEqual({ scheme: 'delegatedUser', audience: 'imports', scopes: [], forwardUserToken: false })
  })
})

describe('connection secrets', () => {
  it('keeps references as summaries and refuses values when hosted', async () => {
    const deps = depsFor('hosted')
    const stored = storeConnections(deps, [influx({ scheme: 'token', token: { ref: 'env:STORAGE_TEST_TOKEN' } })])
    expect(stored.connections[0]!.auth).toEqual({ scheme: 'token', token: { kind: 'env', ref: 'STORAGE_TEST_TOKEN' } })
    expect(stored.connectionSecretsCiphertext).toBeNull()

    process.env.STORAGE_TEST_TOKEN = 'influx-secret'
    expect(await resolveConnectionSecret(deps, stored, stored.connections[0]!)).toBe('influx-secret')
    delete process.env.STORAGE_TEST_TOKEN
    await expect(resolveConnectionSecret(deps, stored, stored.connections[0]!)).rejects.toMatchObject({ code: 'connection_credentials_unavailable' })

    expect(() => storeConnections(deps, [influx({ scheme: 'token', token: { value: 'plain' } })])).toThrow(expect.objectContaining({
      violations: [{ path: 'connections.0.auth.token', message: expect.stringContaining('env: or file: references') }],
    }))
  })

  it('stores desktop values encrypted, keeps them when omitted, and asks again when the scheme or key changes', async () => {
    const deps = depsFor('desktop')
    const first = storeConnections(deps, [influx({ scheme: 'token', token: { value: 'influx-secret' } })])
    expect(first.connections[0]!.auth).toEqual({ scheme: 'token', token: { kind: 'stored', ref: null } })
    expect(first.connectionSecretsCiphertext).not.toContain('influx-secret')
    expect(await resolveConnectionSecret(deps, first, first.connections[0]!)).toBe('influx-secret')

    const kept = storeConnections(deps, [influx({ scheme: 'token' }, { url: 'http://influx2:8086' })], first)
    expect(kept.connections[0]).toMatchObject({ url: 'http://influx2:8086', auth: { token: { kind: 'stored' } } })
    expect(await resolveConnectionSecret(deps, kept, kept.connections[0]!)).toBe('influx-secret')

    const renamed = connectionInputSchema.parse({ key: 'other', type: 'influxdb2', url: 'http://influxdb:8086', auth: { scheme: 'token' } })
    expect(() => storeConnections(deps, [renamed], first)).toThrow(expect.objectContaining({ violations: [{ path: 'connections.0.auth.token', message: 'required' }] }))
    // Removing the connection removes its secret.
    expect(storeConnections(deps, [], first).connectionSecretsCiphertext).toBeNull()
  })
})

describe('declared connections, export and import', () => {
  let handle: DatabaseHandle
  let deps: StudioDeps

  beforeAll(async () => {
    handle = await openDatabase({ kind: 'memory' })
    await applyMigrations(handle.db, await loadMigrationsFromDirectory(migrationsDirectory))
  })

  beforeEach(async () => {
    await handle.db.delete(infrastructures)
    deps = depsFor('hosted', handle.db)
  })

  afterAll(async () => {
    await handle.close()
  })

  const plant = `
version: 1
infrastructures:
  - key: plant
    name: Plant
    template: mono-all
    endpoints:
      - { type: aasEnvironment, url: http://aas-env:8081 }
    security: { mode: unsecured }
    allowPrivateNetwork: true
    connections:
      - key: influx
        type: influxdb2
        url: http://influxdb:8086
        aliases: [http://localhost:8086]
        auth: { scheme: token, token: { ref: env:STUDIO_PLANT_INFLUX_TOKEN } }
        settings: { organization: basyx }
        allowPrivateNetwork: true
`

  it('applies connections of the deployment\'s file and returns summaries only', async () => {
    expect(await reconcileManagedInfrastructures(deps, parseInfrastructureFile(plant, 'infrastructures.yaml'))).toMatchObject({ created: ['plant'] })
    const [record] = await handle.db.select().from(infrastructures)
    expect(toInfrastructure(record!).connections).toEqual([{
      key: 'influx',
      type: 'influxdb2',
      url: 'http://influxdb:8086',
      aliases: ['http://localhost:8086'],
      allowPrivateNetwork: true,
      auth: { scheme: 'token', token: { kind: 'env', ref: 'STUDIO_PLANT_INFLUX_TOKEN' } },
      settings: { organization: 'basyx' },
    }])
    const changed = plant.replace('organization: basyx', 'organization: plant')
    expect(await reconcileManagedInfrastructures(deps, parseInfrastructureFile(changed, 'infrastructures.yaml'))).toMatchObject({ updated: ['plant'] })
  })

  it('reports unknown fields and invalid connections with their place', () => {
    const broken = plant.replace('type: influxdb2', 'type: influxdb2\n        colour: blue').replace('scheme: token', 'scheme: bearer')
    const [entry] = analyzeInfrastructureFile(broken, { requireKey: true }).entries
    expect(entry!.problems.join('; ')).toMatch(/connections\.0/)
  })

  it('exports references and leaves stored secrets out with a note', async () => {
    await reconcileManagedInfrastructures(deps, parseInfrastructureFile(plant, 'infrastructures.yaml'))
    const desktop = depsFor('desktop', handle.db)
    const stored = storeConnections(desktop, [influx({ scheme: 'token', token: { value: 'never-exported' } })])
    await handle.db.insert(infrastructures).values({
      id: 'own',
      name: 'Own',
      template: 'mono-all',
      endpoints: [{ type: 'aasEnvironment', url: 'http://localhost:8081' }],
      security: { mode: 'unsecured' },
      ...stored,
      createdBy: 'admin',
    })
    const yaml = await exportInfrastructures(deps)
    expect(yaml).not.toContain('never-exported')
    expect(yaml).toContain('ref: env:STUDIO_PLANT_INFLUX_TOKEN')
    expect(yaml).toContain('connections influx: auth.token is stored in the Studio it was exported from')

    const analyzed = analyzeInfrastructureFile(yaml, { requireKey: true })
    expect(analyzed.problems).toEqual([])
    const [own, plantEntry] = analyzed.entries
    expect(plantEntry!.input?.connections[0]?.auth).toEqual({ scheme: 'token', token: { ref: 'env:STUDIO_PLANT_INFLUX_TOKEN' } })
    // The import parses, and saving asks for the missing token.
    expect(own!.input?.connections[0]?.auth).toEqual({ scheme: 'token' })
    expect(() => storeConnections(deps, own!.input!.connections)).toThrow(expect.objectContaining({ violations: [{ path: 'connections.0.auth.token', message: 'required' }] }))
  })
})
