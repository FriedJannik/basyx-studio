import { describe, expect, it } from 'vitest'
import { descriptorSummary } from '~~/server/lib/aas/shells'
import { isUnderBase, repositoryBaseOf } from '~~/server/lib/targets/resolution'

describe('descriptor endpoints', () => {
  const bases = ['http://aas.example.com/api/', 'https://registry.example.com']

  it('accepts URLs under a configured base path', () => {
    expect(isUnderBase('http://aas.example.com/api/shells/abc', bases)).toBe(true)
    expect(isUnderBase('http://AAS.example.com:80/api/shells/abc', bases)).toBe(true)
    expect(isUnderBase('https://registry.example.com/shells/abc', bases)).toBe(true)
  })

  it('refuses everything else', () => {
    // Another port, scheme or host.
    expect(isUnderBase('http://aas.example.com:8080/api/shells/abc', bases)).toBe(false)
    expect(isUnderBase('https://aas.example.com/api/shells/abc', bases)).toBe(false)
    expect(isUnderBase('http://aas.example.com.evil/api/shells/abc', bases)).toBe(false)
    // The base path only at a segment boundary, also after dot segments.
    expect(isUnderBase('http://aas.example.com/apiv2/shells/abc', bases)).toBe(false)
    expect(isUnderBase('http://aas.example.com/api/../internal/shells/abc', bases)).toBe(false)
    expect(isUnderBase('http://aas.example.com/api/%2e%2e/internal/shells/abc', bases)).toBe(false)
    // Credentials in the URL, and no URL at all.
    expect(isUnderBase('http://user:secret@aas.example.com/api/shells/abc', bases)).toBe(false)
    expect(isUnderBase('not a url', bases)).toBe(false)
  })

  it('derives the repository base from a resource URL', () => {
    expect(repositoryBaseOf('http://aas.example.com/api/shells/YWJj', 'shells')).toBe('http://aas.example.com/api')
    expect(repositoryBaseOf('http://aas.example.com/submodels/YWJj/', 'submodels')).toBe('http://aas.example.com')
    expect(repositoryBaseOf('http://aas.example.com/api/shells', 'shells')).toBeNull()
  })

  it('lists a shell from its descriptor', () => {
    expect(descriptorSummary({ id: 'urn:a', idShort: 'A', assetKind: 'Type', globalAssetId: 'urn:asset', displayName: [{ language: 'en', text: 'Motor' }] }))
      .toMatchObject({ id: 'urn:a', idShort: 'A', assetKind: 'Type', globalAssetId: 'urn:asset', displayName: [{ language: 'en', text: 'Motor' }], thumbnail: false })
  })
})
