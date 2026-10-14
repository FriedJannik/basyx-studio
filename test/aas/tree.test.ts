import type { TreeNode } from '#shared/contract'
import type { JsonObject } from '~~/server/lib/aas/outline'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeKey } from '~~/server/lib/aas/keys'
import { submodelChildren } from '~~/server/lib/aas/outline'
import { buildLevels, elementHits, findElements } from '~~/server/lib/aas/tree'

const fixture = JSON.parse(readFileSync(new URL('../../test-setup/fixtures/open/studio-edge-cases.json', import.meta.url), 'utf8')) as {
  submodels: JsonObject[]
}
const edgeCases = fixture.submodels.find(submodel => submodel.idShort === 'EdgeCases')!
const large = fixture.submodels.find(submodel => submodel.idShort === 'LargeSubmodel')!

function byLocator (nodes: TreeNode[], locator: string): TreeNode | undefined {
  for (const node of nodes) {
    if (decodeKey(node.key) === locator) {
      return node
    }
    const found = byLocator(node.children ?? [], locator)
    if (found) {
      return found
    }
  }
  return undefined
}

function count (nodes: TreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + count(node.children ?? []), 0)
}

describe('tree levels', () => {
  it('contains every level of a small submodel with previews, value types and locator keys', () => {
    const root = buildLevels(submodelChildren(edgeCases))
    const deepest = byLocator(root, 'Level1.Level2.Items[1].Details.Deepest')
    expect(deepest).toMatchObject({ modelType: 'Property', preview: 'deepest value of item 1', valueType: 'xs:string' })
    expect(root.find(node => node.label === 'Temperature')).toMatchObject({ valueType: 'xs:double', preview: '21.5' })
  })

  it('includes operation variable groups as synthetic nodes', () => {
    const calibrate = buildLevels(submodelChildren(edgeCases)).find(node => node.label === 'Calibrate')!
    expect(calibrate.children!.map(node => node.variableGroup)).toEqual(['input', 'output', 'inoutput'])
    expect(decodeKey(calibrate.children![2]!.children![0]!.children![0]!.key)).toBe('Calibrate@inoutput.Settings.Mode')
  })

  it('stops at the last complete level within the budget and always returns the first', () => {
    const full = count(buildLevels(submodelChildren(edgeCases)))
    const limited = buildLevels(submodelChildren(edgeCases), 25)
    expect(count(limited)).toBeLessThanOrEqual(25)
    expect(count(limited)).toBeLessThan(full)
    // Nodes whose level did not fit keep `hasChildren` without children.
    const level1 = limited.find(node => node.label === 'Level1')!
    const unloaded = [level1, ...(level1.children ?? [])].find(node => node.hasChildren && !node.children)
    expect(unloaded).toBeDefined()
    expect(buildLevels(submodelChildren(large), 10)).toHaveLength(300)
  })
})

describe('element search', () => {
  it('finds elements by idShort at any depth, case-insensitively', () => {
    const hits = findElements(edgeCases, 'DEEPEST', 10)
    expect(hits.length).toBeGreaterThan(1)
    expect(hits.every(hit => hit.label === 'Deepest')).toBe(true)
    expect(hits.every(hit => hit.steps.length === 6)).toBe(true)
    expect(findElements(edgeCases, 'deepest', 2)).toHaveLength(2)
  })

  it('attributes hits to the shell that references the submodel', () => {
    const [hit] = elementHits(edgeCases, 'SimpleString', 5, { key: 'shell-key', label: 'EdgeCasesShell' })
    expect(hit).toMatchObject({ shellKey: 'shell-key', shellLabel: 'EdgeCasesShell', submodelLabel: 'EdgeCases', label: 'SimpleString', path: 'SimpleString', modelType: 'Property' })
    expect(decodeKey(hit!.elementKey)).toBe('SimpleString')
  })
})
