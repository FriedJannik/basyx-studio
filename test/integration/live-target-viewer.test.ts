import type { InfrastructureRecord } from '~~/server/lib/infrastructures'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { submodelChildren } from '~~/server/lib/aas/outline'
import { buildLevels } from '~~/server/lib/aas/tree'
import { LiveAasTarget } from '~~/server/lib/targets/live-target'
import { inspectEnvironment } from '~~/server/lib/workspaces/package'
import { policy, record } from '../support/live'
import { openTargetUrl, testenvAvailable } from '../support/testenv'

// The viewer operations of a live target against the open BaSyx Go AAS
// environment, which has history and the event feed enabled.

const edgeShell = 'urn:studio:test:aas:edge-cases'
const edgeSubmodel = 'urn:studio:test:sm:edge-cases'
const motorShell = 'urn:fraunhofer:iese:dte:aas:drivemotor-dm3000:001'
const motorAsset = 'urn:fraunhofer:iese:dte:asset:drivemotor-dm3000:serial-0042'
/**
 * A submodel only this file writes to. BaSyx Go shares one ETag per submodel,
 * so a File write in the edge-case submodel, which other test files change
 * at the same time, could lose every attempt to their writes.
 */
const attachmentSubmodel = 'urn:studio:test:sm:attachment-writes'
const encode = (id: string) => Buffer.from(id).toString('base64url')

/** The open target as an AAS environment, with the profiles its `/description` announces now. */
async function environmentRecord (): Promise<InfrastructureRecord> {
  const description = await (await fetch(`${openTargetUrl}/description`)).json() as { profiles: string[] }
  return {
    ...record(openTargetUrl, { mode: 'unsecured' }),
    template: 'mono-all',
    endpoints: [{ type: 'aasEnvironment', url: openTargetUrl }],
    serviceProfiles: { aasEnvironment: description.profiles },
  }
}

