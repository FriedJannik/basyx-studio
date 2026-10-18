import type { DatabaseHandle } from '~~/server/lib/database/client'
import type { Actor, StudioDeps } from '~~/server/lib/deps'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { infrastructures } from '~~/server/database/schema'
import { ConfigurationError, loadStudioConfig } from '~~/server/lib/config'
import { SecretCipher } from '~~/server/lib/crypto/cipher'
import { openDatabase } from '~~/server/lib/database/client'
import { applyMigrations, loadMigrationsFromDirectory } from '~~/server/lib/database/migrate'
import { analyzeInfrastructureFile, parseInfrastructureFile, parseInfrastructureSources } from '~~/server/lib/infrastructure-file'
import { deleteInfrastructure, exportInfrastructures, importInfrastructures, reconcileManagedInfrastructures, toInfrastructure, updateInfrastructure } from '~~/server/lib/infrastructures'
import { StudioProblem } from '~~/server/lib/problem'

const migrationsDirectory = new URL('../../server/database/migrations', import.meta.url).pathname

const env = {
  STUDIO_PUBLIC_URL: 'https://studio.example.org',
  STUDIO_DATA_KEY: randomBytes(32).toString('base64url'),
  STUDIO_OIDC_ISSUER: 'https://idp.example.org/realms/x',
  STUDIO_OIDC_CLIENT_ID: 'studio',
}

const admin: Actor = { subject: 'admin', name: 'Admin', roles: ['studio-admin'], isAdmin: true, sessionId: 's' } as Actor

const factory = `
version: 1
infrastructures:
  - key: factory-a
    name: Factory A
    template: mono-all
    endpoints:
      - { type: aasEnvironment, url: "https://basyx.example.org" }
    security:
      mode: deployment_client_credentials
      issuer: https://idp.example.org/realms/basyx
      clientId: studio
      scopes: [openid]
      clientSecret: { ref: "env:FACTORY_A_SECRET" }
  - key: lab
    name: Lab
    template: identifiable
    endpoints:
      - { type: aasRepository, url: "https://lab.example.org/aas" }
    security: { mode: unsecured }
`

describe('infrastructure file', () => {
  it('parses entries with their keys and the defaults of the API input', () => {
    const [first, second] = parseInfrastructureFile(factory, 'infrastructures.yaml')
    expect(first).toMatchObject({ key: 'factory-a', source: 'infrastructures.yaml', input: { name: 'Factory A', listSource: 'registry', allowPrivateNetwork: false } })
    expect(second?.input.security).toEqual({ mode: 'unsecured' })
  })

  it('treats an empty file as no infrastructures', () => {
    expect(parseInfrastructureFile('', 'empty.yaml')).toEqual([])
  })

  it('reports every problem with its place', () => {
    const broken = `
version: 2
extra: true
infrastructures:
  - key: Bad_Key
    name: X
    template: mono-all
    endpoints: [{ type: aasEnvironment, url: "ftp://x" }]
    security: { mode: unsecured }
    colour: blue
  - key: lab
    name: Lab
    template: identifiable
    endpoints: [{ type: aasRepository, url: "https://lab.example.org" }]
    security: { mode: unsecured }
  - key: lab
    name: Lab again
    template: identifiable
    endpoints: [{ type: aasRepository, url: "https://lab.example.org" }]
    security: { mode: unsecured }
`
    let message = ''
    try {
      parseInfrastructureFile(broken, 'broken.yaml')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError)
      message = (error as Error).message
    }
    expect(message).toContain('extra: unknown field')
    expect(message).toContain('version: must be 1')
    expect(message).toContain('infrastructures[0] (Bad_Key).key:')
    expect(message).toContain('infrastructures[0] (Bad_Key).colour: unknown field')
    expect(message).toContain('infrastructures[0] (Bad_Key).endpoints.0.url')
    expect(message).toContain('infrastructures[2] (lab).key: declared more than once')
  })

  it('names the line of a YAML syntax error', () => {
    expect(() => parseInfrastructureFile('version: 1\ninfrastructures: [', 'syntax.yaml')).toThrow(/syntax\.yaml: invalid YAML at line/)
  })

  it('rejects a key declared in two sources', () => {
    const lab = 'version: 1\ninfrastructures:\n  - { key: lab, name: Lab, template: identifiable, endpoints: [{ type: aasRepository, url: "https://lab.example.org" }], security: { mode: unsecured } }\n'
    expect(() => parseInfrastructureSources([{ source: 'a.yaml', text: lab }, { source: 'STUDIO_INFRASTRUCTURES', text: lab }])).toThrow(/declared in both a\.yaml and STUDIO_INFRASTRUCTURES/)
  })
})

