// Fleet Atlas backend: runs in Studio's backend runner, an isolated Deno
// process that reaches nothing but Studio's capability endpoint, with the
// rights of the user who calls it. It does the heavy lifting so the UI only
// renders: it reads every shell and its submodels and condenses them into
// twin digests, understands questions about the fleet, reads live values in
// bulk and applies fleet-wide fixes.

import { ask as parse } from './ask.js'
import { digest, submodelKind } from './digest.js'

/** Runs `task` over `items` with at most `limit` running at once. */
async function pool (items, limit, task) {
  const results = Array.from({ length: items.length })
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const loadedKinds = new Set(['nameplate', 'technical', 'carbon', 'documentation', 'hierarchy', 'operational'])

/**
 * Reads one page of shells and returns their digests. The UI calls it page by
 * page, so the map fills while the fleet is read and no call runs long.
 * @type {import('@basyx/studio-sdk/backend').BackendHandler<{ cursor?: string, limit?: number }>}
 */
export async function scan ({ cursor, limit = 12 } = {}, { studio }) {
  const page = await studio.call('studio.aas.listShells', { limit: Math.min(Math.max(limit, 1), 50), cursor })
  const twins = await pool(page.items, 6, async shell => {
    let submodels = []
    try {
      submodels = (await studio.call('studio.aas.listSubmodels', { shellId: shell.id })).items
    } catch {
      // A shell whose submodels cannot be listed still appears, without data.
    }
    const loaded = {}
    await pool(submodels.filter(item => item.status === 'available'), 4, async item => {
      const kind = submodelKind(item.semanticId, item.idShort)
      if (!loadedKinds.has(kind) || loaded[kind]) {
        return
      }
      try {
        loaded[kind] = await studio.call('studio.aas.getSubmodel', { submodelId: item.id })
      } catch {
        item.status = 'error'
      }
    })
    return digest(shell, submodels, loaded)
  })
  return { twins, nextCursor: page.page.nextCursor ?? null }
}

/** @type {import('@basyx/studio-sdk/backend').BackendHandler} */
export function ask (params) {
  return parse(params ?? {})
}

/**
 * Reads the current values of live signals, one request per submodel.
 * @type {import('@basyx/studio-sdk/backend').BackendHandler<{ submodelIds: string[] }>}
 */
export async function pulse ({ submodelIds = [] } = {}, { studio }) {
  const values = {}
  await pool([...new Set(submodelIds)].slice(0, 400), 8, async submodelId => {
    try {
      const submodel = await studio.call('studio.aas.getSubmodel', { submodelId })
      const visit = (elements, base) => {
        let index = 0
        for (const element of elements ?? []) {
          const path = base === null ? String(element.idShort) : (element.idShort ? `${base}.${element.idShort}` : `${base}[${index}]`)
          index++
          if (element.modelType === 'Property') {
            const value = Number(element.value)
            if (Number.isFinite(value)) {
              values[`${submodelId}#${path}`] = value
            }
          } else if (Array.isArray(element.value)) {
            visit(element.value, path)
          }
        }
      }
      visit(submodel.submodelElements, null)
    } catch {
      // Not readable right now: the UI keeps the last value.
    }
  })
  return { values, at: Date.now() }
}

/**
 * Sets the values of many elements at once (a fleet-wide fix). Each edit
 * reads the element's current revision first, so concurrent changes are not
 * overwritten silently; multi-language values are set in English.
 * @type {import('@basyx/studio-sdk/backend').BackendHandler<{ edits: Array<{ submodelId: string, idShortPath: string, value: string }> }>}
 */
export async function fix ({ edits = [] } = {}, { studio }) {
  const results = await pool(edits.slice(0, 500), 4, async edit => {
    try {
      const current = await studio.call('studio.aas.getElement', { submodelId: edit.submodelId, idShortPath: edit.idShortPath })
      const multiLanguage = current.value.modelType === 'MultiLanguageProperty'
      const existing = multiLanguage && Array.isArray(current.value.value) ? current.value.value.filter(entry => !entry.language?.startsWith('en')) : []
      const value = multiLanguage ? [{ language: 'en', text: String(edit.value) }, ...existing] : String(edit.value)
      await studio.call('studio.aas.setElementValue', { submodelId: edit.submodelId, idShortPath: edit.idShortPath, value, revision: current.revision })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
  return { results, applied: results.filter(result => result.ok).length }
}
