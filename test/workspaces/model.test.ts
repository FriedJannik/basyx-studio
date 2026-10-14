import type { JsonObject } from '~~/server/lib/aas/outline'
import type { BinaryContent } from '~~/server/lib/targets/aas-target'
import type { PackageFiles } from '~~/server/lib/workspaces/model'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { StudioProblem } from '~~/server/lib/problem'
import { WorkspaceModel } from '~~/server/lib/workspaces/model'

const fixture = () => JSON.parse(readFileSync(new URL('../../test-setup/fixtures/open/studio-edge-cases.json', import.meta.url), 'utf8')) as JsonObject
const edgeShell = 'urn:studio:test:aas:edge-cases'
const edgeSubmodel = 'urn:studio:test:sm:edge-cases'

function memoryFiles (): PackageFiles & { parts: Map<string, BinaryContent> } {
  const parts = new Map<string, BinaryContent>([['/aasx/files/manual.pdf', { bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf', fileName: 'manual.pdf' }]])
  return {
    parts,
    read: async path => parts.get(path) ?? null,
    write: async (fileName, file) => {
      const path = `/aasx-suppl/${fileName}`
      parts.set(path, file)
      return path
    },
    thumbnail: async () => null,
  }
}

describe('workspace model operations', () => {
  it('deletes a shell and marks the workspace as changed', () => {
    const model = new WorkspaceModel(fixture())
    model.deleteShell(edgeShell)
    expect(model.unsavedChanges).toBe(true)
    expect(() => model.shell(edgeShell)).toThrow(StudioProblem)
    expect(() => model.deleteShell(edgeShell)).toThrow(StudioProblem)
  })

  it('reads and replaces File contents based on the revision', async () => {
    const files = memoryFiles()
    const model = new WorkspaceModel(fixture(), files)
    const file = await model.attachment(edgeSubmodel, 'Manual')
    expect(file).toMatchObject({ contentType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) })

    const { revision } = model.element(edgeSubmodel, 'Manual')
    const replaced = await model.replaceAttachment(edgeSubmodel, 'Manual', { bytes: new Uint8Array([9]), contentType: 'text/plain', fileName: 'notes.txt' }, revision)
    expect(replaced.value).toMatchObject({ value: '/aasx-suppl/notes.txt', contentType: 'text/plain' })
    expect((await model.attachment(edgeSubmodel, 'Manual')).bytes).toEqual(new Uint8Array([9]))
    await expect(model.replaceAttachment(edgeSubmodel, 'Manual', { bytes: new Uint8Array([8]), contentType: 'text/plain', fileName: 'x' }, revision))
      .rejects
      .toMatchObject({ code: 'revision_conflict' })
    await expect(model.attachment(edgeSubmodel, 'SimpleString')).rejects.toMatchObject({ code: 'unsupported_operation' })
  })

  it('searches shells and elements locally and pages concept descriptions', () => {
    const model = new WorkspaceModel(fixture())
    expect(model.searchShells('edge', 5, undefined).items.map(shell => shell.idShort)).toEqual(['EdgeCasesShell'])
    expect(model.searchShells('edge assetKind=Type', 5, undefined).items).toEqual([])
    const elements = model.searchElements('simplestring', 5)
    expect(elements[0]).toMatchObject({ label: 'SimpleString', shellLabel: 'EdgeCasesShell', submodelLabel: 'EdgeCases' })

    const first = model.conceptDescriptions(1, undefined)
    expect(first.items.length).toBeLessThanOrEqual(1)
  })
})
