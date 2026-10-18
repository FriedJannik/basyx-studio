// Generates the 3D model fixtures: small models in every format the 3D view
// reads (test-setup/fixtures/models3d/), and an AASX with File elements of
// them and an IDTA 02026 Models3D submodel (open/studio-3d-models.aasx),
// verified with AAS Core 3.1. The models are written by hand here, so the
// fixtures carry no third-party content.
//
// Run with: pnpm testenv:fixtures

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const { jsonization, verification } = require('@aas-core-works/aas-core3.1-typescript')
const { NewPackaging } = require('aas-package3-typescript')

const fixturesDir = dirname(fileURLToPath(import.meta.url))
const modelsDir = join(fixturesDir, 'models3d')

// ---------------------------------------------------------------------------
// An L-shaped bracket: a profile in the x-z plane, extruded along y (mm)
// ---------------------------------------------------------------------------

const profile = [[0, 0], [60, 0], [60, 8], [8, 8], [8, 40], [0, 40]]
const depth = 30
// Vertices: the profile at y = 0 (0–5), then at y = depth (6–11).
const vertices = [...profile.map(([x, z]) => [x, 0, z]), ...profile.map(([x, z]) => [x, depth, z])]
const n = profile.length
// Faces with their corners counterclockwise seen from outside, each starting
// at the profile's corner (0, 0), from which the whole L is visible.
const faces = [
  profile.map((_, i) => i), // front, normal -y
  profile.map((_, i) => n + ((n - i) % n)), // back, normal +y
  ...profile.map((_, i) => {
    const next = (i + 1) % n
    return [next, i, n + i, n + next]
  }),
]

function sub (a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function normalize (v) {
  const length = Math.hypot(...v)
  return v.map(value => value / length)
}

/** Newell's normal of a planar polygon. */
function faceNormal (face) {
  const sum = [0, 0, 0]
  for (let i = 0; i < face.length; i++) {
    const a = vertices[face[i]]
    const b = vertices[face[(i + 1) % face.length]]
    sum[0] += (a[1] - b[1]) * (a[2] + b[2])
    sum[1] += (a[2] - b[2]) * (a[0] + b[0])
    sum[2] += (a[0] - b[0]) * (a[1] + b[1])
  }
  return normalize(sum)
}

// The profile is star-shaped from its first corner, so a fan triangulates every face.
const triangles = faces.flatMap(face => face.slice(1, -1).map((_, i) => ({ corners: [face[0], face[i + 1], face[i + 2]], normal: faceNormal(face) })))

function binaryStl () {
  const bytes = Buffer.alloc(84 + triangles.length * 50)
  bytes.write('BaSyx Studio test fixture: L bracket', 0, 'ascii')
  bytes.writeUInt32LE(triangles.length, 80)
  for (const [t, { corners, normal }] of triangles.entries()) {
    let offset = 84 + t * 50
    for (const value of [...normal, ...corners.flatMap(index => vertices[index])]) {
      bytes.writeFloatLE(value, offset)
      offset += 4
    }
  }
  return bytes
}

function obj () {
  return [
    '# BaSyx Studio test fixture: L bracket (mm)',
    'o Bracket',
    ...vertices.map(([x, y, z]) => `v ${x} ${y} ${z}`),
    ...faces.map(face => `f ${face.map(index => index + 1).join(' ')}`),
    '',
  ].join('\n')
}

/** A glTF 2.0 document of the bracket (m) with flat normals, and its binary buffer. */
function gltfParts () {
  const positions = triangles.flatMap(({ corners }) => corners.flatMap(index => vertices[index].map(value => value / 1000)))
  const normals = triangles.flatMap(({ normal }) => [...normal, ...normal, ...normal])
  const buffer = Buffer.alloc((positions.length + normals.length) * 4)
  for (const [i, value] of [...positions, ...normals].entries()) {
    buffer.writeFloatLE(value, i * 4)
  }
  const count = positions.length / 3
  const min = [0, 1, 2].map(axis => Math.min(...positions.filter((_, i) => i % 3 === axis)))
  const max = [0, 1, 2].map(axis => Math.max(...positions.filter((_, i) => i % 3 === axis)))
  const json = {
    asset: { version: '2.0', generator: 'BaSyx Studio test fixtures' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    // glTF is y-up; the bracket stands on the x-y plane, z up.
    nodes: [{ mesh: 0, name: 'Bracket', rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] }],
    meshes: [{ name: 'Bracket', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
    materials: [{ name: 'Anodized aluminium', pbrMetallicRoughness: { baseColorFactor: [0.18, 0.42, 0.78, 1], metallicFactor: 0.6, roughnessFactor: 0.35 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length * 4 },
      { buffer: 0, byteOffset: positions.length * 4, byteLength: normals.length * 4 },
    ],
    buffers: [{ byteLength: buffer.length }],
  }
  return { json, buffer }
}

function gltfEmbedded () {
  const { json, buffer } = gltfParts()
  json.buffers[0].uri = `data:application/octet-stream;base64,${buffer.toString('base64')}`
  return `${JSON.stringify(json, null, 2)}\n`
}

/** A glTF that keeps its geometry in a file next to it, which a File element cannot hold. */
function gltfExternal () {
  const { json } = gltfParts()
  json.buffers[0].uri = 'bracket.bin'
  return `${JSON.stringify(json, null, 2)}\n`
}

/**
 * A glTF whose base color texture is in a file next to it, with alpha
 * masking: shown without the texture, it must stay visible.
 */
function gltfExternalTexture () {
  const { json, buffer } = gltfParts()
  json.buffers[0].uri = `data:application/octet-stream;base64,${buffer.toString('base64')}`
  json.images = [{ uri: 'bracket-color.png' }]
  json.textures = [{ source: 0 }]
  Object.assign(json.materials[0], { alphaMode: 'MASK', alphaCutoff: 0.5 })
  json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 }
  return `${JSON.stringify(json, null, 2)}\n`
}

function glb () {
  const { json, buffer } = gltfParts()
  const pad = (bytes, fill) => Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4, fill)])
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20)
  const binChunk = pad(buffer, 0)
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)
  const chunkHeader = (length, type) => {
    const bytes = Buffer.alloc(8)
    bytes.writeUInt32LE(length, 0)
    bytes.write(type, 4, 'ascii')
    return bytes
  }
  return Buffer.concat([header, chunkHeader(jsonChunk.length, 'JSON'), jsonChunk, chunkHeader(binChunk.length, 'BIN\0'), binChunk])
}