describe.runIf(testenvAvailable)('LiveAasTarget viewer operations', async () => {
  const environment = testenvAvailable ? await environmentRecord() : null
  const target = (endpoints: 'environment' | 'services' = 'environment') => new LiveAasTarget({
    record: endpoints === 'environment' ? environment! : record(openTargetUrl, { mode: 'unsecured' }),
    access: { accessToken: undefined, downstreamIdentity: null },
    policy: policy(openTargetUrl, { maxResponseBytes: 50_000_000 }),
    requestId: 'test-request',
    onUnauthorized: async () => {},
  })

  beforeAll(async () => {
    await fetch(`${openTargetUrl}/submodels/${encode(attachmentSubmodel)}`, { method: 'DELETE' })
    const created = await fetch(`${openTargetUrl}/submodels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelType: 'Submodel',
        id: attachmentSubmodel,
        idShort: 'AttachmentWrites',
        submodelElements: [{ modelType: 'File', idShort: 'Notes', contentType: 'text/plain' }],
      }),
    })
    expect(created.status).toBe(201)
  })

  afterAll(async () => {
    await fetch(`${openTargetUrl}/submodels/${encode(attachmentSubmodel)}`, { method: 'DELETE' })
  })

  it('offers history and the event feed as announced, and no sharing without ReBAC', () => {
    expect(target().capabilities).toMatchObject({ history: true, changeFeed: true, sharing: false })
    // The same server configured without its profiles offers neither.
    expect(target('services').capabilities).toMatchObject({ history: false, changeFeed: false })
  })

  it('offers environment-only operations only for an AAS environment', () => {
    expect(target().capabilities).toMatchObject({ export: true, upload: true, search: 'query', elementSearch: true })
    expect(target('services').capabilities).toMatchObject({ export: false, upload: false, search: 'filter', elementSearch: false })
  })

  it('searches shells and submodel elements', async () => {
    const elements = await target().searchElements('SimpleString', 5)
    expect(elements).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'SimpleString', shellLabel: 'EdgeCasesShell' })]))
    expect((await target().searchShells({ expression: 'EdgeCases' }, 5, undefined)).items.map(shell => shell.id)).toContain(edgeShell)
  })

  it('reads Blob values with the element', async () => {
    const blob = await target().element(edgeSubmodel, 'Thumbnail')
    expect(blob.value).toMatchObject({ modelType: 'Blob', contentType: 'text/plain', value: 'aGVsbG8gc3R1ZGlv' })
  })

  it('finds a shell by its global asset ID', async () => {
    expect((await target().lookupShells(motorAsset)).map(shell => shell.id)).toEqual([motorShell])
    expect(await target().lookupShells('urn:unknown:asset')).toEqual([])
  })

  it('reads thumbnails and attachments', async () => {
    const thumbnail = await target().thumbnail(motorShell)
    expect(thumbnail?.contentType).toMatch(/^image\//)
    expect(thumbnail!.bytes.length).toBeGreaterThan(100)
    expect(await target().thumbnail(edgeShell)).toBeNull()
  })

  it('replaces a File content based on the revision and serves it back', async () => {
    const live = target()
    const { revision } = await live.element(attachmentSubmodel, 'Notes')
    const snapshot = await live.replaceAttachment(attachmentSubmodel, 'Notes', { bytes: new TextEncoder().encode('studio test'), contentType: 'text/plain', fileName: 'notes.txt' }, revision)
    expect(snapshot.value).toMatchObject({ contentType: 'text/plain' })
    const file = await live.attachment(attachmentSubmodel, 'Notes')
    expect(new TextDecoder().decode(file.bytes)).toBe('studio test')
    await expect(live.replaceAttachment(attachmentSubmodel, 'Notes', { bytes: new Uint8Array([1]), contentType: 'text/plain', fileName: 'x.txt' }, revision))
      .rejects
      .toMatchObject({ code: 'revision_conflict' })
  })

  it('exports a shell as AASX and JSON, and uploads the JSON export again', async () => {
    const live = target()
    const aasx = await live.exportShell(edgeShell, 'aasx')
    expect(aasx.bytes.subarray(0, 2)).toEqual(new Uint8Array([0x50, 0x4B]))
    // BaSyx Go SNAPSHOT writes AAS 3.2 XML, which AAS Core 3.1 rejects; JSON passes.
    await expect(inspectEnvironment(aasx.bytes, 'aasx')).rejects.toMatchObject({ code: 'package_rejected' })
    const json = await live.exportShell(edgeShell, 'json')
    expect((await inspectEnvironment(json.bytes, 'json')).shellIds).toEqual([edgeShell])
    await live.upload({ ...json, contentType: 'application/json', fileName: 'edge-cases.json' })
    expect((await live.shell(edgeShell)).idShort).toBe('EdgeCasesShell')
  })

  it('reads a submodel as it was, and change events newest first', async () => {
    const live = target()
    const past = await live.submodelAt(edgeSubmodel, new Date().toISOString())
    expect(past.idShort).toBe('EdgeCases')
    expect(buildLevels(submodelChildren(past)).length).toBeGreaterThan(0)
    await expect(live.submodelAt(edgeSubmodel, '2000-01-01T00:00:00Z')).rejects.toMatchObject({ code: 'target_resource_not_found' })

    const changes = await live.changes({ limit: 5, subjects: [edgeSubmodel] })
    expect(changes.items.length).toBeGreaterThan(0)
    expect(changes.items.every(event => event.subject === edgeSubmodel)).toBe(true)
    const times = changes.items.map(event => event.time)
    expect(times).toEqual(times.toSorted().toReversed())
    expect((await live.changes({ limit: 5, after: changes.lastEventId!, subjects: [edgeSubmodel] })).items).toEqual([])
  })

  it('lists concept descriptions', async () => {
    const page = await target().conceptDescriptions(10, undefined)
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items[0]).toHaveProperty('preferredName')
  })

  it('explains that an operation without delegation cannot be invoked', async () => {
    await expect(target().invoke(edgeSubmodel, 'Calibrate', [{ idShort: 'Offset', value: '1' }], false))
      .rejects
      .toMatchObject({ code: 'unsupported_operation', detail: expect.stringContaining('invocationDelegation') })
  })

  it('deletes a shell and restores it from the fixture package', async () => {
    const live = target()
    const backup = new Uint8Array(await readFile(new URL('../../test-setup/fixtures/open/IESEDriveMotorDM3000.aasx', import.meta.url)))
    await live.deleteShell(motorShell)
    await expect(live.shell(motorShell)).rejects.toMatchObject({ code: 'target_resource_not_found' })
    await live.upload({ bytes: backup, contentType: 'application/aasx+xml', fileName: 'motor.aasx' })
    expect((await live.shell(motorShell)).id).toBe(motorShell)
  })
})

describe('upload checks', () => {
  it('rejects files that are not AAS content', async () => {
    await expect(inspectEnvironment(new TextEncoder().encode('{"not":"aas"'), 'json')).rejects.toMatchObject({ code: 'package_rejected' })
    await expect(inspectEnvironment(new Uint8Array([1, 2, 3]), 'aasx')).rejects.toMatchObject({ code: 'package_rejected' })
  })

  it('accepts the AASX fixture', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../../test-setup/fixtures/open/IESEDriveMotorDM3000.aasx', import.meta.url)))
    expect((await inspectEnvironment(bytes, 'aasx')).shellIds).toEqual([motorShell])
  })
})
