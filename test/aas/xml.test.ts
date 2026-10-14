import type { JsonObject } from '~~/server/lib/aas/outline'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { indentXml, toAasXml } from '~~/server/lib/aas/xml'
import { StudioProblem } from '~~/server/lib/problem'

const fixture = JSON.parse(readFileSync(new URL('../../test-setup/fixtures/open/studio-edge-cases.json', import.meta.url), 'utf8')) as {
  submodels: JsonObject[]
}
const edgeCases = fixture.submodels.find(submodel => submodel.idShort === 'EdgeCases')!

describe('AAS XML', () => {
  it('serializes a submodel and a single element', () => {
    const submodel = toAasXml(edgeCases, 'submodel')
    expect(submodel).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<submodel xmlns="https:\/\/admin-shell.io\/aas\/3\/\d+">/)
    expect(submodel).toContain('<idShort>EdgeCases</idShort>')
    const level1 = (edgeCases.submodelElements as JsonObject[]).find(element => element.idShort === 'Level1')!
    const element = toAasXml(level1, 'element')
    expect(element).toContain('<submodelElementCollection')
    expect(element).toContain('<idShort>Level1Value</idShort>')
  })

  it('indents one element per line without changing values', () => {
    expect(indentXml('<a xmlns="x"><b>1 &lt; 2</b><c><d/></c></a>')).toBe('<a xmlns="x">\n  <b>1 &lt; 2</b>\n  <c>\n    <d/>\n  </c>\n</a>')
    expect(indentXml('<a><b>line 1\nline 2</b><c></c><d> </d></a>')).toBe('<a>\n  <b>line 1\nline 2</b>\n  <c></c>\n  <d> </d>\n</a>')
  })

  it('reports data that is not an AAS element', () => {
    expect(() => toAasXml({ modelType: 'Nonsense' }, 'element')).toThrow(StudioProblem)
  })
})
