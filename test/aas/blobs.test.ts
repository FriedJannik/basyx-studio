import { describe, expect, it } from 'vitest'
import { withBlobValuesFrom, withoutBlobValues } from '~~/server/lib/aas/blobs'

const stored = {
  modelType: 'Submodel',
  id: 'urn:sm',
  submodelElements: [
    { modelType: 'Blob', idShort: 'Picture', contentType: 'image/png', value: 'cGljdHVyZQ' },
    {
      modelType: 'SubmodelElementCollection',
      idShort: 'Group',
      value: [{ modelType: 'Blob', idShort: 'Inner', contentType: 'text/plain', value: 'aW5uZXI' }],
    },
    {
      modelType: 'SubmodelElementList',
      idShort: 'Files',
      typeValueListElement: 'Blob',
      value: [
        { modelType: 'Blob', contentType: 'text/plain', value: 'Zmlyc3Q' },
        { modelType: 'Blob', contentType: 'text/plain', value: 'c2Vjb25k' },
      ],
    },
    { modelType: 'Property', idShort: 'Name', valueType: 'xs:string', value: 'kept' },
    {
      modelType: 'Operation',
      idShort: 'Render',
      inputVariables: [{ value: { modelType: 'Blob', idShort: 'Template', contentType: 'text/plain', value: 'dGVtcGxhdGU' } }],
      outputVariables: [{ value: { modelType: 'Blob', idShort: 'Result', contentType: 'text/plain', value: 'cmVzdWx0' } }],
    },
  ],
}

describe('Blob values in whole-submodel writes', () => {
  it('removes every Blob value, as a read without them returns the submodel', () => {
    const shown = withoutBlobValues(stored)
    expect(JSON.stringify(shown)).not.toMatch(/cGljdHVyZQ|aW5uZXI|Zmlyc3Q|c2Vjb25k|dGVtcGxhdGU|cmVzdWx0/)
    expect(shown.submodelElements).toContainEqual({ modelType: 'Property', idShort: 'Name', valueType: 'xs:string', value: 'kept' })
  })

  it('restores the values by idShort, by position in lists, and in operation variables', () => {
    expect(withBlobValuesFrom(withoutBlobValues(stored), stored)).toEqual(stored)
  })

  it('keeps values that come with the edit and leaves new Blobs empty', () => {
    const edited = withoutBlobValues(stored) as typeof stored
    edited.submodelElements[0] = { ...edited.submodelElements[0]!, value: 'bmV3' }
    edited.submodelElements.push({ modelType: 'Blob', idShort: 'Added', contentType: 'text/plain' } as never)
    const written = withBlobValuesFrom(edited, stored) as typeof stored
    expect(written.submodelElements[0]).toMatchObject({ value: 'bmV3' })
    expect(written.submodelElements.at(-1)).not.toHaveProperty('value')
  })
})
