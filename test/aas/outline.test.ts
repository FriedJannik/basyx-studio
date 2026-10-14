import type { JsonObject } from '~~/server/lib/aas/outline'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ancestorsOf, decodeKey, encodeKey, formatLocator, parseLocator, splitAddressable } from '~~/server/lib/aas/keys'
import { childrenOf, navigate, submodelChildren, toElementNode } from '~~/server/lib/aas/outline'
import { StudioProblem } from '~~/server/lib/problem'

const fixture = JSON.parse(readFileSync(new URL('../../test-setup/fixtures/open/studio-edge-cases.json', import.meta.url), 'utf8')) as {
  submodels: JsonObject[]
}
const edgeCases = fixture.submodels.find(submodel => submodel.idShort === 'EdgeCases')!

function element (idShort: string): JsonObject {
  return (edgeCases.submodelElements as JsonObject[]).find(item => item.idShort === idShort)!
}

describe('resource keys', () => {
  it('round-trips identifiers as base64url', () => {
    const id = 'urn:studio:test:sm:edge-cases'
    expect(encodeKey(id)).toMatch(/^[\w-]+$/)
    expect(decodeKey(encodeKey(id))).toBe(id)
  })

  it.each(['', 'not base64!', 'a/b', 'YQ=='])('rejects malformed key %j', key => {
    expect(() => decodeKey(key)).toThrow(StudioProblem)
  })
})

describe('element locators', () => {
  it.each([
    'SimpleString',
    'Level1.Level2.Items[1].Details.Deepest',
    'NestedLists[1][0]',
    'Name-With-Hyphen',
    'Calibrate@inoutput.Settings.Mode',
  ])('round-trips %s', locator => {
    expect(formatLocator(parseLocator(locator))).toBe(locator)
  })

  it.each(['', '.A', 'A.', 'A..B', '[0]', 'A@unknown', 'A@input@output', 'A.[0]', '1A'])('rejects %j', locator => {
    expect(() => parseLocator(locator)).toThrow(StudioProblem)
  })

  it('splits off the part that the AAS API cannot address', () => {
    expect(splitAddressable(parseLocator('Level1.Items[2].Name'))).toEqual({ idShortPath: 'Level1.Items[2].Name', rest: [] })
    expect(splitAddressable(parseLocator('Calibrate@inoutput.Settings.Mode'))).toEqual({
      idShortPath: 'Calibrate',
      rest: [{ kind: 'variables', group: 'inoutput' }, { kind: 'idShort', idShort: 'Settings' }, { kind: 'idShort', idShort: 'Mode' }],
    })
  })

  it('names the ancestors of an element with the keys of their tree nodes', () => {
    expect(ancestorsOf(parseLocator('Level1.Items[2].Name'))).toEqual([
      { key: encodeKey('Level1'), label: 'Level1' },
      { key: encodeKey('Level1.Items'), label: 'Items' },
      { key: encodeKey('Level1.Items[2]'), label: '[2]' },
    ])
    expect(ancestorsOf(parseLocator('Calibrate@inoutput.Settings')).map(ancestor => ancestor.label)).toEqual(['Calibrate', 'inoutput'])
    expect(ancestorsOf(parseLocator('Top'))).toEqual([])
  })
})

describe('outline', () => {
  it('lists top-level submodel elements with previews', () => {
    const nodes = submodelChildren(edgeCases).map(child => toElementNode(child))
    const byLabel = Object.fromEntries(nodes.map(node => [node.label, node]))
    expect(byLabel.SimpleString).toMatchObject({ modelType: 'Property', preview: 'hello studio', hasChildren: false })
    expect(byLabel.Title).toMatchObject({ modelType: 'MultiLanguageProperty', preview: 'Edge case submodel' })
    expect(byLabel.OperatingRange).toMatchObject({ preview: '0 – 100' })
    expect(byLabel.Level1).toMatchObject({ modelType: 'SubmodelElementCollection', hasChildren: true })
    expect(byLabel.CanMeasure).toMatchObject({ modelType: 'Capability', hasChildren: false })
    expect(decodeKey(byLabel.Level1!.key)).toBe('Level1')
  })

  it('addresses list items by index and lists of lists', () => {
    const nested = childrenOf(element('NestedLists'), parseLocator('NestedLists'))
    expect(nested.map(child => formatLocator(child.steps))).toEqual(['NestedLists[0]', 'NestedLists[1]'])
    const inner = childrenOf(nested[1]!.value as JsonObject, nested[1]!.steps)
    expect(inner.map(child => formatLocator(child.steps))).toEqual(['NestedLists[1][0]'])
  })

  it('exposes operation variables as synthetic groups', () => {
    const groups = childrenOf(element('Calibrate'), parseLocator('Calibrate')).map(child => toElementNode(child))
    expect(groups.map(node => [node.label, node.modelType, node.variableGroup, node.hasChildren])).toEqual([
      ['input', 'OperationVariables', 'input', true],
      ['output', 'OperationVariables', 'output', true],
      ['inoutput', 'OperationVariables', 'inoutput', true],
    ])
    expect(decodeKey(groups[2]!.key)).toBe('Calibrate@inoutput')
  })

  it('navigates into operation variables', () => {
    const { rest } = splitAddressable(parseLocator('Calibrate@inoutput.Settings.Mode'))
    expect(navigate(element('Calibrate'), rest)).toMatchObject({ idShort: 'Mode', value: 'fast' })
    expect(navigate(element('Calibrate'), splitAddressable(parseLocator('Calibrate@input')).rest)).toHaveLength(1)
    expect(navigate(element('Calibrate'), splitAddressable(parseLocator('Calibrate@output.Missing')).rest)).toBeUndefined()
  })

  it('lists entity statements', () => {
    const statements = childrenOf(element('Motor'), parseLocator('Motor'))
    expect(statements.map(child => formatLocator(child.steps))).toEqual(['Motor.SerialNumber'])
  })
})
