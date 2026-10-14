import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { identificationLinkSvg } from '~~/app/utils/qr'

/** Rasterizes the module path of the SVG at one pixel per module, with the quiet zone white. */
function rasterize (svg: string): { data: Uint8ClampedArray, size: number } {
  const size = Number(/viewBox="0 0 (\d+(?:\.\d+)?)/.exec(svg)![1])
  const scale = 4
  const width = size * scale
  const data = new Uint8ClampedArray(width * width * 4).fill(255)
  const path = /<path d="([^"]+)"/.exec(svg)![1]!
  for (const [, x, y] of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const index = ((Number(y) * scale + dy) * width + Number(x) * scale + dx) * 4
        data[index] = data[index + 1] = data[index + 2] = 0
      }
    }
  }
  return { data, size: width }
}

describe('identification link QR codes', () => {
  it('encodes the content so that a scanner reads it back', () => {
    const content = 'https://example.com/ids/asset/4711'
    const { data, size } = rasterize(identificationLinkSvg(content))
    expect(jsQR(data, size, size)?.data).toBe(content)
  })

  it('frames 61406-1 links and leaves 61406-2 links unframed', () => {
    expect(identificationLinkSvg('urn:example:asset:1')).toContain('fill="#000"/><polygon')
    expect(identificationLinkSvg('https://example.com/?.asset=1')).not.toContain('fill="#000"/><polygon')
  })
})
