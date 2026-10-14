import { encode } from 'uqr'

/**
 * A QR code as SVG markup, marked as an identification link after IEC 61406
 * as in the BaSyx AAS Web UI: 61406-1 has a black frame and a cut lower right
 * corner, 61406-2 (content with `?.`) only the cut corner. Drawn as one SVG,
 * so it stays sharp at any size and keeps its white quiet zone in dark mode.
 */
export function identificationLinkSvg (content: string): string {
  const qr = encode(content, { ecc: 'Q', border: 0 })
  const framed = !content.includes('?.')
  const quiet = 3
  const frame = framed ? 1 : 0
  const size = qr.size + 2 * (quiet + frame)
  // The cut corner, in modules along each edge: clear of the code itself.
  const cut = framed ? 6 : 4.5

  const chamfered = (inset: number, corner: number) => {
    const low = inset
    const high = size - inset
    return `${low},${low} ${high},${low} ${high},${high - corner} ${high - corner},${high} ${low},${high}`
  }

  let modules = ''
  const offset = quiet + frame
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.data[y]![x]) {
        modules += `M${x + offset} ${y + offset}h1v1h-1z`
      }
    }
  }

  // The frame is the black chamfered square, the quiet zone a white one inside it.
  const background = framed
    ? `<polygon points="${chamfered(0, cut)}" fill="#000"/><polygon points="${chamfered(frame, cut - frame * (2 - Math.SQRT2))}" fill="#fff"/>`
    : `<polygon points="${chamfered(0, cut)}" fill="#fff"/>`
  // An explicit size (8 px per module): without it, browsers draw the image
  // in a 300 × 150 box, e.g. when a scanner decodes it from a canvas.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 8}" height="${size * 8}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${background}<path d="${modules}" fill="#000"/></svg>`
}

/** The SVG as a data URL, e.g. for `v-img`. */
export function svgDataUrl (svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
