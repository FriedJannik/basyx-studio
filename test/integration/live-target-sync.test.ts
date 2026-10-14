import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LiveAasTarget } from '~~/server/lib/targets/live-target'
import { defaultSyncSettings } from '#shared/contract'
import { policy, record } from '../support/live'
import { openTargetUrl, testenvAvailable } from '../support/testenv'

// Registry and discovery sync by Studio (MVP-4 plan, I5) against the open
// BaSyx Go AAS environment. It keeps its registries and discovery in step
// itself, so the test removes the server's entries first and then checks
// Studio's.

const shellId = 'urn:studio:test:aas:sync-by-studio'
const assetId = 'urn:studio:test:asset:sync-by-studio'
const edgeSubmodel = 'urn:studio:test:sm:edge-cases'
const encode = (id: string) => Buffer.from(id).toString('base64url')
const plan = { registry: true, discovery: true }

const target = new LiveAasTarget({
  record: {
    ...record(openTargetUrl, { mode: 'unsecured' }),
    template: 'mono-all',
    endpoints: [{ type: 'aasEnvironment', url: openTargetUrl }],
    sync: { ...defaultSyncSettings, serverSyncsRegistry: false, serverSyncsDiscovery: false },
  },
  access: { accessToken: undefined, downstreamIdentity: null },
  policy: policy(openTargetUrl),
  requestId: 'test-request',
  onUnauthorized: async () => {},
})

async function descriptor () {
  const response = await fetch(`${openTargetUrl}/shell-descriptors/${encode(shellId)}`)
  return response.ok ? await response.json() as { endpoints: Array<{ protocolInformation: { href: string } }> } : null
}

async function assetLinks () {
  const response = await fetch(`${openTargetUrl}/lookup/shells/${encode(shellId)}`)
  return response.ok ? await response.json() as Array<{ name: string, value: string }> : []
}

describe.runIf(testenvAvailable)('LiveAasTarget registry and discovery sync', () => {
  beforeAll(async () => {
    await fetch(`${openTargetUrl}/shells/${encode(shellId)}`, { method: 'DELETE' })
    const created = await fetch(`${openTargetUrl}/shells`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelType: 'AssetAdministrationShell',
        id: shellId,
        idShort: 'SyncByStudio',
        assetInformation: { assetKind: 'Instance', globalAssetId: assetId },
        submodels: [{ type: 'ModelReference', keys: [{ type: 'Submodel', value: edgeSubmodel }] }],
      }),
    })
    expect(created.status).toBe(201)
    // What the server's own sync wrote.
    await fetch(`${openTargetUrl}/shell-descriptors/${encode(shellId)}`, { method: 'DELETE' })
    await fetch(`${openTargetUrl}/lookup/shells/${encode(shellId)}`, { method: 'DELETE' })
  })

  afterAll(async () => {
    // With registry integration, BaSyx Go deletes a shell only while its descriptor exists.
    await fetch(`${openTargetUrl}/shell-descriptors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: shellId, endpoints: [{ interface: 'AAS-3.0', protocolInformation: { href: `${openTargetUrl}/shells/${encode(shellId)}` } }] }),
    })
    expect((await fetch(`${openTargetUrl}/shells/${encode(shellId)}`, { method: 'DELETE' })).status).toBe(204)
    await fetch(`${openTargetUrl}/lookup/shells/${encode(shellId)}`, { method: 'DELETE' })
  })

  it('writes the descriptors and asset links of an uploaded shell', async () => {
    expect(await descriptor()).toBeNull()
    const steps = await target.registerShells([shellId], plan)
    expect(steps).toEqual([
      { resource: 'shellDescriptor', id: shellId, outcome: 'written' },
      { resource: 'submodelDescriptor', id: edgeSubmodel, outcome: 'written' },
      { resource: 'assetLinks', id: shellId, outcome: 'written' },
    ])
    expect((await descriptor())?.endpoints[0]?.protocolInformation.href).toBe(`${openTargetUrl}/shells/${encode(shellId)}`)
    expect(await assetLinks()).toContainEqual({ name: 'globalAssetId', value: assetId })
  })

  it('replaces the descriptors of a shell uploaded again', async () => {
    const steps = await target.registerShells([shellId], plan)
    expect(steps.every(step => step.outcome === 'written')).toBe(true)
  })

  it('removes the descriptor and asset links of a deleted shell, but not those of its submodels', async () => {
    const steps = await target.unregisterShell(shellId, plan)
    expect(steps).toEqual([
      { resource: 'shellDescriptor', id: shellId, outcome: 'removed' },
      { resource: 'assetLinks', id: shellId, outcome: 'removed' },
    ])
    expect(await descriptor()).toBeNull()
    expect(await assetLinks()).toEqual([])
    expect((await fetch(`${openTargetUrl}/submodel-descriptors/${encode(edgeSubmodel)}`)).status).toBe(200)
  })

  it('reports nothing where Studio does not sync', async () => {
    expect(await target.registerShells([shellId], { registry: false, discovery: false })).toEqual([])
  })
})
