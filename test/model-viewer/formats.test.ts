import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectModelFormat, fileExtension, refineModelFormat } from '../../packages/model-viewer/src/formats'
import { externalResources, gltfJson, withoutExternalImages } from '../../packages/model-viewer/src/gltf'

// Which files the 3D view offers and reads (packages/model-viewer).

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../test-setup/fixtures/models3d/${name}`, import.meta.url)))

describe('fileExtension', () => {
  it('reads the extension of names, paths and URLs', () => {
    expect(fileExtension('bracket.STL')).toBe('stl')
    expect(fileExtension('/aasx/files/models3d/bracket.step')).toBe('step')
    expect(fileExtension('https://example.com/a/model.glb?token=1#x')).toBe('glb')
    expect(fileExtension('README')).toBe('')
    expect(fileExtension('.hidden')).toBe('')
    expect(fileExtension(null)).toBe('')
  })
})

describe('detectModelFormat', () => {
  it('knows the media types of every format', () => {
    expect(detectModelFormat({ contentType: 'model/stl' })).toBe('stl')
    expect(detectModelFormat({ contentType: 'application/vnd.ms-pki.stl' })).toBe('stl')
    expect(detectModelFormat({ contentType: 'model/obj' })).toBe('obj')
    expect(detectModelFormat({ contentType: 'model/gltf+json' })).toBe('gltf')
    expect(detectModelFormat({ contentType: 'model/gltf-binary; charset=binary' })).toBe('glb')
    expect(detectModelFormat({ contentType: 'model/ifc' })).toBe('ifc')
    expect(detectModelFormat({ contentType: 'MODEL/STEP' })).toBe('step')
  })

  it('falls back to the extension for generic media types', () => {
    expect(detectModelFormat({ contentType: 'application/octet-stream', fileName: '/files/part.stp' })).toBe('step')
    expect(detectModelFormat({ contentType: '', fileName: 'house.ifc' })).toBe('ifc')
    // IDTA 02026's template has image/png as DigitalFile media type; instances may keep it.
    expect(detectModelFormat({ contentType: 'image/png', fileName: 'model.glb' })).toBe('glb')
  })

  it('lets the extension tell IFC from STEP, which share media types', () => {
    expect(detectModelFormat({ contentType: 'application/x-step', fileName: 'workshop.ifc' })).toBe('ifc')
    expect(detectModelFormat({ contentType: 'model/step', fileName: 'part.step' })).toBe('step')
    expect(detectModelFormat({ contentType: 'application/step' })).toBe('step')
    expect(detectModelFormat({ contentType: 'model/gltf+json', fileName: 'model.glb' })).toBe('glb')
  })

  it('offers nothing for other files', () => {
    expect(detectModelFormat({ contentType: 'application/pdf', fileName: 'manual.pdf' })).toBeNull()
    expect(detectModelFormat({ contentType: 'application/octet-stream', fileName: 'gearbox.jt' })).toBeNull()
    expect(detectModelFormat({})).toBeNull()
  })
})

describe('refineModelFormat', () => {
  it('reads the schema of STEP files', () => {
    expect(refineModelFormat('step', fixture('workshop.ifc'))).toBe('ifc')
    expect(refineModelFormat('ifc', fixture('bracket.step'))).toBe('step')
  })

  it('tells binary from JSON glTF', () => {
    expect(refineModelFormat('gltf', fixture('bracket.glb'))).toBe('glb')
    expect(refineModelFormat('glb', fixture('bracket.gltf'))).toBe('gltf')
  })

  it('keeps other formats', () => {
    expect(refineModelFormat('stl', fixture('bracket.stl'))).toBe('stl')
    expect(refineModelFormat('step', new TextEncoder().encode('not a step file'))).toBe('step')
  })
})

describe('externalResources', () => {
  it('finds geometry in other files', () => {
    expect(externalResources(fixture('bracket-external.gltf'))).toEqual({ buffers: ['bracket.bin'], images: [] })
  })

  it('accepts embedded data', () => {
    expect(externalResources(fixture('bracket.gltf'))).toEqual({ buffers: [], images: [] })
    expect(externalResources(fixture('bracket.glb'))).toEqual({ buffers: [], images: [] })
  })

  it('finds textures in other files', () => {
    expect(externalResources(fixture('bracket-external-texture.gltf'))).toEqual({ buffers: [], images: ['bracket-color.png'] })
  })

  it('reads the JSON chunk of a binary glTF', () => {
    expect(gltfJson(fixture('bracket.glb'))?.asset).toEqual({ version: '2.0', generator: 'BaSyx Studio test fixtures' })
    expect(gltfJson(new TextEncoder().encode('{ broken'))).toBeNull()
  })
})

/** A binary glTF of a JSON chunk and a binary chunk. */
function glbOf (json: object, bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = Math.ceil(text.length / 4) * 4
  const glb = new Uint8Array(12 + 8 + jsonLength + 8 + bin.length).fill(0x20, 20, 20 + jsonLength)
  const view = new DataView(glb.buffer)
  view.setUint32(0, 0x46_54_6C_67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, glb.length, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4E_4F_53_4A, true)
  glb.set(text, 20)
  view.setUint32(20 + jsonLength, bin.length, true)
  view.setUint32(24 + jsonLength, 0x00_4E_49_42, true)
  glb.set(bin, 28 + jsonLength)
  return glb
}

describe('withoutExternalImages', () => {
  it('removes textures in other files from the materials and keeps their factors', () => {
    const result = withoutExternalImages(fixture('bracket-external-texture.gltf'))
    const json = gltfJson(result) as { materials: Array<Record<string, any>>, images: Array<{ uri: string }> }
    expect(json.materials[0]).toMatchObject({ alphaMode: 'MASK', pbrMetallicRoughness: { baseColorFactor: [0.18, 0.42, 0.78, 1] } })
    expect(json.materials[0]!.pbrMetallicRoughness.baseColorTexture).toBeUndefined()
    // The loader fetches nothing next to the file.
    expect(externalResources(result)).toEqual({ buffers: [], images: [] })
  })

  it('keeps embedded textures and extension textures of other images', () => {
    const json = {
      asset: { version: '2.0' },
      images: [{ uri: 'data:image/png;base64,AAAA' }, { uri: 'normal.png' }, { uri: 'emissive.webp' }],
      textures: [{ source: 0 }, { source: 1 }, { extensions: { EXT_texture_webp: { source: 2 } } }],
      materials: [{
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
        normalTexture: { index: 1, scale: 1 },
        emissiveTexture: { index: 2 },
        extensions: { KHR_materials_clearcoat: { clearcoatNormalTexture: { index: 1 } } },
      }],
    }
    const result = gltfJson(withoutExternalImages(new TextEncoder().encode(JSON.stringify(json)))) as typeof json
    expect(result.materials[0]).toEqual({ pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, extensions: { KHR_materials_clearcoat: {} } })
  })

  it('rewrites the JSON chunk of a binary glTF and keeps its binary chunk', () => {
    const bin = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const glb = glbOf({ asset: { version: '2.0' }, images: [{ uri: 'color.png' }], textures: [{ source: 0 }], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }] }, bin)
    const result = withoutExternalImages(glb)
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength)
    expect(view.getUint32(8, true)).toBe(result.byteLength)
    expect((gltfJson(result) as { materials: unknown[] }).materials).toEqual([{ pbrMetallicRoughness: {} }])
    expect([...result.subarray(result.byteLength - bin.length)]).toEqual([...bin])
    expect(refineModelFormat('gltf', result)).toBe('glb')
  })

  it('returns files without images in other files unchanged', () => {
    const bytes = fixture('bracket.glb')
    expect(withoutExternalImages(bytes)).toBe(bytes)
  })
})
