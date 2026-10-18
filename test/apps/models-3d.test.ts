import type { JsonObject } from '@basyx/studio-sdk'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { latestVersion, parseModels3D, sortModels, versionTitle, viewerFormat } from '../../apps/models-3d/ui/src/models3d'
import { levelOfDetail, listValue, modelFacts, statusColor, technicalGroups } from '../../apps/models-3d/ui/src/presentation'

// The 3D Models app's reading of IDTA 02026-1-0 (Provision of 3D Models).

const environment = JSON.parse(readFileSync(new URL('../../test-setup/fixtures/models3d/studio-3d-models.json', import.meta.url), 'utf8')) as { submodels: JsonObject[] }
const fixture = environment.submodels.find(submodel => submodel.idShort === 'Models3D')!
const t = (key: string, params?: Record<string, string | number>) => `${key}${params ? JSON.stringify(params) : ''}`

const base = 'https://admin-shell.io/idta/Models3D'
const semanticId = (path: string) => ({ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: `${base}/${path}` }] })
function prop (idShort: string | undefined, value: string, path?: string): JsonObject {
  return {
    ...(idShort ? { idShort } : {}),
    modelType: 'Property',
    valueType: 'xs:string',
    value,
    ...(path ? { semanticId: semanticId(path) } : {}),
  }
}
function smc (idShort: string | undefined, value: JsonObject[], path?: string): JsonObject {
  return {
    ...(idShort ? { idShort } : {}),
    modelType: 'SubmodelElementCollection',
    value,
    ...(path ? { semanticId: semanticId(path) } : {}),
  }
}
const sml = (idShort: string, value: JsonObject[]): JsonObject => ({ idShort, modelType: 'SubmodelElementList', value })
const submodelOf = (...models: JsonObject[]): JsonObject => ({ modelType: 'Submodel', idShort: 'Models3D', submodelElements: [sml('Model3D', models)] })

describe('parseModels3D', () => {
  const models = parseModels3D(fixture)

  it('reads every model of the fixture', () => {
    expect(models.map(model => model.ids[0]?.value)).toEqual(['BRK-60-40', 'WORKSHOP', 'MOTOR-EXT', 'GEARBOX'])
  })

  it('reads identifiers, versions, applications and classifications', () => {
    const [bracket] = models
    expect(bracket!.ids).toEqual([
      { domain: 'StudioFixtures', value: 'BRK-60-40', primary: true },
      { domain: 'Catalog', value: '4711', primary: false },
    ])
    expect(bracket!.isPrimary).toBe(true)
    expect(bracket!.versions).toHaveLength(2)
    const glb = bracket!.versions[1]!
    expect(glb).toMatchObject({
      fileName: 'bracket.glb',
      versionId: '1.1',
      status: 'Released',
      setDate: '2026-10-01',
      format: { name: 'glTF', version: '2.0', qualifier: 'binary (.glb)' },
      preview: { path: 'Model3D[0].File.FileVersion[1].PreviewFile', contentType: 'image/png' },
      digital: { path: 'Model3D[0].File.FileVersion[1].DigitalFile', contentType: 'model/gltf-binary' },
      providingOrganization: { name: 'Studio Fixtures', officialName: 'Studio Fixtures Inc.' },
      basedOn: ['urn:studio:test:sm:models3d / Model3D'],
    })
    expect(glb.title).toEqual([{ language: 'en', text: 'L bracket' }, { language: 'de', text: 'Winkel' }])
    expect(glb.externalFiles).toEqual([{
      url: 'https://models.example.com/brk-60-40.glb',
      identifier: 'BRK-60-40-GLB',
      host: { name: 'Example Models', officialName: 'Example Models AG' },
      apis: [{ version: '1.0', documentationUrl: 'https://example.com/docs/model-library-api', specificationUrl: '' }],
    }])
    expect(glb.sourceApplication).toMatchObject({ name: 'Blender', version: '5.2', vendor: { name: 'Blender Foundation' }, apis: [{ version: '2.1' }] })
    expect(bracket!.consumingApplications).toMatchObject([{ name: 'Godot Engine', version: '4.7' }])
    expect(bracket!.classifications).toEqual([{ id: '3D-VIS', name: [{ language: 'en', text: '3D visualisation model' }], system: 'StudioFixtures' }])
  })

  it('reads capability and geometry', () => {
    const [bracket] = models
    expect(bracket).toMatchObject({
      positivePurposes: ['Rendering', 'VirtualCommisioning'],
      negativePurposes: ['3DPrintingSlicer'],
      embeddedInfo: ['ReferencePoints'],
      states: ['InSeries'],
      objectType: 'Component',
      origin: 'DesignEngineering',
      simplification: { description: 'Edges not filleted', reducedElements: ['Graphics'], derivedFrom: '' },
      representation: 'SolidBody',
      lengthUnit: 'mm',
      boundingBoxes: [{ kind: 'MinEnvelope', size: { x: '60', y: '30', z: '40' }, referenceSystem: { offset: { x: '0', y: '0', z: '0' }, orientation: [] } }],
    })
  })

  it('handles models without a file, or only at an external host', () => {
    const external = models[2]!
    expect(external.versions[0]!.digital).toBeNull()
    expect(external.versions[0]!.externalFiles[0]!.url).toBe('https://models.example.com/motor.step')
    expect(viewerFormat(external.versions[0])).toBeNull()
    expect(external.positivePurposes).toEqual([])
    expect(external.lengthUnit).toBe('')
  })

  it('accepts the specification\'s and the template\'s spellings of semantic IDs', () => {
    // Template JSON: FileDomaniId, FileVersionID, NegModelPurpos, LevelDescription, ApplicationQualifier1/0.
    const [model] = parseModels3D(submodelOf(smc(undefined, [
      smc('File', [
        sml('FileId', [smc(undefined, [prop('Domain', 'D', 'Model3D/File/FileId/FileDomaniId/1/0'), prop('Value', 'V', 'Model3D/File/FileId/ValueId/1/0'), prop('Flag', 'true', 'Model3D/File/FileId/isPrimary/1/0')])]),
        sml('FileVersion', [smc(undefined, [
          prop('Version', '7', 'Model3D/File/FileVersion/FileVersionID/1/0'),
          smc('Source', [prop('Qualifier', 'exporter', 'Model3D/File/FileVersion/SourceApplication/ApplicationQualifier1/0'), prop('ApplicationName', 'CAD')], 'Model3D/File/FileVersion/SourceApplication/1/0'),
        ])]),
      ]),
      smc('Capability', [
        sml('NegPurposes', [prop(undefined, 'Logistics')]),
        smc('Simplification', [prop('LoD', 'coarse', 'Model3D/Capability/Simplification/LevelDescription/1/0')]),
      ]),
    ])))
    expect(model!.ids).toEqual([{ domain: 'D', value: 'V', primary: true }])
    expect(model!.versions[0]!.versionId).toBe('7')
    expect(model!.versions[0]!.sourceApplication).toMatchObject({ name: 'CAD', qualifier: 'exporter' })
    expect(model!.simplification?.description).toBe('coarse')
  })

  it('accepts numbered idShorts, several IsPrimary flags and collections in place of lists', () => {
    const [model] = parseModels3D({
      modelType: 'Submodel',
      submodelElements: [smc('Model3D', [smc('Model3D01', [
        smc('File', [
          smc('FileId', [smc('FileId01', [prop('FileDomainId', 'D'), prop('ValueId', 'V'), prop('IsPrimary01', 'false'), prop('IsPrimary02', 'true')])]),
          smc('FileVersion', [smc('FileVersion01', [prop('FileName', 'a.stl'), { idShort: 'DigitalFile', modelType: 'File', contentType: 'image/png', value: '/files/a' }])]),
        ]),
      ])])],
    })
    expect(model!.isPrimary).toBe(true)
    // The template's placeholder media type: the file name tells the format.
    expect(viewerFormat(model!.versions[0])).toBe('stl')
    expect(model!.versions[0]!.digital?.path).toBe('Model3D.Model3D01.File.FileVersion.FileVersion01.DigitalFile')
  })

  it('returns nothing for an empty or foreign submodel', () => {
    expect(parseModels3D({ modelType: 'Submodel', submodelElements: [] })).toEqual([])
    expect(parseModels3D({ modelType: 'Submodel', submodelElements: [prop('Something', 'x')] })).toEqual([])
  })
})

