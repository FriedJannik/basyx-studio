import type { ElementHit, TreeNode } from '#shared/contract'
import type { LocatorStep } from './keys'
import type { JsonObject } from './outline'
import { encodeKey, formatLocator } from './keys'
import { childrenOf, submodelChildren, toElementNode } from './outline'

/**
 * Nodes Studio sends for one tree request (MVP-4 plan, T1). BaSyx Go reads a
 * whole submodel for every element request, so a request per level costs as
 * much as the whole tree: one request returns as many complete levels as fit,
 * and deeper levels follow on demand.
 */
export const defaultNodeBudget = 2000
export const maxNodeBudget = 5000

type Child = ReturnType<typeof submodelChildren>[number]

function valueTypeOf (child: Child): string | null {
  const value = child.value as JsonObject | null
  return typeof value?.valueType === 'string' ? value.valueType : null
}

function toNode (child: Child): TreeNode {
  return { ...toElementNode(child), valueType: valueTypeOf(child) }
}

/**
 * Tree nodes for the children of a submodel or element (`children`), with as
 * many complete levels below them as fit into `budget` nodes, breadth first.
 * The first level is always complete. A node with `hasChildren` and without
 * `children` has more levels, which the UI loads when it is opened.
 */
export function buildLevels (children: Child[], budget = defaultNodeBudget): TreeNode[] {
  const top = children.map(child => toNode(child))
  let count = top.length
  let frontier = top.map((node, index) => ({ node, child: children[index]! }))
  while (frontier.length > 0) {
    const expansions = frontier
      .filter(({ node }) => node.hasChildren)
      .map(({ node, child }) => ({ node, children: childrenOf(child.value as JsonObject | JsonObject[], child.steps) }))
    const size = expansions.reduce((sum, expansion) => sum + expansion.children.length, 0)
    if (size === 0 || count + size > budget) {
      break
    }
    count += size
    frontier = expansions.flatMap(({ node, children: level }) => {
      node.children = level.map(child => toNode(child))
      return node.children.map((item, index) => ({ node: item, child: level[index]! }))
    })
  }
  return top
}

/** Elements whose idShort contains `text` (case-insensitive), depth first. */
export function findElements (submodel: JsonObject, text: string, limit: number): Array<{ steps: LocatorStep[], label: string, modelType: string }> {
  const needle = text.toLowerCase()
  const hits: Array<{ steps: LocatorStep[], label: string, modelType: string }> = []
  const visit = (children: Child[]) => {
    for (const child of children) {
      if (hits.length >= limit) {
        return
      }
      const value = child.value as JsonObject | JsonObject[]
      if (!child.variableGroup && !Array.isArray(value) && child.label.toLowerCase().includes(needle)) {
        hits.push({ steps: child.steps, label: child.label, modelType: String(value.modelType ?? 'Unknown') })
      }
      if (value && typeof value === 'object') {
        visit(childrenOf(value, child.steps))
      }
    }
  }
  visit(submodelChildren(submodel))
  return hits
}

/** Search hits of one submodel, attributed to the shell that references it (if known). */
export function elementHits (
  submodel: JsonObject,
  text: string,
  limit: number,
  shell: { key: string, label: string } | null,
): ElementHit[] {
  const submodelLabel = typeof submodel.idShort === 'string' ? submodel.idShort : String(submodel.id)
  return findElements(submodel, text, limit).map(hit => {
    const path = formatLocator(hit.steps)
    return {
      shellKey: shell?.key ?? null,
      shellLabel: shell?.label ?? null,
      submodelKey: encodeKey(String(submodel.id)),
      submodelLabel,
      elementKey: encodeKey(path),
      label: hit.label,
      modelType: hit.modelType,
      path,
    }
  })
}
