// Which 3D format a file has: from its media type and name before it is
// loaded, refined from its first bytes after. Without three.js, so Studio
// can decide whether to offer the 3D view without loading the viewer.
// Based on the BaSyx AAS Web UI (aas-web-ui/src/utils/AAS/CadFormat.ts at
// ed7ad908, https://github.com/eclipse-basyx/basyx-aas-web-ui), © the Eclipse
// BaSyx Authors, MIT License.

export const modelFormats = ['stl', 'obj', 'gltf', 'glb', 'ifc', 'step'] as const
export type ModelFormat = (typeof modelFormats)[number]

/** Display names of the formats. */
export const modelFormatLabels: Record<ModelFormat, string> = {
  stl: 'STL',
  obj: 'OBJ',
  gltf: 'glTF',
  glb: 'GLB',
  ifc: 'IFC',
  step: 'STEP',
}

const mediaTypes: Record<string, ModelFormat> = {
  'model/stl': 'stl',
  'model/x.stl-binary': 'stl',
  'model/x.stl-ascii': 'stl',
  'application/sla': 'stl',
  'application/stl': 'stl',
  'application/vnd.ms-pki.stl': 'stl',
  'text/stl': 'stl',
  'text/x-stl': 'stl',
  'text/x-sla': 'stl',
  'model/obj': 'obj',
  'application/obj': 'obj',
  'text/obj': 'obj',
  'model/gltf+json': 'gltf',
  'model/gltf-binary': 'glb',
  'model/ifc': 'ifc',
  'application/ifc': 'ifc',
  'application/x-ifc': 'ifc',
  'model/step': 'step',
  'application/step': 'step',
  'application/x-step': 'step',
  'application/p21': 'step',
}

const extensions: Record<string, ModelFormat> = {
  stl: 'stl',
  obj: 'obj',
  gltf: 'gltf',
  glb: 'glb',
  ifc: 'ifc',
  stp: 'step',
  step: 'step',
  p21: 'step',
}

/** IFC files are STEP files too; their media type does not tell them apart. */
const stepFamily = new Set<ModelFormat>(['ifc', 'step'])

export interface FileDescription {
  /** The declared media type, e.g. a File element's `contentType`. */
  contentType?: string | null
  /** A file name, path or URL; its extension is the fallback. */
  fileName?: string | null
}

/** The extension of a file name, path or URL, in lower case, or `''`. */
export function fileExtension (name: string | null | undefined): string {
  if (!name) {
    return ''
  }
  const segment = name.split(/[?#]/, 1)[0]!.split('/').pop() ?? ''
  const dot = segment.lastIndexOf('.')
  return dot <= 0 ? '' : segment.slice(dot + 1).toLowerCase()
}

/**
 * The 3D format of a file, or `null` if it has none the viewer reads. A
 * specific media type wins; for a generic one (`application/octet-stream`)
 * or a STEP media type, the extension decides.
 */
export function detectModelFormat (file: FileDescription): ModelFormat | null {
  const mediaType = (file.contentType ?? '').split(';', 1)[0]!.trim().toLowerCase()
  const byType = mediaTypes[mediaType] ?? null
  const byExtension = extensions[fileExtension(file.fileName)] ?? null
  if (byType && stepFamily.has(byType) && byExtension && stepFamily.has(byExtension)) {
    return byExtension
  }
  if (byType === 'gltf' && byExtension === 'glb') {
    return 'glb'
  }
  return byType ?? byExtension
}

const decoder = new TextDecoder('latin1')

/**
 * The format as the file's first bytes show it: a binary glTF starts with
 * `glTF`, and the header of a STEP file names its schema (`IFC2X3`, `IFC4`,
 * or e.g. `AP214`/`AP242` for CAD). Other formats stay as detected.
 */
export function refineModelFormat (format: ModelFormat, bytes: Uint8Array): ModelFormat {
  if (format === 'gltf' || format === 'glb') {
    return decoder.decode(bytes.subarray(0, 4)) === 'glTF' ? 'glb' : 'gltf'
  }
  if (stepFamily.has(format)) {
    const header = decoder.decode(bytes.subarray(0, 4096))
    const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(header)?.[1]
    if (schema) {
      return /^IFC/i.test(schema.trim()) ? 'ifc' : 'step'
    }
  }
  return format
}