describe('versions and formats', () => {
  const models = parseModels3D(fixture)

  it('shows the latest version and primary models first', () => {
    expect(latestVersion(models[0]!.versions)?.versionId).toBe('1.1')
    expect(sortModels(models)[0]!.ids[0]!.value).toBe('BRK-60-40')
    expect(versionTitle(latestVersion(models[0]!.versions), models[0]!, 0, 'de')).toBe('Winkel')
    expect(versionTitle(undefined, models[3]!, 3, 'en')).toBe('GEARBOX')
  })

  it('knows the format from the file, its name or the declared format', () => {
    expect(viewerFormat(models[0]!.versions[0])).toBe('step')
    expect(viewerFormat(models[0]!.versions[1])).toBe('glb')
    expect(viewerFormat(models[1]!.versions[0])).toBe('ifc')
    expect(viewerFormat(models[3]!.versions[0])).toBeNull()
    const declared = { ...models[0]!.versions[0]!, fileName: '', digital: { path: 'x', contentType: 'application/octet-stream', value: '/files/blob' } }
    expect(viewerFormat(declared)).toBe('step')
    expect(viewerFormat({ ...declared, format: { name: 'glTF', version: '2.0', qualifier: 'binary (.glb)' } })).toBe('glb')
  })
})

describe('presentation', () => {
  const [bracket] = parseModels3D(fixture)

  it('colors the status values of the value list and common terms', () => {
    expect(statusColor('Released')).toBe('success')
    expect(statusColor('InReview')).toBe('warning')
    expect(statusColor('not released')).toBe('error')
    expect(statusColor('Custom')).toBeUndefined()
  })

  it('translates value list entries and keeps other values', () => {
    expect(listValue(t, 'purpose', 'VirtualCommisioning')).toBe('values.VirtualCommisioning')
    expect(listValue(t, 'state', 'insERIES')).toBe('values.InSeries')
    expect(listValue(t, 'objectType', 'Robot')).toBe('Robot')
  })

  it('lists the facts and the technical details', () => {
    expect(levelOfDetail(t, bracket!)).toBe('Edges not filleted')
    expect(modelFacts(t, bracket!).map(row => row.label)).toEqual(['facts.objectType', 'facts.origin', 'facts.representation', 'facts.unit', 'facts.boundingBox'])
    const groups = technicalGroups(t, bracket!, bracket!.versions[1], 'en')
    expect(groups.map(group => group.key)).toEqual(['file', 'sources', 'applications', 'classification', 'geometry'])
    const sources = groups.find(group => group.key === 'sources')!.rows
    expect(sources[0]).toMatchObject({ label: 'Example Models (Example Models AG)', url: 'https://models.example.com/brk-60-40.glb' })
  })
})
