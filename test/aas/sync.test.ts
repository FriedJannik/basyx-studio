import { describe, expect, it } from 'vitest'
import { encodeKey } from '~~/server/lib/aas/keys'
import { assetLinksOf, effectiveSyncMode, shellDescriptor, submodelDescriptor, submodelIdsOf, syncPlan } from '~~/server/lib/aas/sync'
import { defaultSyncSettings } from '#shared/contract'

const shell = {
  modelType: 'AssetAdministrationShell',
  id: 'urn:test:aas:1',
  idShort: 'Shell1',
  displayName: [{ language: 'en', text: 'Shell one' }],
  assetInformation: {
    assetKind: 'Instance',
    globalAssetId: 'urn:test:asset:1',
    specificAssetIds: [{ name: 'serialNumber', value: 'SN-1' }],
  },
  submodels: [{ type: 'ModelReference', keys: [{ type: 'Submodel', value: 'urn:test:sm:1' }] }],
}

const environment = { template: 'mono-all' as const, endpoints: [{ type: 'aasEnvironment' as const, url: 'http://env' }] }
const repositoryOnly = { template: 'full' as const, endpoints: [{ type: 'aasRepository' as const, url: 'http://aas' }, { type: 'submodelRepository' as const, url: 'http://sm' }] }

describe('registry and discovery sync', () => {
  it('writes only what the server does not keep in step, and only where a registry or discovery exists', () => {
    const serverSyncs = { ...defaultSyncSettings }
    const studioSyncs = { ...defaultSyncSettings, serverSyncsRegistry: false, serverSyncsDiscovery: false }
    expect(syncPlan({ ...environment, sync: serverSyncs }, null)).toEqual({ registry: false, discovery: false })
    expect(syncPlan({ ...environment, sync: studioSyncs }, null)).toEqual({ registry: true, discovery: true })
    expect(syncPlan({ ...repositoryOnly, sync: studioSyncs }, null)).toEqual({ registry: false, discovery: false })
    expect(syncPlan({ ...environment, sync: { ...studioSyncs, studioDefault: 'dontCreate' } }, null)).toEqual({ registry: false, discovery: false })
  })

  it('lets the user choose only where the infrastructure allows it', () => {
    expect(effectiveSyncMode({ ...defaultSyncSettings, userOverride: false }, 'dontCreate')).toBe('autoCreate')
    expect(effectiveSyncMode({ ...defaultSyncSettings, userOverride: true }, 'dontCreate')).toBe('dontCreate')
    expect(effectiveSyncMode({ ...defaultSyncSettings, userOverride: true }, null)).toBe('autoCreate')
  })

  it('builds descriptors with the repository endpoints and the shell\'s asset links', () => {
    expect(shellDescriptor(shell, 'http://env')).toEqual({
      id: 'urn:test:aas:1',
      idShort: 'Shell1',
      displayName: [{ language: 'en', text: 'Shell one' }],
      assetKind: 'Instance',
      globalAssetId: 'urn:test:asset:1',
      specificAssetIds: [{ name: 'serialNumber', value: 'SN-1' }],
      endpoints: [{ interface: 'AAS-3.0', protocolInformation: { href: `http://env/shells/${encodeKey('urn:test:aas:1')}` } }],
    })
    expect(submodelDescriptor({ id: 'urn:test:sm:1', idShort: 'Nameplate' }, 'http://env').endpoints).toEqual([
      { interface: 'SUBMODEL-3.0', protocolInformation: { href: `http://env/submodels/${encodeKey('urn:test:sm:1')}` } },
    ])
    expect(assetLinksOf(shell)).toEqual([{ name: 'globalAssetId', value: 'urn:test:asset:1' }, { name: 'serialNumber', value: 'SN-1' }])
    expect(submodelIdsOf(shell)).toEqual(['urn:test:sm:1'])
  })
})
