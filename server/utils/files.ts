import type { BinaryContent } from '../lib/targets/aas-target'
import type { RequestEvent } from 'nuxt/server'
import { getQuery, getRequestHeader } from 'nuxt/server'
import { StudioProblem } from '../lib/problem'

/** Media types shown inline (thumbnails, image previews); everything else downloads. */
const inlineTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'application/pdf'])

function safeMediaType (contentType: string): string {
  const type = contentType.split(';', 1)[0]!.trim().toLowerCase()
  return /^[a-z]+\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream'
}

function contentDisposition (kind: 'inline' | 'attachment', fileName: string | null): string {
  if (!fileName) {
    return kind
  }
  const ascii = fileName.replaceAll(/[^\u0020-\u007E]|["\\]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

/**
 * Sends file content from a target. The content comes from the AAS data,
 * not from Studio, so it is sandboxed: no sniffing, no scripts, and only
 * images and PDFs are shown inline.
 */
export function sendBinary (event: RequestEvent, content: BinaryContent, options: { download?: boolean } = {}): Uint8Array {
  const type = safeMediaType(content.contentType)
  const inline = !options.download && inlineTypes.has(type)
  const headers = event.res.headers
  headers.set('Content-Type', type)
  headers.set('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', content.fileName))
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Content-Security-Policy', 'sandbox; default-src \'none\'; img-src \'self\' data:; style-src \'unsafe-inline\'')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  return content.bytes
}

/**
 * Reads a raw request body as a file: the media type from `Content-Type`,
 * the name from the `fileName` query parameter. Fails above `maxBytes`.
 */
export async function readFileBody (event: RequestEvent, maxBytes: number): Promise<BinaryContent> {
  const declared = Number(getRequestHeader(event, 'content-length') ?? 0)
  const tooLarge = () => new StudioProblem('invalid_request', `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MiB.`)
  if (declared > maxBytes) {
    throw tooLarge()
  }
  const bytes = new Uint8Array(await event.req.arrayBuffer())
  if (bytes.length > maxBytes) {
    throw tooLarge()
  }
  if (bytes.length === 0) {
    throw new StudioProblem('invalid_request', 'The request body must be the file.')
  }
  const name = getQuery(event).fileName
  const fileName = typeof name === 'string' && name.length > 0 && name.length <= 255 && !/[/\\\0]/.test(name) ? name : null
  return { bytes, contentType: safeMediaType(getRequestHeader(event, 'content-type') ?? ''), fileName }
}