// ---------------------------------------------------------------------------
// STEP AP214: the bracket as a manifold solid B-rep with a color
// ---------------------------------------------------------------------------

function step () {
  const lines = []
  let next = 1
  const add = text => {
    const id = next++
    lines.push(`#${id}=${text};`)
    return `#${id}`
  }
  const real = value => (Number.isInteger(value) ? `${value}.` : String(value))
  const point = p => add(`CARTESIAN_POINT('',(${p.map(value => real(value)).join(',')}))`)
  const direction = d => add(`DIRECTION('',(${d.map(value => real(value)).join(',')}))`)

  const context = add('APPLICATION_CONTEXT(\'core data for automotive mechanical design processes\')')
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${context})`)
  const productContext = add(`PRODUCT_CONTEXT('',${context},'mechanical')`)
  const product = add(`PRODUCT('Bracket','L bracket','BaSyx Studio test fixture',(${productContext}))`)
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`)
  const definitionContext = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${context},'design')`)
  const definition = add(`PRODUCT_DEFINITION('design','',${formation},${definitionContext})`)
  const shape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`)
  const millimetre = add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))')
  const radian = add('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))')
  const steradian = add('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())')
  const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${millimetre},'distance_accuracy_value','confusion accuracy')`)
  const representationContext = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${millimetre},${radian},${steradian})) REPRESENTATION_CONTEXT('Context','3D'))`)

  const vertexPoints = vertices.map(v => add(`VERTEX_POINT('',${point(v)})`))
  const edges = new Map()
  const edgeOf = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (!edges.has(key)) {
      const [from, to] = a < b ? [a, b] : [b, a]
      const delta = sub(vertices[to], vertices[from])
      const line = add(`LINE('',${point(vertices[from])},${add(`VECTOR('',${direction(normalize(delta))},${real(Math.hypot(...delta))})`)})`)
      edges.set(key, { from, curve: add(`EDGE_CURVE('',${vertexPoints[from]},${vertexPoints[to]},${line},.T.)`) })
    }
    const edge = edges.get(key)
    return add(`ORIENTED_EDGE('',*,*,${edge.curve},${edge.from === a ? '.T.' : '.F.'})`)
  }
  const advancedFaces = faces.map(face => {
    const loop = add(`EDGE_LOOP('',(${face.map((index, i) => edgeOf(index, face[(i + 1) % face.length])).join(',')}))`)
    const bound = add(`FACE_OUTER_BOUND('',${loop},.T.)`)
    const reference = normalize(sub(vertices[face[1]], vertices[face[0]]))
    const plane = add(`PLANE('',${add(`AXIS2_PLACEMENT_3D('',${point(vertices[face[0]])},${direction(faceNormal(face))},${direction(reference)})`)})`)
    return add(`ADVANCED_FACE('',(${bound}),${plane},.T.)`)
  })
  const solid = add(`MANIFOLD_SOLID_BREP('Bracket',${add(`CLOSED_SHELL('',(${advancedFaces.join(',')}))`)})`)
  const origin = add(`AXIS2_PLACEMENT_3D('',${point([0, 0, 0])},${direction([0, 0, 1])},${direction([1, 0, 0])})`)
  const representation = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('Bracket',(${origin},${solid}),${representationContext})`)
  add(`SHAPE_DEFINITION_REPRESENTATION(${shape},${representation})`)

  // A color of the solid, as CAD systems write it.
  const colour = add('COLOUR_RGB(\'\',0.85,0.45,0.1)')
  const fill = add(`FILL_AREA_STYLE('',(${add(`FILL_AREA_STYLE_COLOUR('',${colour})`)}))`)
  const sideStyle = add(`SURFACE_SIDE_STYLE('',(${add(`SURFACE_STYLE_FILL_AREA(${fill})`)}))`)
  const assignment = add(`PRESENTATION_STYLE_ASSIGNMENT((${add(`SURFACE_STYLE_USAGE(.BOTH.,${sideStyle})`)}))`)
  const styled = add(`STYLED_ITEM('color',(${assignment}),${solid})`)
  add(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled}),${representationContext})`)

  return [
    'ISO-10303-21;',
    'HEADER;',
    'FILE_DESCRIPTION((\'BaSyx Studio test fixture: L bracket\'),\'2;1\');',
    'FILE_NAME(\'bracket.step\',\'2026-10-18T00:00:00\',(\'\'),(\'Eclipse BaSyx\'),\'\',\'BaSyx Studio\',\'\');',
    'FILE_SCHEMA((\'AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }\'));',
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// IFC4: a small room of two walls, a slab and a glass panel, with properties
// ---------------------------------------------------------------------------

function ifc () {
  const lines = []
  let next = 1
  let guids = 0
  const add = text => {
    const id = next++
    lines.push(`#${id}=${text};`)
    return `#${id}`
  }
  // 22 characters of the IFC base-64 alphabet, starting with 0–3.
  const guid = () => `'1BaSyxStudio${String(++guids).padStart(10, '0')}'`
  const real = value => (Number.isInteger(value) ? `${value}.` : String(value))

  const person = add('IFCPERSON($,$,\'Studio\',$,$,$,$,$)')
  const organization = add('IFCORGANIZATION($,\'Eclipse BaSyx\',$,$,$)')
  const application = add(`IFCAPPLICATION(${organization},'1.0','BaSyx Studio test fixtures','studio-fixtures')`)
  const owner = add(`IFCOWNERHISTORY(${add(`IFCPERSONANDORGANIZATION(${person},${organization},$)`)},${application},$,.ADDED.,$,$,$,0)`)
  const origin = add('IFCCARTESIANPOINT((0.,0.,0.))')
  const zAxis = add('IFCDIRECTION((0.,0.,1.))')
  const xAxis = add('IFCDIRECTION((1.,0.,0.))')
  const placement = add(`IFCAXIS2PLACEMENT3D(${origin},${zAxis},${xAxis})`)
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${placement},$)`)
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`)
  const units = add(`IFCUNITASSIGNMENT((${[
    add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'),
    add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'),
    add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ].join(',')}))`)
  const project = add(`IFCPROJECT(${guid()},${owner},'Studio test project',$,$,$,$,(${context}),${units})`)
  const sitePlacement = add(`IFCLOCALPLACEMENT($,${placement})`)
  const site = add(`IFCSITE(${guid()},${owner},'Site',$,$,${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`)
  const buildingPlacement = add(`IFCLOCALPLACEMENT(${sitePlacement},${placement})`)
  const building = add(`IFCBUILDING(${guid()},${owner},'Workshop',$,$,${buildingPlacement},$,$,.ELEMENT.,$,$,$)`)
  const storeyPlacement = add(`IFCLOCALPLACEMENT(${buildingPlacement},${placement})`)
  const storey = add(`IFCBUILDINGSTOREY(${guid()},${owner},'Ground floor',$,$,${storeyPlacement},$,$,.ELEMENT.,0.)`)
  add(`IFCRELAGGREGATES(${guid()},${owner},$,$,${project},(${site}))`)
  add(`IFCRELAGGREGATES(${guid()},${owner},$,$,${site},(${building}))`)
  add(`IFCRELAGGREGATES(${guid()},${owner},$,$,${building},(${storey}))`)

  const style = (name, [red, green, blue], transparency = 0) => {
    const colour = add(`IFCCOLOURRGB($,${red},${green},${blue})`)
    return add(`IFCSURFACESTYLE('${name}',.BOTH.,(${add(`IFCSURFACESTYLESHADING(${colour},${real(transparency)})`)}))`)
  }
  /** A box from `corner` with `size` (x, y, z), as an extruded rectangle. */
  const box = (corner, size, surfaceStyle) => {
    const center = add(`IFCCARTESIANPOINT((${real(corner[0] + size[0] / 2)},${real(corner[1] + size[1] / 2)}))`)
    const profileDef = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${add(`IFCAXIS2PLACEMENT2D(${center},$)`)},${real(size[0])},${real(size[1])})`)
    const position = add(`IFCAXIS2PLACEMENT3D(${add(`IFCCARTESIANPOINT((0.,0.,${real(corner[2])}))`)},${zAxis},${xAxis})`)
    const solid = add(`IFCEXTRUDEDAREASOLID(${profileDef},${position},${zAxis},${real(size[2])})`)
    add(`IFCSTYLEDITEM(${solid},(${surfaceStyle}),$)`)
    const shapeRepresentation = add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)
    return { shape: add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shapeRepresentation}))`), placement: add(`IFCLOCALPLACEMENT(${storeyPlacement},${placement})`) }
  }
  const plaster = style('Plaster', [0.86, 0.82, 0.74])
  const concrete = style('Concrete', [0.62, 0.62, 0.6])
  const glass = style('Glass', [0.55, 0.75, 0.9], 0.6)

  const wallA = box([0, 0, 0], [5, 0.2, 3], plaster)
  const wall1 = add(`IFCWALL(${guid()},${owner},'Wall 01','Exterior wall',$,${wallA.placement},${wallA.shape},'W-01',.STANDARD.)`)
  const wallB = box([0, 0.2, 0], [0.2, 3.8, 3], plaster)
  const wall2 = add(`IFCWALL(${guid()},${owner},'Wall 02','Exterior wall',$,${wallB.placement},${wallB.shape},'W-02',.STANDARD.)`)
  const slabBox = box([0, 0, -0.25], [5, 4, 0.25], concrete)
  const slab = add(`IFCSLAB(${guid()},${owner},'Floor slab',$,$,${slabBox.placement},${slabBox.shape},'S-01',.FLOOR.)`)
  const panelBox = box([4.9, 0.2, 0.5], [0.02, 3.8, 2], glass)
  const panel = add(`IFCPLATE(${guid()},${owner},'Glass panel',$,$,${panelBox.placement},${panelBox.shape},'P-01',.CURTAIN_PANEL.)`)
  add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid()},${owner},$,$,(${wall1},${wall2},${slab},${panel}),${storey})`)

  const wallCommon = add(`IFCPROPERTYSET(${guid()},${owner},'Pset_WallCommon',$,(${[
    add('IFCPROPERTYSINGLEVALUE(\'IsExternal\',$,IFCBOOLEAN(.T.),$)'),
    add('IFCPROPERTYSINGLEVALUE(\'FireRating\',$,IFCLABEL(\'F90\'),$)'),
    add('IFCPROPERTYSINGLEVALUE(\'ThermalTransmittance\',$,IFCTHERMALTRANSMITTANCEMEASURE(0.24),$)'),
  ].join(',')}))`)
  add(`IFCRELDEFINESBYPROPERTIES(${guid()},${owner},$,$,(${wall1},${wall2}),${wallCommon})`)
  const wallQuantities = add(`IFCELEMENTQUANTITY(${guid()},${owner},'Qto_WallBaseQuantities',$,$,(${[
    add('IFCQUANTITYLENGTH(\'Length\',$,$,5.,$)'),
    add('IFCQUANTITYVOLUME(\'NetVolume\',$,$,3.,$)'),
  ].join(',')}))`)
  add(`IFCRELDEFINESBYPROPERTIES(${guid()},${owner},$,$,(${wall1}),${wallQuantities})`)
  const slabCommon = add(`IFCPROPERTYSET(${guid()},${owner},'Pset_SlabCommon',$,(${add('IFCPROPERTYSINGLEVALUE(\'LoadBearing\',$,IFCBOOLEAN(.T.),$)')}))`)
  add(`IFCRELDEFINESBYPROPERTIES(${guid()},${owner},$,$,(${slab}),${slabCommon})`)

  return [
    'ISO-10303-21;',
    'HEADER;',
    'FILE_DESCRIPTION((\'ViewDefinition [ReferenceView]\'),\'2;1\');',
    'FILE_NAME(\'workshop.ifc\',\'2026-10-18T00:00:00\',(\'\'),(\'Eclipse BaSyx\'),\'\',\'BaSyx Studio\',\'\');',
    'FILE_SCHEMA((\'IFC4\'));',
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Preview images (PNG): the bracket's silhouette, and the room's floor plan
// ---------------------------------------------------------------------------

function png (width, height, colorAt) {
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x++) {
      row.set(colorAt(x, y), 1 + x * 3)
    }
    rows.push(row)
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const background = [238, 240, 243]
function bracketPreview () {
  return png(160, 120, (x, y) => {
    const inside = (x >= 30 && x <= 130 && y >= 88 && y <= 100) || (x >= 30 && x <= 44 && y >= 20 && y <= 100)
    return inside ? [217, 115, 26] : background
  })
}
function roomPreview () {
  return png(160, 120, (x, y) => {
    if ((y >= 20 && y <= 26 && x >= 20 && x <= 140) || (x >= 20 && x <= 26 && y >= 20 && y <= 100)) {
      return [190, 180, 160]
    }
    if (x >= 136 && x <= 140 && y >= 26 && y <= 100) {
      return [140, 190, 230]
    }
    return x >= 20 && x <= 140 && y >= 20 && y <= 100 ? [205, 205, 200] : background
  })
}

// ---------------------------------------------------------------------------
// The AAS: a shell with the files, and a Models3D submodel (IDTA 02026-1-0)
// ---------------------------------------------------------------------------

const files = {
  'bracket.stl': { content: binaryStl(), contentType: 'model/stl' },
  'bracket.obj': { content: obj(), contentType: 'model/obj' },
  'bracket.gltf': { content: gltfEmbedded(), contentType: 'model/gltf+json' },
  'bracket.glb': { content: glb(), contentType: 'model/gltf-binary' },
  'bracket-external.gltf': { content: gltfExternal(), contentType: 'model/gltf+json' },
  'bracket-external-texture.gltf': { content: gltfExternalTexture(), contentType: 'model/gltf+json' },
  'bracket.step': { content: step(), contentType: 'model/step' },
  'workshop.ifc': { content: ifc(), contentType: 'application/x-step' },
  'bracket.png': { content: bracketPreview(), contentType: 'image/png' },
  'workshop.png': { content: roomPreview(), contentType: 'image/png' },
  // A format the 3D view does not read (JT); only its bytes' presence matters.
  'gearbox.jt': { content: Buffer.from('Version 10.0 JT BaSyx Studio test fixture (not a real JT file)\n'), contentType: 'application/octet-stream' },
}

const base = 'https://admin-shell.io/idta/Models3D'
const semanticId = path => ({ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: `${base}/${path}/1/0` }] })
const filePath = name => `/aasx/files/models3d/${name}`

function prop (idShort, path, value, valueType = 'xs:string') {
  return { ...(idShort ? { idShort } : {}), modelType: 'Property', semanticId: semanticId(path), valueType, value }
}

function mlp (idShort, path, en, de) {
  return { idShort, modelType: 'MultiLanguageProperty', semanticId: semanticId(path), value: [{ language: 'en', text: en }, ...(de ? [{ language: 'de', text: de }] : [])] }
}

function smc (idShort, path, value) {
  return { ...(idShort ? { idShort } : {}), modelType: 'SubmodelElementCollection', semanticId: semanticId(path), value }
}

function sml (idShort, path, typeValueListElement, value, valueTypeListElement) {
  return {
    idShort,
    modelType: 'SubmodelElementList',
    semanticId: semanticId(path),
    semanticIdListElement: semanticId(path),
    typeValueListElement,
    ...(valueTypeListElement ? { valueTypeListElement } : {}),
    value,
  }
}

function file (idShort, path, name) {
  return { idShort, modelType: 'File', semanticId: semanticId(path), contentType: files[name].contentType, value: filePath(name) }
}

const textList = (idShort, path, values) => sml(idShort, path, 'Property', values.map(value => prop(undefined, path, value)), 'xs:string')

function organization (idShort, path, name, officialName) {
  return smc(idShort, path, [prop('OrganizationName', `${path}/OrganizationName`, name), prop('OrganizationOfficialName', `${path}/OrganizationOfficialName`, officialName)])
}

function api (path, version, documentation) {
  return sml('Api', `${path}/Api`, 'SubmodelElementCollection', [smc(undefined, `${path}/Api`, [
    prop('ApiVersion', `${path}/Api/ApiVersion`, version),
    prop('ApiDocumentationUrl', `${path}/Api/ApiDocumentationUrl`, documentation),
  ])])
}

function application (idShort, path, name, version, qualifier, vendor, withApi = false) {
  return [
    prop('ApplicationName', `${path}/ApplicationName`, name),
    prop('ApplicationVersion', `${path}/ApplicationVersion`, version),
    prop('ApplicationQualifier', `${path}/ApplicationQualifier`, qualifier),
    ...(withApi ? [api(path, '2.1', 'https://example.com/docs/cad-api')] : []),
    organization('VendorOrganization', `${path}/VendorOrganization`, vendor, `${vendor} GmbH`),
  ]
}

const fileVersionPath = 'Model3D/File/FileVersion'

function fileVersion ({ title, fileName, versionId, status, date, preview, digital, format, external, source, basedOn }) {
  const path = fileVersionPath
  return smc(undefined, path, [
    mlp('Title', `${path}/Title`, title.en, title.de),
    prop('FileName', `${path}/FileName`, fileName),
    prop('FileVersionId', `${path}/FileVersionId`, versionId),
    prop('StatusValue', `${path}/StatusValue`, status),
    prop('SetDate', `${path}/SetDate`, date, 'xs:date'),
    ...(basedOn ? [sml('BasedOn', `${path}/BasedOn`, 'ReferenceElement', [{ modelType: 'ReferenceElement', semanticId: semanticId(`${path}/BasedOn`), value: basedOn }])] : []),
    file('PreviewFile', `${path}/PreviewFile`, preview),
    ...(digital ? [file('DigitalFile', `${path}/DigitalFile`, digital)] : []),
    ...(external
      ? [sml('ExternalFile', `${path}/ExternalFile`, 'SubmodelElementCollection', [smc(undefined, `${path}/ExternalFile`, [
          prop('ExternalUrl', `${path}/ExternalFile/ExternalUrl`, external.url),
          prop('FileIdentifier', `${path}/ExternalFile/FileIdentifier`, external.identifier),
          organization('HostOrganization', `${path}/ExternalFile/HostOrganization`, external.host, `${external.host} AG`),
          api(`${path}/ExternalFile`, '1.0', 'https://example.com/docs/model-library-api'),
        ])])]
      : []),
    smc('FileFormat', `${path}/FileFormat`, [
      prop('FormatName', `${path}/FileFormat/FormatName`, format.name),
      prop('FormatVersion', `${path}/FileFormat/FormatVersion`, format.version),
      prop('FormatQualifier', `${path}/FileFormat/FormatQualifier`, format.qualifier),
    ]),
    ...(source ? [smc('SourceApplication', `${path}/SourceApplication`, application('SourceApplication', `${path}/SourceApplication`, ...source))] : []),
    organization('ProvidingOrganization', `${path}/ProvidingOrganization`, 'Studio Fixtures', 'Studio Fixtures Inc.'),
  ])
}

function model3d ({ ids, versions, consumers = [], classifications, capability, geometry }) {
  return smc(undefined, 'Model3D', [
    smc('File', 'Model3D/File', [
      sml('FileId', 'Model3D/File/FileId', 'SubmodelElementCollection', ids.map(({ domain, value, primary }) => smc(undefined, 'Model3D/File/FileId', [
        prop('FileDomainId', 'Model3D/File/FileId/FileDomainId', domain),
        prop('ValueId', 'Model3D/File/FileId/ValueId', value),
        ...(primary === undefined ? [] : [prop('IsPrimary', 'Model3D/File/FileId/IsPrimary', String(primary), 'xs:boolean')]),
      ]))),
      ...(versions.length > 0 ? [sml('FileVersion', fileVersionPath, 'SubmodelElementCollection', versions.map(version => fileVersion(version)))] : []),
      ...(consumers.length > 0
        ? [sml('ConsumingApplication', 'Model3D/File/ConsumingApplication', 'SubmodelElementCollection', consumers.map(consumer =>
            smc(undefined, 'Model3D/File/ConsumingApplication', application('ConsumingApplication', 'Model3D/File/ConsumingApplication', ...consumer))))]
        : []),
      sml('FileClassification', 'Model3D/File/FileClassification', 'SubmodelElementCollection', classifications.map(({ id, name, system }) => smc(undefined, 'Model3D/File/FileClassification', [
        prop('ClassId', 'Model3D/File/FileClassification/ClassId', id),
        mlp('ClassName', 'Model3D/File/FileClassification/ClassName', name),
        prop('ClassificationSystem', 'Model3D/File/FileClassification/ClassificationSystem', system),
      ]))),
    ]),
    ...(capability
      ? [smc('Capability', 'Model3D/Capability', [
          textList('PosModelPurpose', 'Model3D/Capability/PosModelPurpose', capability.positive),
          ...(capability.negative ? [textList('NegModelPurpose', 'Model3D/Capability/NegModelPurpose', capability.negative)] : []),
          ...(capability.embedded ? [textList('EmbeddedInfo', 'Model3D/Capability/EmbeddedInfo', capability.embedded)] : []),
          ...(capability.state ? [textList('State', 'Model3D/Capability/State', capability.state)] : []),
          ...(capability.objectType ? [prop('ObjectType', 'Model3D/Capability/ObjectType', capability.objectType)] : []),
          prop('Origin', 'Model3D/Capability/Origin', capability.origin),
          ...(capability.simplification
            ? [smc('Simplification', 'Model3D/Capability/Simplification', [
                prop('Description', 'Model3D/Capability/Simplification/Description', capability.simplification.description),
                textList('ReducedElements', 'Model3D/Capability/Simplification/ReducedElements', capability.simplification.reduced),
              ])]
            : []),
        ])]
      : []),
    ...(geometry
      ? [smc('Geometry', 'Model3D/Geometry', [
          prop('Representation', 'Model3D/Geometry/Representation', geometry.representation),
          prop('LengthUnit', 'Model3D/Geometry/LengthUnit', geometry.unit),
          sml('CartBoundingBox', 'Model3D/Geometry/CartBoundingBox', 'SubmodelElementCollection', geometry.boxes.map(({ kind, size, offset }) => smc(undefined, 'Model3D/Geometry/CartBoundingBox', [
            prop('BoundingBoxKind', 'Model3D/Geometry/CartBoundingBox/BoundingBoxKind', kind),
            ...(offset
              ? [smc('CartRefSystem', 'Model3D/Geometry/CartBoundingBox/CartRefSystem', [
                  smc('CartOffsetVector', 'Model3D/Geometry/CartBoundingBox/CartRefSystem/CartOffsetVector', ['X', 'Y', 'Z'].map((axis, i) =>
                    prop(axis, `Model3D/Geometry/CartBoundingBox/CartRefSystem/CartOffsetVector/${axis}`, String(offset[i])))),
                ])]
              : []),
            smc('CartBoundingVector', 'Model3D/Geometry/CartBoundingBox/CartBoundingVector', ['X', 'Y', 'Z'].map((axis, i) =>
              prop(axis, `Model3D/Geometry/CartBoundingBox/CartBoundingVector/${axis}`, String(size[i])))),
          ]))),
        ])]
      : []),
  ])
}

const submodelIds = {
  files: 'urn:studio:test:sm:files-3d',
  models: 'urn:studio:test:sm:models3d',
}

const filesSubmodel = {
  modelType: 'Submodel',
  id: submodelIds.files,
  idShort: 'Files3D',
  semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'urn:studio:test:semantic:files-3d' }] },
  submodelElements: [
    ['Stl', 'bracket.stl'],
    ['Obj', 'bracket.obj'],
    ['Gltf', 'bracket.gltf'],
    ['Glb', 'bracket.glb'],
    ['GltfExternalBuffer', 'bracket-external.gltf'],
    ['GltfExternalTexture', 'bracket-external-texture.gltf'],
    ['Step', 'bracket.step'],
    ['Ifc', 'workshop.ifc'],
    ['Preview', 'bracket.png'],
  ].map(([idShort, name]) => ({ idShort, modelType: 'File', contentType: files[name].contentType, value: filePath(name) })),
}

const bracketFormat = { name: 'glTF', version: '2.0', qualifier: 'binary (.glb)' }
const modelsSubmodel = {
  modelType: 'Submodel',
  id: submodelIds.models,
  idShort: 'Models3D',
  semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: `${base}/1/0` }] },
  submodelElements: [
    sml('Model3D', 'Model3D', 'SubmodelElementCollection', [
      model3d({
        ids: [{ domain: 'StudioFixtures', value: 'BRK-60-40', primary: true }, { domain: 'Catalog', value: '4711', primary: false }],
        versions: [
          {
            title: { en: 'L bracket (CAD)', de: 'Winkel (CAD)' },
            fileName: 'bracket.step',
            versionId: '1.0',
            status: 'InReview',
            date: '2026-09-01',
            preview: 'bracket.png',
            digital: 'bracket.step',
            format: { name: 'STEP', version: 'AP214', qualifier: 'ISO 10303-214' },
            source: ['FreeCAD', '1.1', 'Part workbench', 'FreeCAD project'],
          },
          {
            title: { en: 'L bracket', de: 'Winkel' },
            fileName: 'bracket.glb',
            versionId: '1.1',
            status: 'Released',
            date: '2026-10-01',
            preview: 'bracket.png',
            digital: 'bracket.glb',
            format: bracketFormat,
            source: ['Blender', '5.2', 'glTF exporter', 'Blender Foundation', true],
            basedOn: { type: 'ModelReference', keys: [{ type: 'Submodel', value: submodelIds.models }, { type: 'SubmodelElementList', value: 'Model3D' }] },
            external: { url: 'https://models.example.com/brk-60-40.glb', identifier: 'BRK-60-40-GLB', host: 'Example Models' },
          },
        ],
        consumers: [['Godot Engine', '4.7', 'Virtual Factory runtime', 'Godot Foundation']],
        classifications: [{ id: '3D-VIS', name: '3D visualisation model', system: 'StudioFixtures' }],
        capability: {
          positive: ['Rendering', 'VirtualCommisioning'],
          negative: ['3DPrintingSlicer'],
          embedded: ['ReferencePoints'],
          state: ['InSeries'],
          objectType: 'Component',
          origin: 'DesignEngineering',
          simplification: { description: 'Edges not filleted', reduced: ['Graphics'] },
        },
        geometry: { representation: 'SolidBody', unit: 'mm', boxes: [{ kind: 'MinEnvelope', size: [60, 30, 40], offset: [0, 0, 0] }] },
      }),
      model3d({
        ids: [{ domain: 'StudioFixtures', value: 'WORKSHOP' }],
        versions: [{
          title: { en: 'Workshop building' },
          fileName: 'workshop.ifc',
          versionId: '2.0.0',
          status: 'Released',
          date: '2026-08-15',
          preview: 'workshop.png',
          digital: 'workshop.ifc',
          format: { name: 'IFC', version: '4', qualifier: 'Reference View' },
        }],
        classifications: [{ id: 'BIM', name: 'Building information model', system: 'StudioFixtures' }],
        capability: { positive: ['Logistics'], objectType: 'Assembly', origin: 'DesignEngineering' },
        geometry: { representation: 'SolidBody', unit: 'm', boxes: [{ kind: 'MaxEnvelope', size: [5, 4, 3.25] }] },
      }),
      // Only at an external host: the view shows the preview and opens the link.
      model3d({
        ids: [{ domain: 'StudioFixtures', value: 'MOTOR-EXT' }],
        versions: [{
          title: { en: 'Motor (external)' },
          fileName: 'motor.step',
          versionId: '3',
          status: 'Released',
          date: '2026-07-01',
          preview: 'bracket.png',
          format: { name: 'STEP', version: 'AP242', qualifier: 'ISO 10303-242' },
          external: { url: 'https://models.example.com/motor.step', identifier: 'MOTOR-EXT', host: 'Example Models' },
        }],
        classifications: [{ id: 'CAD', name: 'CAD model', system: 'StudioFixtures' }],
      }),
      // A format the viewer does not read: preview and download only.
      model3d({
        ids: [{ domain: 'StudioFixtures', value: 'GEARBOX' }],
        versions: [{
          title: { en: 'Gearbox' },
          fileName: 'gearbox.jt',
          versionId: '1',
          status: 'Released',
          date: '2026-06-01',
          preview: 'bracket.png',
          digital: 'gearbox.jt',
          format: { name: 'JT', version: '10.0', qualifier: 'ISO 14306' },
        }],
        classifications: [{ id: 'CAD', name: 'CAD model', system: 'StudioFixtures' }],
      }),
    ]),
  ],
}

const environment = {
  assetAdministrationShells: [{
    modelType: 'AssetAdministrationShell',
    id: 'urn:studio:test:aas:models3d',
    idShort: 'Models3DDemo',
    displayName: [{ language: 'en', text: '3D models demo' }],
    // The open infrastructure holds instances only (test/integration/live-target-search.test.ts).
    assetInformation: { assetKind: 'Instance', globalAssetId: 'urn:studio:test:asset:models3d' },
    submodels: Object.values(submodelIds).map(id => ({ type: 'ModelReference', keys: [{ type: 'Submodel', value: id }] })),
  }],
  submodels: [filesSubmodel, modelsSubmodel],
}

// ---------------------------------------------------------------------------
// Verify and write
// ---------------------------------------------------------------------------

const parsed = jsonization.environmentFromJsonable(environment)
if (parsed.error !== null) {
  throw new Error(`deserialization failed at ${parsed.error.path}: ${parsed.error.message}`)
}
// IDTA 02026 names the vector components `X`, `Y` and `Z`, though the
// metamodel wants idShorts of two characters or more. Instances follow the
// template, so the fixture does too; any other finding fails.
function vectorComponent (error, environmentJson) {
  const element = error.path.toString().match(/\[\d+\]|\.\w+/g)?.reduce((node, step) => node?.[step.replaceAll(/[.[\]]/g, '')], environmentJson)
  return error.path.toString().endsWith('.idShort') && ['X', 'Y', 'Z'].includes(element)
}
const errors = [...verification.verify(parsed.mustValue())].filter(error => !vectorComponent(error, environment))
if (errors.length > 0) {
  throw new Error(errors.map(error => `${error.path}: ${error.message}`).join('\n'))
}
const canonical = jsonization.toJsonable(parsed.mustValue())

rmSync(modelsDir, { recursive: true, force: true })
mkdirSync(modelsDir, { recursive: true })
for (const [name, { content }] of Object.entries(files)) {
  writeFileSync(join(modelsDir, name), content)
}
writeFileSync(join(modelsDir, 'studio-3d-models.json'), `${JSON.stringify(canonical, null, 2)}\n`)
console.log(`wrote models3d/ (${Object.keys(files).length} files)`)

const aasxPath = join(fixturesDir, 'open', 'studio-3d-models.aasx')
const pkg = await NewPackaging().Create(aasxPath)
try {
  const spec = await pkg.PutPart(new URL('https://package.local/aasx/data.json'), 'application/json', new TextEncoder().encode(JSON.stringify(canonical)))
  await pkg.MakeSpec(spec)
  for (const [name, { content, contentType }] of Object.entries(files)) {
    const part = await pkg.PutPart(new URL(`https://package.local${filePath(name)}`), contentType, new Uint8Array(Buffer.from(content)))
    await pkg.RelateSupplementaryToSpec(part, spec)
  }
  const thumbnail = await pkg.PutPart(new URL('https://package.local/thumbnail.png'), 'image/png', new Uint8Array(bracketPreview()))
  await pkg.SetThumbnail(thumbnail)
  await pkg.Flush()
} finally {
  pkg.Close()
}
console.log('wrote open/studio-3d-models.aasx')
