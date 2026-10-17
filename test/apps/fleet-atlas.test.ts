import { describe, expect, it } from 'vitest'
// @ts-expect-error The backend is plain JavaScript run by Deno.
import { ask } from '../../examples/apps/fleet-atlas/backend/ask.js'
// @ts-expect-error The backend is plain JavaScript run by Deno.
import { categorize, digest, structureOf, submodelKind, unitOf } from '../../examples/apps/fleet-atlas/backend/digest.js'

// The Fleet Atlas example app's backend logic (examples/apps/fleet-atlas):
// twin digests from AAS submodels and the "ask the fleet" parser.

const ref = (value: string) => ({ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value }] })
const prop = (idShort: string, value?: string, extra = {}) => ({ idShort, modelType: 'Property', valueType: 'xs:string', ...(value === undefined ? {} : { value }), ...extra })
const mlp = (idShort: string, text?: string) => ({ idShort, modelType: 'MultiLanguageProperty', ...(text ? { value: [{ language: 'en', text }] } : {}) })

const nameplate = {
  modelType: 'Submodel',
  id: 'urn:sm:nameplate',
  semanticId: ref('https://admin-shell.io/idta/nameplate/3/0/Nameplate'),
  submodelElements: [
    mlp('ManufacturerName', 'Voltrix Drives'),
    mlp('ManufacturerProductDesignation', 'Motor VX3'),
    prop('SerialNumber', 'SN1'),
    prop('YearOfConstruction', '2015'),
    prop('CountryOfOrigin'),
    prop('URIOfTheProduct', 'https://example.com/vx3'),
  ],
}
const carbon = {
  modelType: 'Submodel',
  id: 'urn:sm:pcf',
  semanticId: ref('https://admin-shell.io/idta/CarbonFootprint/CarbonFootprint/1/0'),
  submodelElements: [{
    idShort: 'ProductCarbonFootprints',
    modelType: 'SubmodelElementList',
    value: [{ modelType: 'SubmodelElementCollection', value: [prop('PcfCO2eq', '', { valueType: 'xs:double' })] }],
  }],
}
const operational = {
  modelType: 'Submodel',
  id: 'urn:sm:live',
  idShort: 'OperationalData',
  submodelElements: [prop('WindingTemperature', '92.5', { valueType: 'xs:double', qualifiers: [
    { type: 'Unit', valueType: 'xs:string', value: '°C' },
    { type: 'AlarmAbove', valueType: 'xs:double', value: '90' },
  ] })],
}
const shell = { id: 'urn:aas:motor', idShort: 'Motor', displayName: [{ language: 'en', text: 'Main motor' }], assetKind: 'Instance', globalAssetId: 'urn:asset:motor' }

