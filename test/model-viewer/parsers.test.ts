import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { IfcModel } from '../../packages/model-viewer/src/parsers/ifc'
import { readStep } from '../../packages/model-viewer/src/parsers/step'

// The IFC (web-ifc) and STEP (OpenCascade) parsers of the 3D view, run in
// Node on the fixtures of test-setup/fixtures/generate-models3d.mjs.

const require = createRequire(new URL('../../packages/model-viewer/package.json', import.meta.url))
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../test-setup/fixtures/models3d/${name}`, import.meta.url)))

function bounds (positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const [i, value] of positions.entries()) {
    min[i % 3] = Math.min(min[i % 3]!, value)
    max[i % 3] = Math.max(max[i % 3]!, value)
  }
  return max.map((value, axis) => Number((value - min[axis]!).toFixed(3)))
}

describe('IFC', () => {
  const wasm = require.resolve('web-ifc/web-ifc-node.wasm')

  it('reads the geometry of every element, merged per color', async () => {
    const model = await IfcModel.open(fixture('workshop.ifc'), wasm)
    try {
      const progress: Array<number | null> = []
      const meshes = model.meshes(value => progress.push(value))
      // Plaster (two walls), concrete (slab) and glass (panel).
      expect(meshes).toHaveLength(3)
      const glass = meshes.find(mesh => mesh.color![3] < 1)!
      expect(glass.color![3]).toBeCloseTo(0.4)
      const plaster = meshes.find(mesh => mesh.color![0] > 0.8)!
      expect(new Set(plaster.ids)).toHaveLength(2)
      for (const mesh of meshes) {
        expect(mesh.positions.length).toBe(mesh.normals!.length)
        expect(mesh.ids).toHaveLength(mesh.positions.length / 3)
        expect(Math.max(...mesh.indices)).toBeLessThan(mesh.positions.length / 3)
      }
      expect(progress.at(-1)).toBe(1)
    } finally {
      model.close()
    }
  })

  it('reads the attributes, properties and quantities of an element', async () => {
    const model = await IfcModel.open(fixture('workshop.ifc'), wasm)
    try {
      const plaster = model.meshes().find(mesh => mesh.color![0] > 0.8)!
      const wallIds = [...new Set(plaster.ids)]
      const walls = await Promise.all(wallIds.map(id => model.element(id)))
      const wall = walls.find(item => item.name === 'Wall 01')!
      expect(wall.type).toBe('IfcWall')
      expect(wall.globalId).toMatch(/^1BaSyxStudio\d{10}$/)
      expect(wall.groups).toEqual([
        { name: 'Attributes', properties: [{ name: 'Description', value: 'Exterior wall' }, { name: 'Tag', value: 'W-01' }, { name: 'PredefinedType', value: 'STANDARD' }] },
        { name: 'Pset_WallCommon', properties: [{ name: 'IsExternal', value: 'true' }, { name: 'FireRating', value: 'F90' }, { name: 'ThermalTransmittance', value: '0.24' }] },
        { name: 'Qto_WallBaseQuantities', properties: [{ name: 'Length', value: '5' }, { name: 'NetVolume', value: '3' }] },
      ])
    } finally {
      model.close()
    }
  })
})

describe('STEP', () => {
  const wasm = require.resolve('occt-import-js/dist/occt-import-js.wasm')

  it('reads the solid with its color, in millimetres', async () => {
    const meshes = await readStep(fixture('bracket.step'), wasm)
    expect(meshes).toHaveLength(1)
    const [bracket] = meshes
    expect(bounds(bracket!.positions)).toEqual([60, 30, 40])
    expect(bracket!.color?.slice(0, 3).map(value => Number(value.toFixed(2)))).toEqual([0.85, 0.45, 0.1])
    expect(bracket!.indices.length % 3).toBe(0)
    expect(bracket!.ids).toBeNull()
  })

  it('fails on a file that is not STEP', async () => {
    await expect(readStep(new TextEncoder().encode('not a step file'), wasm)).rejects.toThrow('could not be read')
  })
})
