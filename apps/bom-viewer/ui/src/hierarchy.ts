import type { Node } from '../../../shared/aas'
import type { JsonObject } from '@basyx/studio-sdk'
import { childrenOf, langText } from '../../../shared/aas'

// Reads the Hierarchical Structures enabling Bills of Material submodel
// (IDTA 02011-1). Ported from the BaSyx AAS Web UI
// (HierarchicalStructures_v1_x.vue and HierarchicalStructures_v1_xUtils.ts).

const base = 'https://admin-shell.io/idta/HierarchicalStructures'
export const semanticIds = {
  entryNode: `${base}/EntryNode/1/0`,
  archetype: `${base}/ArcheType/1/0`,
  bulkCount: `${base}/BulkCount/1/0`,
}

export const relationships: Record<string, string> = {
  [`${base}/HasPart/1/0`]: 'HasPart',
  [`${base}/IsPartOf/1/0`]: 'IsPartOf',
  [`${base}/SameAs/1/0`]: 'SameAs',
}

/** The values of the ArcheType property; the app describes each in the user's language (`archetype.<value>`). */
export const archetypes = ['Full', 'OneDown', 'OneUp'] as const

export interface BomItem {
  /** idShortPath of the Entity, unique in the submodel. */
  value: string
  title: string
  idShort: string
  globalAssetId: string | null
  entityType: string | null
  /** Label of the RelationshipElement that links the parent to this entity. */
  relationship: string
  bulkCount: string | null
  children?: BomItem[]
}

interface Key {
  type: string
  value: string
}

function keysOf (reference: unknown): Key[] {
  const keys = (reference as { keys?: unknown } | undefined)?.keys
  return Array.isArray(keys) ? keys as Key[] : []
}

export function semanticIdOf (element: JsonObject): string | undefined {
  return keysOf(element.semanticId)[0]?.value
}

function hasSemanticId (element: JsonObject, semanticId: string): boolean {
  return semanticIdOf(element)?.toLowerCase() === semanticId.toLowerCase()
}

/** The entry node: the top-level Entity with the EntryNode semantic ID. */
export function findEntryNode (submodel: JsonObject): Node | undefined {
  return childrenOf(submodel).find(node => node.element.modelType === 'Entity' && hasSemanticId(node.element, semanticIds.entryNode))
}

/** The ArcheType property (`Full`, `OneDown` or `OneUp`). */
export function findArchetype (submodel: JsonObject): Node | undefined {
  return childrenOf(submodel).find(node => hasSemanticId(node.element, semanticIds.archetype))
}

function childEntities (node: Node): Node[] {
  return childrenOf(node).filter(entry => entry.element.modelType === 'Entity')
}

function relationshipElements (node: Node): JsonObject[] {
  return childrenOf(node).map(entry => entry.element).filter(element => element.modelType === 'RelationshipElement')
}

/** The label of the RelationshipElement in the parent whose `second` points to the child. */
function relationshipTo (parent: Node, child: JsonObject): string {
  const relationship = relationshipElements(parent).find(element => keysOf(element.second).some(key =>
    (key.type === 'Entity' && key.value === child.idShort)
    || (typeof child.globalAssetId === 'string' && ['AssetAdministrationShell', 'GlobalReference'].includes(key.type) && key.value === child.globalAssetId),
  ))
  return relationship ? relationships[semanticIdOf(relationship) ?? ''] ?? '' : ''
}

/** True if an entity relates to its children with more than one relationship type. */
function mixesRelationships (node: Node): boolean {
  return new Set(relationshipElements(node).map(element => semanticIdOf(element))).size > 1
}

function bulkCountOf (node: Node): string | null {
  const property = childrenOf(node).find(entry => hasSemanticId(entry.element, semanticIds.bulkCount))
  return property?.element.value == null ? null : String(property.element.value)
}

function displayName (element: JsonObject, locale: string): string {
  return langText(element.displayName, locale) || String(element.idShort ?? '')
}

/** The entry node and its child entities as a tree, plus whether any entity mixes relationship types. */
export function buildTree (submodel: JsonObject, locale: string): { items: BomItem[], mixed: boolean } {
  const entry = findEntryNode(submodel)
  if (!entry) {
    return { items: [], mixed: false }
  }
  let mixed = false
  const toItem = (node: Node, relationship: string): BomItem => {
    mixed ||= mixesRelationships(node)
    const children = childEntities(node).map(child => toItem(child, relationshipTo(node, child.element)))
    return {
      value: node.path,
      title: displayName(node.element, locale),
      idShort: String(node.element.idShort ?? ''),
      globalAssetId: typeof node.element.globalAssetId === 'string' ? node.element.globalAssetId : null,
      entityType: typeof node.element.entityType === 'string' ? node.element.entityType : null,
      relationship,
      bulkCount: bulkCountOf(node),
      // Leaves have no children key, so the tree shows them without a toggle.
      ...(children.length > 0 ? { children } : {}),
    }
  }
  return { items: [toItem(entry, '')], mixed }
}

/** Assemblies, self-managed entities (with an AAS of their own) and co-managed parts (only in this submodel). */
export function entityIcon (item: BomItem): string {
  if (item.children) {
    return 'mdi-package-variant'
  }
  return item.entityType === 'SelfManagedEntity' ? 'mdi-package-variant-closed' : 'mdi-cube-outline'
}
