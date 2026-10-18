import { describe, expect, it } from 'vitest'
import { semanticLabel } from '#shared/aas/semantic-label'

describe('semantic labels of submodels', () => {
  it('names the template and its version from an IDTA or ZVEI IRI', () => {
    expect(semanticLabel('https://admin-shell.io/idta/nameplate/3/0/Nameplate')).toBe('Nameplate 3.0')
    expect(semanticLabel('https://admin-shell.io/idta/CarbonFootprint/CarbonFootprint/1/0')).toBe('CarbonFootprint 1.0')
    expect(semanticLabel('https://admin-shell.io/idta/TechnicalData/Submodel/2/0')).toBe('TechnicalData 2.0')
    expect(semanticLabel('https://admin-shell.io/idta/HierarchicalStructures/1/1/Submodel')).toBe('HierarchicalStructures 1.1')
    expect(semanticLabel('https://admin-shell.io/idta/SubmodelTemplate/HandoverDocumentation/2/0')).toBe('HandoverDocumentation 2.0')
  })

  it('names a part of a template by itself, not by the template it belongs to', () => {
    expect(semanticLabel('https://admin-shell.io/zvei/nameplate/1/0/ContactInformations')).toBe('ContactInformations 1.0')
  })

  it('reads the version once, from its first number pair', () => {
    expect(semanticLabel('https://example.com/ids/Motor/2/0/0')).toBe('Motor 2.0')
  })

  it('names known template IRDIs without a version, unless the idShort already does', () => {
    expect(semanticLabel('0173-1#01-AHX837#002', 'TechData')).toBe('TechnicalData')
    expect(semanticLabel('0173-1#01-AHX837#002', 'TechnicalData')).toBeNull()
    expect(semanticLabel('0173-1#01-AHF578#003', 'HandoverDocumentation')).toBeNull()
  })

  describe('with the submodel\'s administration', () => {
    const administration = (version: string | null, revision: string | null = null, templateId: string | null = null) => ({ version, revision, templateId })

    it('takes the version of the template ID first', () => {
      expect(semanticLabel('0173-1#01-AHF578#003', 'HandoverDocumentation', administration('7', '1', 'https://admin-shell.io/idta-02004-2-0'))).toBe('HandoverDocumentation 2.0')
      expect(semanticLabel('https://admin-shell.io/idta/nameplate/3/0/Nameplate', 'Nameplate', administration(null, null, 'https://admin-shell.io/idta/nameplate/2/0/Nameplate'))).toBe('Nameplate 2.0')
    })

    it('then the version and revision, which an IRDI cannot give', () => {
      expect(semanticLabel('0173-1#01-AHX837#002', 'TechnicalData', administration('2', '0'))).toBe('TechnicalData 2.0')
      expect(semanticLabel('0173-1#01-AHF578#003', 'HandoverDocumentation', administration('2'))).toBe('HandoverDocumentation 2.0')
    })

    it('and the IRI\'s version only without them', () => {
      expect(semanticLabel('https://admin-shell.io/zvei/nameplate/1/0/ContactInformations', 'ContactInformations', null)).toBe('ContactInformations 1.0')
    })

    it('still needs a template name from the semantic ID', () => {
      expect(semanticLabel('urn:example:submodel:42', 'Custom', administration('1', '0'))).toBeNull()
    })
  })

  it('says nothing for other IDs, where only a code or a number would be left', () => {
    expect(semanticLabel('0173-1#01-ABC123#001')).toBeNull()
    expect(semanticLabel('urn:example:submodel:42')).toBeNull()
  })
})
