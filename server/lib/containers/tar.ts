// A minimal POSIX ustar writer for the engine's archive upload
// (`PUT /containers/{id}/archive`). Only regular files and directories, read
// permissions for everyone, owned by root: the containers read their
// configuration and never write it.

export interface TarEntry {
  /** Relative path below the archive root, `/`-separated, e.g. `security/trustlist.json`. */
  path: string
  content: Uint8Array | string
}

const block = 512
const encoder = new TextEncoder()

function writeString (header: Uint8Array, offset: number, length: number, value: string): void {
  const bytes = encoder.encode(value)
  if (bytes.length > length) {
    throw new Error(`Tar field too long: ${value}`)
  }
  header.set(bytes, offset)
}

function writeOctal (header: Uint8Array, offset: number, length: number, value: number): void {
  writeString(header, offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`)
}

function splitPath (path: string): { name: string, prefix: string } {
  if (encoder.encode(path).length <= 100) {
    return { name: path, prefix: '' }
  }
  const cut = path.lastIndexOf('/', 155)
  if (cut <= 0 || encoder.encode(path.slice(cut + 1)).length > 100) {
    throw new Error(`Tar path too long: ${path}`)
  }
  return { name: path.slice(cut + 1), prefix: path.slice(0, cut) }
}

function header (path: string, size: number, directory: boolean, mtime: number): Uint8Array {
  const result = new Uint8Array(block)
  const { name, prefix } = splitPath(path)
  writeString(result, 0, 100, name)
  writeOctal(result, 100, 8, directory ? 0o755 : 0o644)
  writeOctal(result, 108, 8, 0)
  writeOctal(result, 116, 8, 0)
  writeOctal(result, 124, 12, size)
  writeOctal(result, 136, 12, mtime)
  // The checksum is computed with its own field set to spaces.
  result.fill(0x20, 148, 156)
  result[156] = directory ? 0x35 : 0x30
  writeString(result, 257, 6, 'ustar\0')
  writeString(result, 263, 2, '00')
  writeString(result, 265, 32, 'root')
  writeString(result, 297, 32, 'root')
  writeString(result, 345, 155, prefix)
  let sum = 0
  for (const byte of result) {
    sum += byte
  }
  writeString(result, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `)
  return result
}

function normalize (path: string): string {
  const parts = path.split('/').filter(part => part !== '' && part !== '.')
  if (parts.length === 0 || parts.includes('..')) {
    throw new Error(`Invalid tar path: ${path}`)
  }
  return parts.join('/')
}

/** Builds a tar archive with the files and every directory above them. */
export function createTar (entries: TarEntry[], mtime = Math.floor(Date.now() / 1000)): Uint8Array {
  const chunks: Uint8Array[] = []
  const directories = new Set<string>()
  for (const entry of entries) {
    const path = normalize(entry.path)
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index++) {
      const directory = `${parts.slice(0, index).join('/')}/`
      if (!directories.has(directory)) {
        directories.add(directory)
        chunks.push(header(directory, 0, true, mtime))
      }
    }
    const content = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content
    chunks.push(header(path, content.length, false, mtime), content)
    const padding = (block - (content.length % block)) % block
    if (padding > 0) {
      chunks.push(new Uint8Array(padding))
    }
  }
  chunks.push(new Uint8Array(block * 2))
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const archive = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    archive.set(chunk, offset)
    offset += chunk.length
  }
  return archive
}
