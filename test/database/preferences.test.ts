import type { DatabaseHandle } from '~~/server/lib/database/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDatabase } from '~~/server/lib/database/client'
import { applyMigrations, loadMigrationsFromDirectory } from '~~/server/lib/database/migrate'
import { getPreferences, savePreferences } from '~~/server/lib/preferences'
import { StudioProblem } from '~~/server/lib/problem'
import { defaultPreferences } from '#shared/contract'

const migrationsDirectory = new URL('../../server/database/migrations', import.meta.url).pathname

describe('user preferences', () => {
  let handle: DatabaseHandle

  beforeAll(async () => {
    handle = await openDatabase({ kind: 'memory' })
    await applyMigrations(handle.db, await loadMigrationsFromDirectory(migrationsDirectory))
  })

  afterAll(async () => {
    await handle.close()
  })

  it('returns defaults, stores per user, and replaces on save', async () => {
    const deps = { db: handle.db }
    expect(await getPreferences(deps, 'alice')).toEqual(defaultPreferences)
    await savePreferences(deps, 'alice', { recent: { t1: [{ key: 'a2V5', title: 'Motor' }] }, refreshIntervalSeconds: 10 })
    await savePreferences(deps, 'bob', { valueLanguage: 'de' })
    expect(await getPreferences(deps, 'alice')).toMatchObject({ recent: { t1: [{ key: 'a2V5', title: 'Motor' }] }, refreshIntervalSeconds: 10, valueLanguage: 'en' })
    expect(await getPreferences(deps, 'bob')).toMatchObject({ recent: {}, valueLanguage: 'de' })
    await savePreferences(deps, 'alice', { autoRefresh: true })
    expect(await getPreferences(deps, 'alice')).toMatchObject({ recent: {}, autoRefresh: true })
  })

  it('drops favorites stored by earlier versions', async () => {
    const deps = { db: handle.db }
    await savePreferences(deps, 'dave', { favorites: { t1: ['a2V5'] }, theme: 'light' })
    const stored = await getPreferences(deps, 'dave')
    expect(stored).toMatchObject({ theme: 'light' })
    expect(stored).not.toHaveProperty('favorites')
  })

  it('keeps recent shells stored before titles were remembered', async () => {
    const deps = { db: handle.db }
    await savePreferences(deps, 'carol', { recent: { t1: ['a2V5', { key: 'b3RoZXI', title: 'Other shell' }] }, theme: 'dark' })
    expect(await getPreferences(deps, 'carol')).toMatchObject({
      recent: { t1: [{ key: 'a2V5', title: null }, { key: 'b3RoZXI', title: 'Other shell' }] },
      theme: 'dark',
    })
  })

  it('rejects invalid values', async () => {
    await expect(savePreferences({ db: handle.db }, 'alice', { refreshIntervalSeconds: 0 })).rejects.toThrow(StudioProblem)
  })
})
