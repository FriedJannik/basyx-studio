import type { IfcElementInfo, MeshBatch } from '../types'

// Messages between the viewer and its parser worker.

export type ParserRequest
  = | { type: 'parse', id: number, format: 'ifc' | 'step', bytes: Uint8Array, wasmUrl: string }
    | { type: 'element', id: number, expressId: number }

export type ParserResponse
  = | { type: 'progress', id: number, progress: number | null }
    | { type: 'meshes', id: number, meshes: MeshBatch[] }
    | { type: 'element', id: number, element: IfcElementInfo }
    | { type: 'error', id: number, message: string }

/** What the worker posts: responses, and once at startup that it is ready. */
export type WorkerMessage = ParserResponse | { type: 'ready' }

/** The buffers of the batches, to transfer them instead of copying. */
export function transferablesOf (meshes: MeshBatch[]): ArrayBuffer[] {
  return meshes.flatMap(mesh => [mesh.positions, mesh.normals, mesh.indices, mesh.vertexColors, mesh.ids]
    .filter(array => array !== null)
    .map(array => array.buffer as ArrayBuffer))
}
