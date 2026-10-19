import { describe, expect, it } from 'vitest'
import { appMethodParamsSchemas, externalFileUrl, methodPermissions } from '#shared/contract'

// `studio.ui.readExternalFile`: the host reads the element and fetches only
// an http(s) address that a File or Property of the AAS holds, so an app can
// never name an address of its own.
describe('external files for apps', () => {
  it('takes the address from a File or Property only', () => {
    expect(externalFileUrl({ modelType: 'File', value: 'https://models.example.com/motor.step' })).toBe('https://models.example.com/motor.step')
    expect(externalFileUrl({ modelType: 'Property', valueType: 'xs:anyURI', value: ' http://localhost:8099/bracket.glb ' })).toBe('http://localhost:8099/bracket.glb')
    expect(externalFileUrl({ modelType: 'File', value: '/aasx/files/bracket.step' })).toBeNull()
    expect(externalFileUrl({ modelType: 'Property', value: 'javascript:alert(1)' })).toBeNull()
    expect(externalFileUrl({ modelType: 'Property', value: 'ftp://files.example.com/a.stl' })).toBeNull()
    expect(externalFileUrl({ modelType: 'Property', value: 'https://user:secret@models.example.com/a.stl' })).toBeNull()
    expect(externalFileUrl({ modelType: 'MultiLanguageProperty', value: [{ language: 'en', text: 'https://models.example.com/a.stl' }] })).toBeNull()
    expect(externalFileUrl(null)).toBeNull()
  })

  it('names the element, not an address, and needs its own permission', () => {
    expect(appMethodParamsSchemas['studio.ui.readExternalFile'].safeParse({ submodelId: 'urn:sm', idShortPath: 'A.B' }).success).toBe(true)
    expect(appMethodParamsSchemas['studio.ui.readExternalFile'].safeParse({ submodelId: 'urn:sm', idShortPath: 'A', url: 'https://x' }).success).toBe(false)
    expect(methodPermissions['studio.ui.readExternalFile']).toBe('studio.ui.externalFiles')
  })
})
