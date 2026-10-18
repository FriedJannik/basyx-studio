import type { IfcElementInfo, IfcProperty, IfcPropertyGroup, MeshBatch, ProgressCallback } from '../types'
import { IfcAPI } from 'web-ifc'

// Reads IFC with web-ifc (MPL-2.0) in a worker: the triangles of every
// element, merged per color, and the properties of one element on request.

interface Chunk {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  ids: Uint32Array
}

interface ColorGroup {
  color: [number, number, number, number]
  chunks: Chunk[]
  vertices: number
  triangles: number
}

/** An open IFC model; `close` frees its memory in the WebAssembly module. */
export class IfcModel {
  private constructor (private readonly api: IfcAPI, private readonly modelId: number) {}

  static async open (bytes: Uint8Array, wasmUrl: string): Promise<IfcModel> {
    const api = new IfcAPI()
    // Single-threaded: the multithreaded build needs cross-origin isolation.
    await api.Init(() => wasmUrl, true)
    const modelId = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true })
    if (modelId < 0) {
      api.Dispose()
      throw new Error('The IFC file could not be read.')
    }
    return new IfcModel(api, modelId)
  }

  /** All geometry, merged into one batch per color. */
  meshes (onProgress?: ProgressCallback): MeshBatch[] {
    const groups = new Map<string, ColorGroup>()
    this.api.StreamAllMeshes(this.modelId, (mesh, index, total) => {
      const placed = mesh.geometries
      for (let i = 0; i < placed.size(); i++) {
        const item = placed.get(i)
        const geometry = this.api.GetGeometry(this.modelId, item.geometryExpressID)
        const vertexData = this.api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
        const indexData = this.api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())
        const m = item.flatTransformation
        const count = vertexData.length / 6
        const chunk: Chunk = {
          positions: new Float32Array(count * 3),
          normals: new Float32Array(count * 3),
          indices: Uint32Array.from(indexData),
          ids: new Uint32Array(count).fill(mesh.expressID),
        }
        // Vertices are interleaved (x, y, z, nx, ny, nz); the placement is a
        // column-major 4×4 matrix without scaling, so it also turns normals.
        for (let v = 0; v < count; v++) {
          const o = v * 6
          const x = vertexData[o]!
          const y = vertexData[o + 1]!
          const z = vertexData[o + 2]!
          const nx = vertexData[o + 3]!
          const ny = vertexData[o + 4]!
          const nz = vertexData[o + 5]!
          chunk.positions[v * 3] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!
          chunk.positions[v * 3 + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!
          chunk.positions[v * 3 + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!
          chunk.normals[v * 3] = m[0]! * nx + m[4]! * ny + m[8]! * nz
          chunk.normals[v * 3 + 1] = m[1]! * nx + m[5]! * ny + m[9]! * nz
          chunk.normals[v * 3 + 2] = m[2]! * nx + m[6]! * ny + m[10]! * nz
        }
        geometry.delete()
        const { x, y, z, w } = item.color
        const key = [x, y, z, w].map(value => value.toFixed(3)).join(',')
        let group = groups.get(key)
        if (!group) {
          group = { color: [x, y, z, w], chunks: [], vertices: 0, triangles: 0 }
          groups.set(key, group)
        }
        group.chunks.push(chunk)
        group.vertices += count
        group.triangles += chunk.indices.length
      }
      onProgress?.(total > 0 ? (index + 1) / total : null)
    })
    return [...groups.values()].map(group => merge(group))
  }

  /** The attributes, property sets and quantity sets of an element. */
  async element (expressId: number): Promise<IfcElementInfo> {
    const line = this.api.GetLine(this.modelId, expressId, false) as Record<string, any>
    const attributes: IfcProperty[] = []
    for (const key of ['Description', 'ObjectType', 'Tag', 'PredefinedType', 'LongName']) {
      const value = text(line[key])
      if (value) {
        attributes.push({ name: key, value })
      }
    }
    const groups: IfcPropertyGroup[] = attributes.length > 0 ? [{ name: 'Attributes', properties: attributes }] : []
    // Not recursive: web-ifc 0.0.78 returns no sets at all when asked to
    // resolve them together with the type's; references are resolved here.
    const sets = await this.api.properties.getPropertySets(this.modelId, expressId, false) as Array<Record<string, any>>
    const types = await this.api.properties.getTypeProperties(this.modelId, expressId, false) as Array<Record<string, any>>
    const typeSets = types.flatMap(type => ((type.HasPropertySets ?? []) as unknown[]).map(reference => this.resolve(reference)))
    for (const set of [...sets, ...typeSets]) {
      if (!set) {
        continue
      }
      const items = ((set.HasProperties ?? set.Quantities ?? []) as unknown[]).map(reference => this.resolve(reference))
      const properties = items
        .filter((item): item is Record<string, any> => item !== null)
        .map(item => ({ name: text(item.Name) ?? '', value: propertyValue(item) }))
        .filter(property => property.name !== '')
      if (properties.length > 0) {
        groups.push({ name: text(set.Name) ?? this.api.GetNameFromTypeCode(set.type), properties })
      }
    }
    return {
      expressId,
      type: this.api.GetNameFromTypeCode(line.type),
      name: text(line.Name),
      globalId: text(line.GlobalId),
      groups,
    }
  }

  close (): void {
    this.api.CloseModel(this.modelId)
    this.api.Dispose()
  }

  /** The line a reference (`{ type: 5, value: id }`) points to, or the value itself. */
  private resolve (reference: unknown): Record<string, any> | null {
    if (!reference || typeof reference !== 'object') {
      return null
    }
    const { type, value } = reference as { type?: number, value?: unknown }
    if (type === 5 && typeof value === 'number') {
      return this.api.GetLine(this.modelId, value, false) as Record<string, any>
    }
    return reference as Record<string, any>
  }
}

