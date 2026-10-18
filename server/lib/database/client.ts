import type { StudioConfig } from '../config'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { mkdir } from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import * as schema from '../../database/schema'

export type StudioSchema = typeof schema
export type StudioDatabase = PgDatabase<PgQueryResultHKT, StudioSchema>

export interface DatabaseHandle {
  db: StudioDatabase
  close: () => Promise<void>
}

/**
 * Opens the Studio metadata database: a PostgreSQL server when a connection
 * URL is configured, otherwise an embedded PGlite data directory (ADR 0011).
 */
export async function openDatabase (database: StudioConfig['database'] | { kind: 'memory' }): Promise<DatabaseHandle> {
  if (database.kind === 'postgres') {
    const [{ Pool }, { drizzle }] = await Promise.all([import('pg'), import('drizzle-orm/node-postgres')])
    const pool = new Pool({ connectionString: database.url, max: 10 })
    return {
      db: drizzle(pool, { schema }) as unknown as StudioDatabase,
      close: () => pool.end(),
    }
  }

  const [{ PGlite }, { drizzle }] = await Promise.all([import('@electric-sql/pglite'), import('drizzle-orm/pglite')])
  // PGlite starts PostgreSQL with `-F` (fsync off) by default. Studio keeps
  // fsync on so committed metadata also survives OS crashes; measured cost is
  // negligible for Studio's write volume. Desktop metadata is small, so the
  // buffer pool is reduced from the 128 MB default.
  const startParams = [...PGlite.defaultStartParams.filter(param => param !== '-F'), '-c', 'shared_buffers=16MB']
  let client: InstanceType<typeof PGlite>
  if (database.kind === 'memory') {
    client = new PGlite({ startParams })
  } else {
    await mkdir(database.dataDir, { recursive: true })
    client = new PGlite(database.dataDir, { startParams })
  }
  await client.waitReady
  return {
    db: drizzle(client, { schema }) as unknown as StudioDatabase,
    close: () => client.close(),
  }
}

/** Whether the database answers a trivial query, for the readiness probe. */
export async function databaseReachable (db: StudioDatabase): Promise<boolean> {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}
