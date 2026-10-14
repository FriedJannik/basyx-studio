import { describe, expect, it } from 'vitest'
import { externalUrl, toShellSummary } from '~~/server/lib/aas/shells'

describe('shell summaries', () => {
  it('names external thumbnails, which the browser loads directly', () => {
    const shell = (path: string) => ({ id: 'urn:a', assetInformation: { assetKind: 'Instance', defaultThumbnail: { path } } })
    expect(toShellSummary(shell('https://cdn.example.com/motor.png'))).toMatchObject({ thumbnail: true, thumbnailUrl: 'https://cdn.example.com/motor.png' })
    expect(toShellSummary(shell('/aasx/files/motor.png'))).toMatchObject({ thumbnail: true, thumbnailUrl: null })
    expect(toShellSummary({ id: 'urn:b' })).toMatchObject({ thumbnail: false, thumbnailUrl: null })
  })

  it('accepts only http and https as external addresses', () => {
    expect(externalUrl('HTTP://example.com/a.png')).toBe('HTTP://example.com/a.png')
    expect(externalUrl('javascript:alert(1)')).toBeNull()
    expect(externalUrl('file:///etc/passwd')).toBeNull()
    expect(externalUrl(42)).toBeNull()
  })
})
