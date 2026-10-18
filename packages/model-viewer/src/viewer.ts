import type { ModelFormat } from './formats'
import type { IfcElementInfo, MeshBatch, ProgressCallback } from './types'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js'
import dracoWasm from 'three/addons/libs/draco/gltf/draco_decoder.wasm?url'
import dracoJs from 'three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url'
import { refineModelFormat } from './formats'
import { emptyImage, externalResources, withoutExternalImages } from './gltf'
import { ParserClient } from './parsers/client'

// The 3D viewer of Studio and its apps (three.js, MIT License): orbit
// controls, a view cube, framing and picking of IFC elements. The scene,
// camera and view cube follow the BaSyx AAS Web UI
// (aas-web-ui/src/components/Plugins/CADPreview.vue at ed7ad908,
// https://github.com/eclipse-basyx/basyx-aas-web-ui), © the Eclipse BaSyx
// Authors, MIT License. It renders only when something changed.

/** Colors of the scene, as CSS colors (e.g. from the Vuetify theme). */
export interface ViewerTheme {
  background: string
  /** Surfaces without a color of their own (STL, OBJ, uncolored STEP). */
  model: string
  /** The picked IFC element. */
  highlight: string
}

export interface ModelViewerOptions {
  theme: ViewerTheme
  /** An IFC element was picked (its express ID), or the selection was cleared (`null`). */
  onSelect?: (expressId: number | null) => void
}

export interface LoadResult {
  /** The format the file turned out to have, e.g. IFC for a `.step` file. */
  format: ModelFormat
  triangles: number
  /** glTF textures in other files, shown without them. */
  missingImages: string[]
  /** Elements can be picked (IFC). */
  pickable: boolean
}

export type ModelViewerErrorCode = 'webgl' | 'parse' | 'missing-buffers' | 'cancelled'

export class ModelViewerError extends Error {
  constructor (readonly code: ModelViewerErrorCode, message: string, readonly details: string[] = []) {
    super(message)
    this.name = 'ModelViewerError'
  }
}

/** Formats drawn with outlines, like the Web UI's CAD preview; glTF and IFC have their own look. */
const outlined = new Set<ModelFormat>(['stl', 'obj', 'step'])
const isoDirection = new THREE.Vector3(1, 0.7, 1).normalize()
const clickTolerancePx = 4

const absolute = (url: string) => new URL(url, document.baseURI).href

function arrayBufferOf (bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer as ArrayBuffer
    : bytes.slice().buffer as ArrayBuffer
}

function srgbToLinear (value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function disposeObject (object: THREE.Object3D): void {
  object.traverse(child => {
    const mesh = child as THREE.Mesh
    if (!mesh.geometry) {
      return
    }
    mesh.geometry.dispose()
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) {
        continue
      }
      for (const value of Object.values(material)) {
        if ((value as THREE.Texture | null)?.isTexture) {
          (value as THREE.Texture).dispose()
        }
      }
      material.dispose()
    }
  })
}

