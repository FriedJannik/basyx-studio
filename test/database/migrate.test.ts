import type { DatabaseHandle } from '~~/server/lib/database/client'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '~~/server/lib/database/client'
import { applyMigrations, loadMigrationsFromDirectory } from '~~/server/lib/database/migrate'
import { testenvAvailable, testenvDatabaseUrl } from '../support/testenv'

const migrationsDirectory = new URL('../../server/database/migrations', import.meta.url).pathname

const engines = [
  { name: 'PGlite (in memory)', open: () => openDatabase({ kind: 'memory' }), enabled: true },
  { name: 'PostgreSQL 18 (test environment)', open: () => openDatabase({ kind: 'postgres', url: testenvDatabaseUrl }), enabled: testenvAvailable },
]

describe.each(engines)('migrations on $name', ({ open, enabled }) => {
  let handle: DatabaseHandle | undefined

  afterEach(async () => {
    await handle?.close()
  })

  it.runIf(enabled)('applies the migration chain once and is idempotent', async () => {
    handle = await open()
    const migrations = await loadMigrationsFromDirectory(migrationsDirectory)
    expect(migrations.length).toBeGreaterThan(0)

    // The PostgreSQL test database may already be migrated by an earlier run.
    await applyMigrations(handle.db, migrations)
    expect(await applyMigrations(handle.db, migrations)).toEqual([])

    const tables = await handle.db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables where table_schema = 'public' order by table_name`)
    expect(tables.rows.map(row => row.table_name)).toEqual(expect.arrayContaining([
      'audit_events',
      'infrastructures',
      'oidc_transactions',
      'studio_schema_migrations',
      'studio_sessions',
      'target_credentials',
    ]))
  })
})

describe('infrastructure templates (migration 0003)', () => {
  it('derives templates and renames the discovery endpoint of existing infrastructures', async () => {
    const handle = await openDatabase({ kind: 'memory' })
    try {
      const migrations = await loadMigrationsFromDirectory(migrationsDirectory)
      const before = migrations.findIndex(migration => migration.tag === '0003_infrastructure_templates')
      await applyMigrations(handle.db, migrations.slice(0, before))
      const insert = (id: string, endpoints: object) => handle.db.execute(sql`
        insert into infrastructures (id, name, endpoints, security, created_by)
        values (${id}, ${id}, ${JSON.stringify(endpoints)}::jsonb, '{"mode":"unsecured"}'::jsonb, 'test')`)
      await insert('services', [{ type: 'aasRepository', url: 'http://aas' }, { type: 'submodelRepository', url: 'http://sm' }])
      await insert('environment', [{ type: 'aasEnvironment', url: 'http://env' }])
      await insert('withDiscovery', [{ type: 'aasEnvironment', url: 'http://env' }, { type: 'discovery', url: 'http://discovery' }])

      await applyMigrations(handle.db, migrations)
      const rows = await handle.db.execute<{ id: string, template: string, list_source: string, endpoints: Array<{ type: string }> }>(sql`
        select id, template, list_source, endpoints from infrastructures order by id`)
      expect(rows.rows.map(row => [row.id, row.template, row.list_source, row.endpoints.map(endpoint => endpoint.type)])).toEqual([
        ['environment', 'mono-all', 'repository', ['aasEnvironment']],
        ['services', 'full', 'repository', ['aasRepository', 'submodelRepository']],
        ['withDiscovery', 'mono-repo', 'repository', ['aasEnvironment', 'aasDiscovery']],
      ])
    } finally {
      await handle.close()
    }
  })
})
