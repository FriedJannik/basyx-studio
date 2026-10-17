import type { JsonObject } from '@basyx/studio-sdk'
import { describe, expect, it } from 'vitest'
import { buildTree, entityIcon, findArchetype } from '../../apps/bom-viewer/ui/src/hierarchy'

// The BOM viewer's reading of IDTA 02011 (Hierarchical Structures enabling
// Bills of Material).

const base = 'https://admin-shell.io/idta/HierarchicalStructures'
const semanticId = (value: string) => ({ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value }] })

function relationship (idShort: string, kind: 'HasPart' | 'IsPartOf' | 'SameAs', target: string): JsonObject {
  return {
    modelType: 'RelationshipElement',
    idShort,
    semanticId: semanticId(`${base}/${kind}/1/0`),
    first: { type: 'ModelReference', keys: [{ type: 'Entity', value: 'Motor' }] },
    second: { type: 'ModelReference', keys: [{ type: 'Entity', value: target }] },
  }
}

function entity (idShort: string, statements: JsonObject[] = [], extra: JsonObject = {}): JsonObject {
  return { modelType: 'Entity', idShort, entityType: 'CoManagedEntity', statements, ...extra }
}

function submodel (entryStatements: JsonObject[]): JsonObject {
  return {
    modelType: 'Submodel',
    submodelElements: [
      { modelType: 'Property', idShort: 'ArcheType', valueType: 'xs:string', value: 'OneDown', semanticId: semanticId(`${base}/ArcheType/1/0`) },
      entity('Motor', entryStatements, {
        semanticId: semanticId(`${base}/EntryNode/1/0`),
        entityType: 'SelfManagedEntity',
        globalAssetId: 'urn:example:motor',
        displayName: [{ language: 'en', text: 'Motor' }, { language: 'de', text: 'Antrieb' }],
      }),
    ],
  }
}

describe('BOM hierarchy', () => {
  it('builds the tree from the entry node with relationships and bulk counts', () => {
    const tree = buildTree(submodel([
      entity('Housing', [{ modelType: 'Property', idShort: 'BulkCount', valueType: 'xs:int', value: '2', semanticId: semanticId(`${base}/BulkCount/1/0`) }]),
      entity('Rotor', [entity('Shaft')]),
      relationship('HasHousing', 'HasPart', 'Housing'),
      relationship('HasRotor', 'HasPart', 'Rotor'),
    ]), 'de')
    expect(tree.mixed).toBe(false)
    const [motor] = tree.items
    expect(motor).toMatchObject({ title: 'Antrieb', globalAssetId: 'urn:example:motor', relationship: '' })
    expect(motor!.children!.map(child => [child.idShort, child.relationship, child.bulkCount])).toEqual([
      ['Housing', 'HasPart', '2'],
      ['Rotor', 'HasPart', null],
    ])
    // A leaf has no children key, so the tree shows it without a toggle.
    expect(motor!.children![0]).not.toHaveProperty('children')
    expect(motor!.children![1]!.children![0]!.value).toBe('Motor.Rotor.Shaft')
  })

  it('says when an entity mixes relationship types', () => {
    const tree = buildTree(submodel([
      entity('Housing'),
      entity('Cover'),
      relationship('HasHousing', 'HasPart', 'Housing'),
      relationship('CoverOf', 'IsPartOf', 'Cover'),
    ]), 'en')
    expect(tree.mixed).toBe(true)
  })

  it('finds the archetype and has no tree without an entry node', () => {
    expect(findArchetype(submodel([]))?.element.value).toBe('OneDown')
    expect(buildTree({ modelType: 'Submodel', submodelElements: [entity('Loose')] }, 'en')).toEqual({ items: [], mixed: false })
  })

  it('picks icons for assemblies, self-managed and co-managed parts', () => {
    const [motor] = buildTree(submodel([entity('Housing'), entity('Board', [], { entityType: 'SelfManagedEntity' })]), 'en').items
    expect(entityIcon(motor!)).toBe('mdi-package-variant')
    expect(motor!.children!.map(child => entityIcon(child))).toEqual(['mdi-cube-outline', 'mdi-package-variant-closed'])
  })
})