describe('managed infrastructures', () => {
  let handle: DatabaseHandle
  let deps: StudioDeps

  beforeAll(async () => {
    handle = await openDatabase({ kind: 'memory' })
    await applyMigrations(handle.db, await loadMigrationsFromDirectory(migrationsDirectory))
  })

  beforeEach(async () => {
    await handle.db.delete(infrastructures)
    const config = loadStudioConfig(env, 'hosted')
    deps = { config, db: handle.db, cipher: new SecretCipher(config.dataKey) }
  })

  afterAll(async () => {
    await handle.close()
  })

  const declare = (text: string) => reconcileManagedInfrastructures(deps, parseInfrastructureFile(text, 'infrastructures.yaml'))
  const rows = () => handle.db.select().from(infrastructures)

  it('creates, keeps, updates in place and removes declared infrastructures', async () => {
    expect(await declare(factory)).toMatchObject({ created: ['factory-a', 'lab'], updated: [], removed: [] })
    const [created] = await handle.db.select().from(infrastructures).where(eq(infrastructures.managedKey, 'factory-a'))
    expect(created).toMatchObject({ createdBy: 'deployment', probedAt: null, revision: 1 })
    expect(toInfrastructure(created!).managed).toBe(true)

    expect(await declare(factory)).toMatchObject({ created: [], updated: [], unchanged: ['factory-a', 'lab'] })

    const renamed = factory.replace('name: Factory A', 'name: Factory A (line 3)')
    expect(await declare(renamed)).toMatchObject({ updated: ['factory-a'], unchanged: ['lab'] })
    const [updated] = await handle.db.select().from(infrastructures).where(eq(infrastructures.managedKey, 'factory-a'))
    expect(updated).toMatchObject({ id: created!.id, name: 'Factory A (line 3)', revision: 2 })

    expect((await declare('version: 1\ninfrastructures: []')).removed.toSorted()).toEqual(['factory-a', 'lab'])
    expect(await rows()).toEqual([])
  })

  it('never touches infrastructures made in Studio', async () => {
    await handle.db.insert(infrastructures).values({
      id: 'own',
      name: 'Own',
      endpoints: [{ type: 'aasRepository', url: 'https://own.example.org' }],
      security: { mode: 'unsecured' },
      createdBy: 'admin',
    })
    await declare(factory)
    await declare('')
    expect((await rows()).map(row => row.id)).toEqual(['own'])
  })

  it('changes nothing when one entry is invalid for this deployment', async () => {
    const withValue = factory.replace('clientSecret: { ref: "env:FACTORY_A_SECRET" }', 'clientSecret: { value: plain }')
    await expect(declare(withValue)).rejects.toThrow(/infrastructure factory-a: .*env: or file: references/)
    const privateTarget = factory.replace('security: { mode: unsecured }', 'security: { mode: unsecured }\n    allowPrivateNetwork: true')
    await expect(declare(privateTarget)).rejects.toThrow(/infrastructure lab: .*private-network/)
    expect(await rows()).toEqual([])
  })

  it('rejects changes to managed infrastructures and, when fixed, to all', async () => {
    await declare(factory)
    const [managed] = await handle.db.select().from(infrastructures).where(eq(infrastructures.managedKey, 'lab'))
    await expect(deleteInfrastructure(deps, admin, managed!.id, 'r1')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(updateInfrastructure(deps, admin, managed!.id, 1, {}, 'r2')).rejects.toBeInstanceOf(StudioProblem)

    deps = { ...deps, config: loadStudioConfig({ ...env, STUDIO_INFRASTRUCTURES_EDITABLE: 'false' }, 'hosted') }
    await handle.db.insert(infrastructures).values({ id: 'own', name: 'Own', endpoints: [{ type: 'aasRepository', url: 'https://own.example.org' }], security: { mode: 'unsecured' }, createdBy: 'admin' })
    await expect(deleteInfrastructure(deps, admin, 'own', 'r3')).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('export and import', () => {
  let handle: DatabaseHandle
  let deps: StudioDeps

  beforeAll(async () => {
    handle = await openDatabase({ kind: 'memory' })
    await applyMigrations(handle.db, await loadMigrationsFromDirectory(migrationsDirectory))
  })

  beforeEach(async () => {
    await handle.db.delete(infrastructures)
    const config = loadStudioConfig(env, 'hosted')
    deps = { config, db: handle.db, cipher: new SecretCipher(config.dataKey) }
    await reconcileManagedInfrastructures(deps, parseInfrastructureFile(factory, 'infrastructures.yaml'))
  })

  afterAll(async () => {
    await handle.close()
  })

  it('exports the file format, keeping references and leaving stored secrets out', async () => {
    await handle.db.insert(infrastructures).values({
      id: 'own',
      name: 'Own Thing',
      template: 'identifiable',
      endpoints: [{ type: 'aasRepository', url: 'https://own.example.org' }],
      security: { mode: 'delegated_user', issuer: 'https://idp.example.org/realms/x', clientId: 'studio', scopes: ['openid'], clientSecret: { kind: 'stored', ref: null }, desktopLoopbackHost: '127.0.0.1' },
      secretCiphertext: 'v1.never-exported',
      createdBy: 'admin',
    })
    const yaml = await exportInfrastructures(deps)
    expect(yaml).not.toContain('never-exported')
    expect(yaml).toContain('# clientSecret is stored in the Studio it was exported from')
    const analyzed = analyzeInfrastructureFile(yaml, { requireKey: true })
    expect(analyzed.problems).toEqual([])
    expect(analyzed.entries.map(entry => entry.key)).toEqual(['factory-a', 'lab', 'own-thing'])
    const declared = parseInfrastructureFile(factory, 'infrastructures.yaml')
    expect(analyzed.entries[0]!.input).toEqual(declared[0]!.input)
    expect(analyzed.entries[2]!.problems).toEqual([])
    expect(analyzed.entries[2]!.input?.security).not.toHaveProperty('clientSecret')

    await expect(exportInfrastructures(deps, ['own', 'missing'])).rejects.toMatchObject({ code: 'not_found' })
  })

  it('checks entries, reports name conflicts and imports them one by one', async () => {
    const yaml = `
version: 1
infrastructures:
  - name: Lab
    template: identifiable
    endpoints: [{ type: aasRepository, url: "https://lab.example.org/aas" }]
    security: { mode: unsecured }
  - name: Elsewhere
    template: identifiable
    endpoints: [{ type: aasRepository, url: "https://elsewhere.invalid" }]
    security: { mode: unsecured }
  - name: Broken
    template: identifiable
    endpoints: []
    security: { mode: unsecured }
`
    const checked = await importInfrastructures(deps, admin, { yaml, dryRun: true, resolutions: {} }, 'r1')
    expect(checked.entries.map(entry => [entry.name, entry.resolution, entry.problems.length > 0, entry.outcome])).toEqual([
      ['Lab', 'skip', false, null],
      ['Elsewhere', 'create', false, null],
      ['Broken', 'create', true, null],
    ])
    expect(checked.entries[0]!.conflict).toMatchObject({ name: 'Lab', managed: true })

    const replacing = await importInfrastructures(deps, admin, { yaml, dryRun: true, resolutions: { 0: 'replace' } }, 'r2')
    expect(replacing.entries[0]!.problems).toEqual(['A managed infrastructure cannot be replaced by an import.'])

    // The host does not resolve: saving fails for that entry only.
    const imported = await importInfrastructures(deps, admin, { yaml, dryRun: false, resolutions: {} }, 'r3')
    expect(imported.entries.map(entry => entry.outcome)).toEqual(['skipped', 'failed', 'failed'])
    expect(imported.entries[1]!.problems.join(' ')).toMatch(/elsewhere\.invalid/)

    expect((await importInfrastructures(deps, admin, { yaml: 'version: [', dryRun: true, resolutions: {} }, 'r4')).problems[0]).toMatch(/invalid YAML/)
  })

  it('refuses imports when the deployment fixes its infrastructures', async () => {
    deps = { ...deps, config: loadStudioConfig({ ...env, STUDIO_INFRASTRUCTURES_EDITABLE: 'false' }, 'hosted') }
    await expect(importInfrastructures(deps, admin, { yaml: 'version: 1', dryRun: true, resolutions: {} }, 'r5')).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('infrastructure settings', () => {
  it('reads the file and the inline YAML, and defaults to editable', () => {
    const config = loadStudioConfig({ ...env, STUDIO_INFRASTRUCTURES: 'version: 1' }, 'hosted')
    expect(config.managedInfrastructures).toEqual([{ source: 'STUDIO_INFRASTRUCTURES', text: 'version: 1' }])
    expect(config.infrastructuresEditable).toBe(true)
    expect(() => loadStudioConfig({ ...env, STUDIO_INFRASTRUCTURES_FILE: '/does/not/exist.yaml' }, 'hosted')).toThrow(/could not be read/)
  })
})
