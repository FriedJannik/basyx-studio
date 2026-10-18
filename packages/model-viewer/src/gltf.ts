// A glTF may reference buffers and images in files next to it. A File
// element holds one file only, so those cannot be loaded; these helpers find
// them before the model is parsed.

export interface ExternalResources {
  /** Geometry the model cannot be shown without. */
  buffers: string[]
  /** Textures; the model is shown without them. */
  images: string[]
}

const glbMagic = 0x46_54_6C_67 // "glTF", little-endian
const jsonChunk = 0x4E_4F_53_4A // "JSON", little-endian

/** The JSON of a `.gltf` file or of the first chunk of a `.glb`, or `null`. */
export function gltfJson (bytes: Uint8Array): Record<string, unknown> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let text: string
  if (bytes.byteLength >= 20 && view.getUint32(0, true) === glbMagic) {
    const length = view.getUint32(12, true)
    if (view.getUint32(16, true) !== jsonChunk || 20 + length > bytes.byteLength) {
      return null
    }
    text = new TextDecoder().decode(bytes.subarray(20, 20 + length))
  } else {
    text = new TextDecoder().decode(bytes)
  }
  try {
    const json: unknown = JSON.parse(text)
    return json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : null
  } catch {
    return null
  }
}

function uris (items: unknown): string[] {
  if (!Array.isArray(items)) {
    return []
  }
  return items
    .map(item => (item && typeof item === 'object' ? (item as { uri?: unknown }).uri : undefined))
    .filter((uri): uri is string => typeof uri === 'string' && !uri.startsWith('data:'))
}

/** Buffers and images the glTF references by URI instead of embedding them. */
export function externalResources (bytes: Uint8Array): ExternalResources {
  const json = gltfJson(bytes)
  return { buffers: uris(json?.buffers), images: uris(json?.images) }
}

/** A transparent pixel, in place of images in other files; no material uses it. */
export const emptyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const isExternal = (uri: unknown) => typeof uri === 'string' && !uri.startsWith('data:')

/** Deletes every texture reference (`{ index }`) to one of `textures` below `node`. */
function dropTextureReferences (node: unknown, textures: Set<number>): void {
  if (!node || typeof node !== 'object') {
    return
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const index = (value as { index?: unknown } | null)?.index
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof index === 'number' && textures.has(index)) {
      Reflect.deleteProperty(node, key)
    } else {
      dropTextureReferences(value, textures)
    }
  }
}

/**
 * The glTF without the textures whose images are in other files: their
 * materials keep only their factors (base color, metalness, …), so a part
 * stays visible and keeps its color. A stand-in image would change it: a
 * transparent one hides parts with `alphaMode` MASK or BLEND, a black one
 * darkens them, and normal or emissive maps go wrong with any.
 */
export function withoutExternalImages (bytes: Uint8Array): Uint8Array {
  const json = gltfJson(bytes)
  const images = Array.isArray(json?.images) ? json.images as Array<{ uri?: unknown }> : []
  const external = new Set(images.flatMap((image, index) => (isExternal(image?.uri) ? [index] : [])))
  if (!json || external.size === 0) {
    return bytes
  }
  for (const index of external) {
    images[index]!.uri = emptyImage
  }
  // A texture's image is its `source`, or that of an extension (WebP, KTX2, …).
  const textures = Array.isArray(json.textures) ? json.textures as Array<Record<string, unknown>> : []
  const dropped = new Set(textures.flatMap((texture, index) => {
    const sources = [texture?.source, ...Object.values((texture?.extensions ?? {}) as Record<string, { source?: unknown }>).map(extension => extension?.source)]
    return sources.some(source => typeof source === 'number' && external.has(source)) ? [index] : []
  }))
  dropTextureReferences(json.materials, dropped)
  return encodeGltf(bytes, json)
}

/** The same file with new JSON: the text of a `.gltf`, or the JSON chunk of a `.glb`. */
function encodeGltf (original: Uint8Array, json: Record<string, unknown>): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const view = new DataView(original.buffer, original.byteOffset, original.byteLength)
  if (original.byteLength < 20 || view.getUint32(0, true) !== glbMagic) {
    return text
  }
  // Chunks are 4-byte aligned; JSON is padded with spaces.
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20)
  padded.set(text)
  const rest = original.subarray(20 + view.getUint32(12, true))
  const glb = new Uint8Array(20 + padded.length + rest.length)
  const out = new DataView(glb.buffer)
  out.setUint32(0, glbMagic, true)
  out.setUint32(4, view.getUint32(4, true), true)
  out.setUint32(8, glb.length, true)
  out.setUint32(12, padded.length, true)
  out.setUint32(16, jsonChunk, true)
  glb.set(padded, 20)
  glb.set(rest, 20 + padded.length)
  return glb
}