describe('fleet atlas digest', () => {
  it('recognizes submodel kinds by semantic ID and idShort', () => {
    expect(submodelKind('https://admin-shell.io/idta/nameplate/3/0/Nameplate', null)).toBe('nameplate')
    expect(submodelKind('0173-1#01-AHF578#003', null)).toBe('documentation')
    expect(submodelKind(null, 'OperationalData')).toBe('operational')
    expect(submodelKind('urn:other', 'Costs')).toBe('other')
  })

  it('scores passport readiness and offers fixes for empty fields', () => {
    const twin = digest(shell, [], { nameplate, carbon, operational })
    expect(twin).toMatchObject({ name: 'Main motor', manufacturer: 'Voltrix Drives', category: 'motor', year: 2015, carbon: null })
    const open = twin.checks.filter((check: { ok: boolean }) => !check.ok)
    expect(open.map((check: { key: string }) => check.key)).toEqual(['CountryOfOrigin', 'technical', 'PcfCO2eq', 'documentation'])
    expect(open[0].fix).toEqual({ submodelId: 'urn:sm:nameplate', idShortPath: 'CountryOfOrigin', modelType: 'Property', valueType: 'xs:string' })
    expect(open[2].fix.idShortPath).toBe('ProductCarbonFootprints[0].PcfCO2eq')
    expect(twin.readiness).toBeCloseTo(7 / 11)
  })

  it('categorizes by designation before the twin\'s name', () => {
    expect(categorize(['K-Drive Multi-Axis Servo Drive', '', 'L1 Capper · Servo drive'], false)).toBe('drive')
    expect(categorize(['K-Line Servo Motor', '', 'L1 Capper · Servo motor'], false)).toBe('motor')
    expect(categorize(['NV-Chill Recirculating Chiller', '', 'A2 Laser welding station · Chiller'], false)).toBe('chiller')
    expect(categorize(['Orbis Vision Touch Panel', '', 'L1 Rotary filler · HMI panel'], false)).toBe('hmi')
    expect(categorize(['Lumetra End-of-line tester', '', 'EOL End-of-line tester'], true)).toBe('machine')
    expect(categorize(['Rheinfeld Production line', '', 'Line 1 – Filling'], true)).toBe('line')
  })

  it('knows the units of common technical properties', () => {
    expect(unitOf('RatedSpeed')).toBe('1/min')
    expect(unitOf('Capacity')).toBe('Ah')
    expect(unitOf('RatedPower')).toBe('kW')
  })

  it('reads live signals with units and limits', () => {
    expect(digest(shell, [], { operational }).signals).toEqual([{
      submodelId: 'urn:sm:live', path: 'WindingTemperature', label: 'Winding temperature', value: 92.5, unit: '°C',
      warnAbove: null, alarmAbove: 90, warnBelow: null, alarmBelow: null,
    }])
  })

  it('reads parts from Hierarchical Structures, by relationships or by nesting', () => {
    const node = (idShort: string, asset: string, statements: object[] = []) => ({ idShort, modelType: 'Entity', entityType: 'SelfManagedEntity', globalAssetId: asset, statements })
    const nested = { modelType: 'Submodel', id: 'urn:sm:h', submodelElements: [prop('ArcheType', 'Full'), node('EntryNode', 'urn:line', [node('Machine', 'urn:machine', [node('Motor', 'urn:motor')])])] }
    expect(structureOf(nested)).toEqual([['urn:line', 'urn:machine'], ['urn:machine', 'urn:motor']])
    const up = { ...nested, submodelElements: [prop('ArcheType', 'OneUp'), node('EntryNode', 'urn:motor', [node('Machine', 'urn:machine')])] }
    expect(structureOf(up)).toEqual([['urn:machine', 'urn:motor']])
  })
})

describe('ask the fleet', () => {
  const vocabulary = {
    manufacturers: ['Hydra Pumpen', 'Voltrix Drives'],
    specs: [{ key: 'RatedPower', label: 'Rated power', unit: 'kW' }, { key: 'Weight', label: 'Weight', unit: 'kg' }],
    places: [{ id: 'urn:line1', name: 'Line 1 – Filling' }, { id: 'urn:utilities', name: 'Utilities' }],
  }
  const labels = (query: string) => ask({ query, vocabulary }, 2026).clauses.map((clause: { label: string }) => clause.label)

  it('understands categories, technical figures and missing data', () => {
    expect(labels('motors over 5 kW without carbon footprint')).toEqual(['Motors', 'Missing carbon footprint', 'Rated power > 5 kW'])
    expect(labels('heavier than 1 t')).toEqual(['Weight > 1000 kg'])
    expect(labels('between 10 and 50 kW')).toEqual(['Rated power 10–50 kW'])
  })

  it('understands places, manufacturers, age, carbon and status', () => {
    expect(labels('pumps from hydra in utilities')).toEqual(['Pumps', 'In Utilities', 'By Hydra Pumpen'])
    expect(labels('valves without docs in line 1')).toEqual(['Valves', 'Missing documentation', 'In Line 1 – Filling'])
    expect(labels('older than 12 years')).toEqual(['Older than 12 years'])
    expect(ask({ query: 'older than 12 years' }, 2026).clauses[0]).toMatchObject({ type: 'year', op: 'lt', value: 2014 })
    expect(labels('co2 over 500 kg')).toEqual(['CO₂e > 500 kg'])
    expect(labels('anything in alarm or warning')).toEqual(['Warning or alarm'])
    expect(labels('not passport ready')).toEqual(['Passport incomplete'])
    expect(labels('battery modules over 300 kg co2')).toEqual(['Battery modules', 'CO₂e > 300 kg'])
    expect(labels('mobile robots')).toEqual(['Mobile robots'])
  })

  it('searches for words it does not understand', () => {
    expect(ask({ query: 'SN338172' }).clauses).toEqual([{ type: 'text', words: ['sn338172'], label: '“sn338172”' }])
  })
})