function triangleCount (object: THREE.Object3D): number {
  let count = 0
  object.traverse(child => {
    const geometry = (child as THREE.Mesh).isMesh ? (child as THREE.Mesh).geometry : null
    if (geometry) {
      count += (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3
    }
  })
  return Math.round(count)
}

export class ModelViewer {
  readonly #container: HTMLElement
  readonly #options: ModelViewerOptions
  readonly #renderer: THREE.WebGLRenderer
  readonly #scene = new THREE.Scene()
  readonly #camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
  readonly #controls: OrbitControls
  readonly #viewHelper: ViewHelper
  readonly #outline: OutlineEffect
  readonly #environment: THREE.WebGLRenderTarget
  readonly #resizeObserver: ResizeObserver
  readonly #defaultMaterials = new Set<THREE.MeshStandardMaterial>()
  readonly #highlightMaterial: THREE.MeshBasicMaterial
  readonly #home = { position: new THREE.Vector3(3, 2, 3), target: new THREE.Vector3() }
  #model: THREE.Object3D | null = null
  #highlight: THREE.Mesh | null = null
  #outlined = false
  #parser: ParserClient | null = null
  #loads = 0
  #frame = 0
  #lastFrame = 0
  #pointerDown: { x: number, y: number } | null = null
  #disposed = false

  constructor (container: HTMLElement, options: ModelViewerOptions) {
    this.#container = container
    this.#options = options
    try {
      this.#renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      throw new ModelViewerError('webgl', 'WebGL is not available.')
    }
    const renderer = this.#renderer
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.display = 'block'
    container.append(renderer.domElement)

    const pmrem = new THREE.PMREMGenerator(renderer)
    this.#environment = pmrem.fromScene(new RoomEnvironment(), 0.04)
    pmrem.dispose()
    this.#scene.environment = this.#environment.texture
    this.#scene.environmentIntensity = 0.8

    // A light from the camera, so the side in view is always lit.
    const headlight = new THREE.DirectionalLight(0xFF_FF_FF, 1.2)
    headlight.position.set(0.5, 1, 1)
    headlight.target.position.set(0, 0, -1)
    this.#camera.add(headlight, headlight.target)
    this.#scene.add(this.#camera)

    this.#controls = new OrbitControls(this.#camera, renderer.domElement)
    this.#controls.enableDamping = true
    this.#controls.dampingFactor = 0.1
    this.#controls.addEventListener('change', () => this.requestRender())

    this.#viewHelper = new ViewHelper(this.#camera, renderer.domElement)
    this.#viewHelper.center = this.#controls.target
    this.#viewHelper.setLabels('X', 'Y', 'Z')

    this.#outline = new OutlineEffect(renderer, { defaultThickness: 0.003, defaultColor: [0, 0, 0] })
    this.#highlightMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })

    renderer.domElement.addEventListener('pointerdown', this.#onPointerDown)
    renderer.domElement.addEventListener('pointerup', this.#onPointerUp)
    this.#resizeObserver = new ResizeObserver(() => this.#resize())
    this.#resizeObserver.observe(container)
    this.setTheme(options.theme)
    this.#resize()
    this.resetView()
  }

  /**
   * Shows a model instead of the current one. `format` is the detected one;
   * the file's first bytes may refine it. The bytes are handed to a worker
   * for IFC and STEP, so the array is unusable afterwards.
   */
  async load (bytes: Uint8Array, format: ModelFormat, onProgress?: ProgressCallback): Promise<LoadResult> {
    const load = ++this.#loads
    this.#clearModel()
    const actual = refineModelFormat(format, bytes)
    let object: THREE.Object3D
    let missingImages: string[] = []
    try {
      switch (actual) {
        case 'stl': {
          object = await this.#stl(bytes)
          break
        }
        case 'obj': {
          object = await this.#obj(bytes)
          break
        }
        case 'gltf':
        case 'glb': {
          ({ object, missingImages } = await this.#gltf(bytes))
          break
        }
        case 'ifc':
        case 'step': {
          this.#parser ??= new ParserClient()
          object = this.#fromBatches(await this.#parser.parse(actual, bytes, onProgress))
          // CAD systems model with z up; three.js shows y up. web-ifc turns IFC itself.
          if (actual === 'step') {
            object.rotation.x = -Math.PI / 2
          }
          break
        }
      }
    } catch (error) {
      if (error instanceof ModelViewerError) {
        throw error
      }
      throw new ModelViewerError('parse', error instanceof Error ? error.message : String(error))
    }
    if (load !== this.#loads || this.#disposed) {
      disposeObject(object)
      throw new ModelViewerError('cancelled', 'Another model was loaded.')
    }
    this.#model = object
    this.#outlined = outlined.has(actual)
    this.#scene.add(object)
    this.#frame3d(object)
    this.requestRender()
    return { format: actual, triangles: triangleCount(object), missingImages, pickable: actual === 'ifc' }
  }

  /** The attributes and properties of an IFC element, e.g. after `onSelect`. */
  async elementInfo (expressId: number): Promise<IfcElementInfo> {
    if (!this.#parser) {
      throw new ModelViewerError('parse', 'No IFC model is loaded.')
    }
    return this.#parser.element(expressId)
  }

  /** Back to the view the model was framed in. */
  resetView (): void {
    this.#camera.position.copy(this.#home.position)
    this.#controls.target.copy(this.#home.target)
    this.#controls.update()
    this.requestRender()
  }

  setTheme (theme: ViewerTheme): void {
    this.#options.theme = theme
    this.#scene.background = new THREE.Color(theme.background)
    for (const material of this.#defaultMaterials) {
      material.color.set(theme.model)
    }
    this.#highlightMaterial.color.set(theme.highlight)
    this.requestRender()
  }

  /** Clears the picked element. */
  clearSelection (): void {
    this.#select(null)
  }

  requestRender (): void {
    if (!this.#frame && !this.#disposed) {
      this.#frame = requestAnimationFrame(time => this.#render(time))
    }
  }

  dispose (): void {
    this.#disposed = true
    cancelAnimationFrame(this.#frame)
    this.#resizeObserver.disconnect()
    this.#renderer.domElement.removeEventListener('pointerdown', this.#onPointerDown)
    this.#renderer.domElement.removeEventListener('pointerup', this.#onPointerUp)
    this.#clearModel()
    this.#parser?.dispose()
    this.#controls.dispose()
    this.#viewHelper.dispose()
    this.#highlightMaterial.dispose()
    this.#environment.dispose()
    this.#renderer.dispose()
    // Browsers keep only a few WebGL contexts; give this one back now.
    this.#renderer.forceContextLoss()
    this.#renderer.domElement.remove()
  }

  #render (time: number): void {
    this.#frame = 0
    const delta = this.#lastFrame ? Math.min((time - this.#lastFrame) / 1000, 0.1) : 0
    this.#lastFrame = time
    // With damping, the camera keeps moving for a few frames after input.
    let again = this.#controls.update()
    if (this.#viewHelper.animating) {
      this.#viewHelper.update(delta)
      again = true
    }
    const renderer = this.#renderer
    if (this.#outlined) {
      this.#outline.render(this.#scene, this.#camera)
    } else {
      renderer.render(this.#scene, this.#camera)
    }
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    this.#viewHelper.render(renderer)
    renderer.autoClear = autoClear
    if (again) {
      this.requestRender()
    } else {
      this.#lastFrame = 0
    }
  }

  #resize (): void {
    const width = Math.max(1, this.#container.clientWidth)
    const height = Math.max(1, this.#container.clientHeight)
    this.#renderer.setSize(width, height)
    this.#camera.aspect = width / height
    this.#camera.updateProjectionMatrix()
    this.requestRender()
  }

  /** Frames an object of any size and position from an isometric direction. */
  #frame3d (object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) {
      return
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 1e-6)
    const verticalFov = THREE.MathUtils.degToRad(this.#camera.fov)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.#camera.aspect)
    const distance = (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.1
    this.#home.target.copy(sphere.center)
    this.#home.position.copy(sphere.center).addScaledVector(isoDirection, distance)
    this.#camera.near = distance / 100
    this.#camera.far = distance * 100
    this.#camera.updateProjectionMatrix()
    this.#controls.minDistance = radius * 0.01
    this.#controls.maxDistance = distance * 10
    this.resetView()
  }

  #defaultMaterial (vertexColors = false): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: vertexColors ? 0xFF_FF_FF : this.#options.theme.model,
      vertexColors,
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide,
    })
    if (!vertexColors) {
      this.#defaultMaterials.add(material)
    }
    return material
  }

  async #stl (bytes: Uint8Array): Promise<THREE.Object3D> {
    const { STLLoader } = await import('three/addons/loaders/STLLoader.js')
    const geometry = new STLLoader().parse(arrayBufferOf(bytes))
    return new THREE.Mesh(geometry, this.#defaultMaterial(geometry.hasAttribute('color')))
  }

  async #obj (bytes: Uint8Array): Promise<THREE.Object3D> {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js')
    const object = new OBJLoader().parse(new TextDecoder().decode(bytes))
    // Materials would come from an MTL file next to it; OBJ gets the uniform look.
    object.traverse(child => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          material.dispose()
        }
        mesh.material = this.#defaultMaterial(mesh.geometry.hasAttribute('color'))
      }
    })
    return object
  }

  async #gltf (bytes: Uint8Array): Promise<{ object: THREE.Object3D, missingImages: string[] }> {
    const { buffers, images } = externalResources(bytes)
    if (buffers.length > 0) {
      throw new ModelViewerError('missing-buffers', 'The glTF file references geometry in other files.', buffers)
    }
    const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
    ])
    // Embedded data only: materials lose their textures in other files, and
    // the loader never requests a URL next to the file.
    const manager = new THREE.LoadingManager()
    manager.setURLModifier(url => (url.startsWith('data:') || url.startsWith('blob:') ? url : emptyImage))
    const draco = new DRACOLoader().setDecoderPath({ js: absolute(dracoJs), wasm: absolute(dracoWasm) })
    const loader = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder)
    try {
      const gltf = await loader.parseAsync(arrayBufferOf(images.length > 0 ? withoutExternalImages(bytes) : bytes), '')
      return { object: gltf.scene, missingImages: images }
    } finally {
      draco.dispose()
    }
  }

  #fromBatches (batches: MeshBatch[]): THREE.Object3D {
    const group = new THREE.Group()
    for (const batch of batches) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(batch.positions, 3))
      geometry.setIndex(new THREE.BufferAttribute(batch.indices, 1))
      if (batch.normals) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(batch.normals, 3))
      } else {
        geometry.computeVertexNormals()
      }
      let material: THREE.MeshStandardMaterial
      if (batch.vertexColors) {
        geometry.setAttribute('color', new THREE.BufferAttribute(batch.vertexColors.map(value => srgbToLinear(value)), 3))
        material = this.#defaultMaterial(true)
      } else if (batch.color) {
        const [red, green, blue, alpha] = batch.color
        material = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace),
          metalness: 0,
          roughness: 0.8,
          side: THREE.DoubleSide,
          transparent: alpha < 1,
          opacity: alpha,
          depthWrite: alpha >= 1,
        })
      } else {
        material = this.#defaultMaterial()
      }
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = batch.name ?? ''
      // The express IDs stay on the CPU, for picking.
      mesh.userData.ids = batch.ids
      group.add(mesh)
    }
    return group
  }

  #clearModel (): void {
    this.#select(null)
    if (this.#model) {
      this.#scene.remove(this.#model)
      disposeObject(this.#model)
      this.#model = null
    }
    this.#defaultMaterials.clear()
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    this.#pointerDown = { x: event.clientX, y: event.clientY }
  }

  /** A click (not a drag) on the view cube turns the camera; on the model it picks an IFC element. */
  readonly #onPointerUp = (event: PointerEvent): void => {
    const down = this.#pointerDown
    this.#pointerDown = null
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > clickTolerancePx) {
      return
    }
    if (this.#viewHelper.handleClick(event)) {
      this.requestRender()
      return
    }
    if (!this.#model) {
      return
    }
    const rect = this.#renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, this.#camera)
    const hit = raycaster.intersectObject(this.#model, true).find(item => item.face && (item.object.userData.ids as Uint32Array | null))
    const ids = hit?.object.userData.ids as Uint32Array | undefined
    this.#select(hit?.face && ids ? ids[hit.face.a]! : null)
  }

  #select (expressId: number | null): void {
    if (this.#highlight) {
      this.#highlight.removeFromParent()
      this.#highlight.geometry.dispose()
      this.#highlight = null
    }
    // In the model, so it follows the model's placement.
    if (expressId !== null && this.#model) {
      this.#highlight = this.#highlightOf(expressId)
      this.#model.add(this.#highlight)
    }
    this.requestRender()
    this.#options.onSelect?.(expressId)
  }

  /** The triangles of one element, drawn over the model. */
  #highlightOf (expressId: number): THREE.Mesh {
    const positions: number[] = []
    this.#model!.traverse(child => {
      const mesh = child as THREE.Mesh
      const ids = mesh.userData?.ids as Uint32Array | null | undefined
      if (!mesh.isMesh || !ids || !mesh.geometry.index) {
        return
      }
      const index = mesh.geometry.index.array
      const position = mesh.geometry.getAttribute('position')
      for (let i = 0; i < index.length; i += 3) {
        if (ids[index[i]!] !== expressId) {
          continue
        }
        for (let corner = 0; corner < 3; corner++) {
          const vertex = index[i + corner]!
          positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex))
        }
      }
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return new THREE.Mesh(geometry, this.#highlightMaterial)
  }
}