function merge (group: ColorGroup): MeshBatch {
  const positions = new Float32Array(group.vertices * 3)
  const normals = new Float32Array(group.vertices * 3)
  const ids = new Uint32Array(group.vertices)
  const indices = new Uint32Array(group.triangles)
  let vertex = 0
  let index = 0
  for (const chunk of group.chunks) {
    positions.set(chunk.positions, vertex * 3)
    normals.set(chunk.normals, vertex * 3)
    ids.set(chunk.ids, vertex)
    for (let i = 0; i < chunk.indices.length; i++) {
      indices[index + i] = chunk.indices[i]! + vertex
    }
    vertex += chunk.ids.length
    index += chunk.indices.length
  }
  return { name: null, positions, normals, indices, color: group.color, vertexColors: null, ids }
}

/** The text of an IFC value (`{ type, value }`), or `null`. */
function text (value: unknown): string | null {
  const raw = value && typeof value === 'object' && 'value' in value ? (value as { value: unknown }).value : value
  if ([null, undefined, ''].includes(raw as string | null | undefined)) {
    return null
  }
  if (typeof raw === 'number') {
    return Number.isInteger(raw) ? String(raw) : String(Number(raw.toPrecision(10)))
  }
  // IFC booleans and logicals: .T. and .F.
  if (['T', true].includes(raw as string | boolean)) {
    return 'true'
  }
  if (['F', false].includes(raw as string | boolean)) {
    return 'false'
  }
  return String(raw)
}

const valueKeys = ['NominalValue', 'LengthValue', 'AreaValue', 'VolumeValue', 'CountValue', 'WeightValue', 'TimeValue', 'UpperBoundValue', 'LowerBoundValue']

function propertyValue (item: Record<string, any>): string {
  for (const key of valueKeys) {
    const value = text(item[key])
    if (value !== null) {
      return value
    }
  }
  for (const key of ['EnumerationValues', 'ListValues']) {
    if (Array.isArray(item[key])) {
      return (item[key] as unknown[]).map(entry => text(entry)).filter(Boolean).join(', ')
    }
  }
  return ''
}
