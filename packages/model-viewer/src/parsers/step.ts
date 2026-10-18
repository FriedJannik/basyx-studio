import type { MeshBatch } from '../types'
// @ts-expect-error occt-import-js ships no types; `Occt` below describes what is used.
import occtimportjs from 'occt-import-js'

// Reads STEP (ISO 10303-21) with occt-import-js (LGPL-2.1), OpenCascade
// compiled to WebAssembly, in a worker. One batch per solid, with the colors
// of its faces where the file has them.

interface OcctMesh {
  name?: string
  color?: [number, number, number]
  brep_faces?: Array<{ first: number, last: number, color: [number, number, number] | null }>
  attributes: { position: { array: number[] }, normal?: { array: number[] } }
  index: { array: number[] }
}

interface OcctResult {
  success: boolean
  meshes: OcctMesh[]
}

interface Occt {
  ReadStepFile: (content: Uint8Array, params: Record<string, unknown> | null) => OcctResult
}

let occt: Promise<Occt> | null = null

export async function readStep (bytes: Uint8Array, wasmUrl: string): Promise<MeshBatch[]> {
  occt ??= (occtimportjs as (options: Record<string, unknown>) => Promise<Occt>)({ locateFile: () => wasmUrl })
  const result = (await occt).ReadStepFile(bytes, {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  })
  if (!result.success) {
    throw new Error('The STEP file could not be read.')
  }
  return result.meshes.map(mesh => toBatch(mesh))
}

/** OpenCascade's colors are linear; batches carry sRGB. */
function srgb (color: [number, number, number]): [number, number, number] {
  return color.map(value => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055)) as [number, number, number]
}

function toBatch (mesh: OcctMesh): MeshBatch {
  const positions = Float32Array.from(mesh.attributes.position.array)
  const indices = Uint32Array.from(mesh.index.array)
  const faces = mesh.brep_faces ?? []
  const color = mesh.color ? srgb(mesh.color) : null
  let vertexColors: Float32Array | null = null
  // Faces with their own color: every vertex of their triangles gets it,
  // the others keep the solid's color.
  if (faces.some(face => face.color)) {
    const base = color ?? [0.75, 0.75, 0.75]
    vertexColors = new Float32Array(positions.length)
    for (let v = 0; v < positions.length / 3; v++) {
      vertexColors.set(base, v * 3)
    }
    for (const face of faces) {
      if (!face.color) {
        continue
      }
      const faceColor = srgb(face.color)
      for (let triangle = face.first; triangle <= face.last; triangle++) {
        for (let corner = 0; corner < 3; corner++) {
          vertexColors.set(faceColor, indices[triangle * 3 + corner]! * 3)
        }
      }
    }
  }
  return {
    name: mesh.name ?? null,
    positions,
    normals: mesh.attributes.normal ? Float32Array.from(mesh.attributes.normal.array) : null,
    indices,
    color: color ? [...color, 1] : null,
    vertexColors,
    ids: null,
  }
}
