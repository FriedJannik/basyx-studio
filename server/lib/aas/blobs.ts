import type { JsonObject } from './outline'
import { childProperties, hasNamedChildren } from '#shared/aas/defaults'

// Blob values and whole-submodel writes. The AAS API leaves Blob values out
// of a read unless it asks for them (`extent=withBlobValue`), and a PUT of a
// whole submodel replaces every element. Studio shows and hashes submodels
// without Blob values, but must never write one back without them, or every
// Blob in the submodel loses its content.

function isObject (value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The children of a submodel or container element, with the property that holds them. */
function childrenOf (element: JsonObject): { property: string, children: unknown[] } | null {
  const property = childProperties[String(element.modelType)]
  const children = property ? element[property] : undefined
  return property && Array.isArray(children) ? { property, children } : null
}

/** Operation variables wrap their element in `value`. */
const operationVariables = ['inputVariables', 'outputVariables', 'inoutputVariables'] as const

/** The element with each operation variable's element mapped (Operations only). */
function mapVariables (element: JsonObject, map: (variable: JsonObject, property: string) => JsonObject): JsonObject {
  if (element.modelType !== 'Operation') {
    return element
  }
  const next: JsonObject = { ...element }
  for (const property of operationVariables) {
    const variables = element[property]
    if (Array.isArray(variables)) {
      next[property] = variables.map(variable => isObject(variable) && isObject(variable.value) ? { ...variable, value: map(variable.value, property) } : variable)
    }
  }
  return next
}

/** The submodel or element as a read without Blob values returns it, e.g. for its revision. */
export function withoutBlobValues (element: JsonObject): JsonObject {
  if (element.modelType === 'Blob') {
    const { value: _, ...rest } = element
    return rest
  }
  const nested = childrenOf(element)
  if (!nested) {
    return mapVariables(element, withoutBlobValues)
  }
  return { ...element, [nested.property]: nested.children.map(child => isObject(child) ? withoutBlobValues(child) : child) }
}

/**
 * Gives every Blob of `next` that comes without a value the value of the Blob
 * at the same place in `current`: named children and operation variables
 * match by idShort, list items by position. A Blob that comes with a value
 * keeps it, so values can still be replaced.
 */
export function withBlobValuesFrom (next: JsonObject, current: JsonObject | undefined): JsonObject {
  if (!current) {
    return next
  }
  if (next.modelType === 'Blob') {
    return next.value === undefined && current.modelType === 'Blob' && typeof current.value === 'string'
      ? { ...next, value: current.value }
      : next
  }
  if (next.modelType === 'Operation') {
    return mapVariables(next, (variable, property) => {
      const before = Array.isArray(current[property]) ? current[property] as unknown[] : []
      const match = before.map(entry => isObject(entry) ? entry.value : undefined).find(value => isObject(value) && value.idShort === variable.idShort)
      return withBlobValuesFrom(variable, isObject(match) ? match : undefined)
    })
  }
  const nested = childrenOf(next)
  const before = childrenOf(current)
  if (!nested || !before) {
    return next
  }
  const named = hasNamedChildren(String(next.modelType))
  const byIdShort = new Map(before.children.filter(isObject).map(child => [child.idShort, child]))
  return {
    ...next,
    [nested.property]: nested.children.map((child, index) => {
      if (!isObject(child)) {
        return child
      }
      const match = named ? byIdShort.get(child.idShort) : before.children[index]
      return withBlobValuesFrom(child, isObject(match) ? match : undefined)
    }),
  }
}
