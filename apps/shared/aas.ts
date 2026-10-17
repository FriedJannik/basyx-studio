import type { JsonObject } from '@basyx/studio-sdk'

// Reading AAS JSON in the apps shipped with Studio. Without Vue or Vuetify,
// so it can be unit-tested and used outside a mounted app.

export interface Node {
  element: JsonObject
  /** idShortPath from the submodel, e.g. `Documents[0].DigitalFiles[0]`. */
  path: string
}

function objects (value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => typeof item === 'object' && item !== null) : []
}

/** The children of a submodel or element, with their idShortPaths. */
export function childrenOf (node: Node | JsonObject): Node[] {
  const isNode = 'element' in node && 'path' in node
  const element = isNode ? (node as Node).element : node as JsonObject
  const base = isNode ? (node as Node).path : ''
  const join = (idShort: string) => (base ? `${base}.${idShort}` : idShort)
  if (element.modelType === 'SubmodelElementList') {
    return objects(element.value).map((child, index) => ({ element: child, path: `${base}[${index}]` }))
  }
  const items = element.modelType === 'Submodel'
    ? element.submodelElements
    : (element.modelType === 'Entity' ? element.statements : element.value)
  if (!['Submodel', 'SubmodelElementCollection', 'Entity'].includes(String(element.modelType))) {
    return []
  }
  return objects(items).map(child => ({ element: child, path: join(String(child.idShort)) }))
}

/** A child by idShort, ignoring case and a trailing number (`Document01` matches `Document`). */
export function child (node: Node | JsonObject | undefined, idShort: string): Node | undefined {
  if (!node) {
    return undefined
  }
  const wanted = idShort.toLowerCase()
  return childrenOf(node).find(entry => String(entry.element.idShort ?? '').toLowerCase().replace(/\d+$/, '') === wanted)
}

/** A localized AAS text for the locale, falling back to English and then the first entry. */
export function langText (value: unknown, locale: string): string {
  if (!Array.isArray(value)) {
    return typeof value === 'string' ? value : ''
  }
  const strings = value as Array<{ language: string, text: string }>
  const language = locale.split('-', 1)[0]!
  return (strings.find(entry => entry.language.startsWith(language)) ?? strings.find(entry => entry.language.startsWith('en')) ?? strings[0])?.text ?? ''
}

/** The display text of a Property, MultiLanguageProperty or File. */
export function textOf (node: Node | undefined, locale: string): string {
  return node ? langText(node.element.value, locale) : ''
}

/** `SerialNumber` → `Serial number`. */
export function humanize (idShort: string): string {
  const words = idShort.replaceAll(/([a-z\d])([A-Z])/g, '$1 $2').replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  return words.charAt(0) + words.slice(1).toLowerCase()
}
