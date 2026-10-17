import type { Twin } from './types'
import type { HierarchyCircularNode } from 'd3-hierarchy'
import { hierarchy, pack } from 'd3-hierarchy'

// The Fleet Atlas canvas: one continuous, zoomable world. Groups and
// assemblies are circles that contain their parts (circle packing), so
// zooming into a line reveals its machines and zooming into a machine
// reveals its components. Every change of layout, lens or data animates;
// the camera flies along smooth zoom-and-pan paths (van Wijk & Nuij).

export interface AtlasDatum {
  key: string
  label: string
  twin?: Twin
  value?: number
  children?: AtlasDatum[]
}

/** How the current lens paints a node. */
export interface Paint {
  color: string
  /** Fraction 0…1 drawn as an arc around the node. */
  ring?: number
  pulse?: 'alarm' | 'warning'
  hollow?: boolean
}

/** Text of a node: the hover tooltip and the card shown when zoomed in close. */
export interface Description {
  title: string
  subtitle: string
  icon?: string
  stats: Array<{ label: string, value: string, color?: string }>
}

export interface AtlasTheme {
  dark: boolean
  background: string
  surface: string
  onSurface: string
  primary: string
}

export interface AtlasCallbacks {
  paint: (key: string, twin: Twin | undefined) => Paint
  describe: (key: string, twin: Twin | undefined) => Description
  glyph: (icon: string) => string
  onClick: (key: string | null, twin: Twin | undefined) => void
  onLasso: (keys: string[]) => void
  onUserCamera: () => void
}

interface Node {
  key: string
  label: string
  twin?: Twin
  depth: number
  container: boolean
  parent: string | null
  x: number
  y: number
  r: number
  tx: number
  ty: number
  tr: number
  alpha: number
  removed: boolean
  start: number
  rgb: [number, number, number]
}

type Rgb = [number, number, number]

const rootKey = '__root'
const worldSize = 1000
const colorCache = new Map<string, Rgb>()

function rgbOf (color: string): Rgb {
  let rgb = colorCache.get(color)
  if (!rgb) {
    const hex = color.trim().replace('#', '')
    if (/^[\da-f]{3}$/i.test(hex)) {
      rgb = [0, 1, 2].map(index => Number.parseInt(hex[index]!.repeat(2), 16)) as Rgb
    } else if (/^[\da-f]{6}/i.test(hex)) {
      rgb = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as Rgb
    } else {
      const match = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [128, 128, 128]
      rgb = [match[0] ?? 128, match[1] ?? 128, match[2] ?? 128]
    }
    colorCache.set(color, rgb)
  }
  return rgb
}

const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${Math.trunc(r)},${Math.trunc(g)},${Math.trunc(b)},${Math.max(0, Math.min(1, alpha))})`
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const luminance = ([r, g, b]: Rgb) => (0.299 * r + 0.587 * g + 0.114 * b) / 255
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Smooth zoom-and-pan between two views [x, y, width] (van Wijk & Nuij, as d3.interpolateZoom). */
function zoomPath ([ux0, uy0, w0]: number[], [ux1, uy1, w1]: number[]) {
  const rho = 1.35
  const rho2 = rho * rho
  const rho4 = rho2 * rho2
  const dx = ux1! - ux0!
  const dy = uy1! - uy0!
  const d2 = dx * dx + dy * dy
  if (d2 < 1e-9) {
    const S = Math.log(w1! / w0!) / rho
    return { S: Math.abs(S), at: (t: number) => [ux0! + t * dx, uy0! + t * dy, w0! * Math.exp(rho * t * S)] }
  }
  const d1 = Math.sqrt(d2)
  const b0 = (w1! * w1! - w0! * w0! + rho4 * d2) / (2 * w0! * rho2 * d1)
  const b1 = (w1! * w1! - w0! * w0! - rho4 * d2) / (2 * w1! * rho2 * d1)
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0)
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1)
  const S = (r1 - r0) / rho
  return {
    S,
    at: (t: number) => {
      const s = t * S
      const coshr0 = Math.cosh(r0)
      const u = w0! / (rho2 * d1) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0))
      return [ux0! + u * dx, uy0! + u * dy, w0! * coshr0 / Math.cosh(rho * s + r0)]
    },
  }
}

export class Atlas {
  lassoMode = false
  readonly #canvas: HTMLCanvasElement
  readonly #context: CanvasRenderingContext2D
  readonly #callbacks: AtlasCallbacks
  #theme: AtlasTheme = { dark: true, background: '#0b0f17', surface: '#121826', onSurface: '#e5e7eb', primary: '#3b82f6' }
  #font = 'system-ui, sans-serif'
  #nodes = new Map<string, Node>()
  #order: Node[] = []
  #width = 0
  #height = 0
  #ratio = 1
  #frame = 0
  #last = 0
  #bornAt = 0
  #stars: Array<[number, number, number, number]> = []

  // Camera: world point at the view's center and scale (pixels per world unit).
  #cx = worldSize / 2
  #cy = worldSize / 2
  #k = 0.5
  #flight: { at: (t: number) => number[], start: number, duration: number } | null = null
  #follow: string | null = null
  #velocity: [number, number] = [0, 0]

  #matches: Set<string> | null = null
  #selection = new Set<string>()
  #focus: string | null = null
  #hover: Node | null = null
  #pointer: [number, number] | null = null
  #insetRight = 0
  #insetTop = 0
  #lasso: Array<[number, number]> | null = null
  #drag: { x: number, y: number, moved: boolean, last: [number, number], time: number } | null = null
  #pointers = new Map<number, [number, number]>()
  #pinch: number | null = null
  #observer: ResizeObserver

  constructor (canvas: HTMLCanvasElement, callbacks: AtlasCallbacks) {
    this.#canvas = canvas
    this.#context = canvas.getContext('2d')!
    this.#callbacks = callbacks
    this.#font = getComputedStyle(document.body).fontFamily || this.#font
    for (let index = 0; index < 260; index++) {
      this.#stars.push([Math.random(), Math.random(), Math.random() * 1.3 + 0.2, Math.random() * Math.PI * 2])
    }
    this.#observer = new ResizeObserver(() => this.#resize())
    this.#observer.observe(canvas)
    this.#resize()
    canvas.addEventListener('pointerdown', this.#onPointerDown)
    canvas.addEventListener('pointermove', this.#onPointerMove)
    canvas.addEventListener('pointerup', this.#onPointerUp)
    canvas.addEventListener('pointercancel', this.#onPointerUp)
    canvas.addEventListener('pointerleave', this.#onPointerLeave)
    canvas.addEventListener('wheel', this.#onWheel, { passive: false })
    canvas.addEventListener('dblclick', this.#onDoubleClick)
    this.#frame = requestAnimationFrame(this.#tick)
  }

  destroy () {
    cancelAnimationFrame(this.#frame)
    this.#observer.disconnect()
  }

  setTheme (theme: AtlasTheme) {
    this.#theme = theme
  }

  setMatches (keys: Set<string> | null) {
    this.#matches = keys
  }

  setSelection (keys: Set<string>) {
    this.#selection = keys
  }

  setFocus (key: string | null) {
    this.#focus = key
  }

  /** Space covered by overlays at the top and on the right; the view centers in the rest. */
  setInsets (top: number, right = 0) {
    this.#insetTop = top
    this.#insetRight = right
  }

  /** Lays the tree out by circle packing; nodes move, appear and disappear animated. */
  setLayout (root: AtlasDatum) {
    const now = performance.now()
    const tree = hierarchy<AtlasDatum>(root, datum => datum.children)
      .sum(datum => (datum.children?.length ? 0 : Math.max(datum.value ?? 1, 1e-3)))
      // d3's HierarchyNode#sort orders children in place; it is not Array#sort.
      // eslint-disable-next-line unicorn/no-array-sort
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.data.key.localeCompare(b.data.key))
    const packed = pack<AtlasDatum>().size([worldSize, worldSize]).padding(node => (node.depth === 0 ? 18 : (node.height > 1 ? 7 : 3)))(tree)

    const seen = new Set<string>()
    const firstLayout = this.#nodes.size === 0
    if (firstLayout) {
      this.#bornAt = now
    }
    let spawned = 0
    packed.each((item: HierarchyCircularNode<AtlasDatum>) => {
      const key = item.data.key
      seen.add(key)
      let node = this.#nodes.get(key)
      if (!node) {
        // New nodes are born at their parent's current position and fly out.
        const parent = item.parent ? this.#nodes.get(item.parent.data.key) : undefined
        node = {
          key,
          label: item.data.label,
          depth: item.depth,
          container: Boolean(item.children?.length),
          parent: item.parent?.data.key ?? null,
          x: parent?.x ?? worldSize / 2,
          y: parent?.y ?? worldSize / 2,
          r: 0,
          tx: item.x,
          ty: item.y,
          tr: item.r,
          alpha: 0,
          removed: false,
          start: now + Math.min(spawned++ * 9, 900),
          rgb: rgbOf(this.#theme.onSurface),
        }
        this.#nodes.set(key, node)
      }
      node.label = item.data.label
      node.twin = item.data.twin
      node.depth = item.depth
      node.container = Boolean(item.children?.length)
      node.parent = item.parent?.data.key ?? null
      node.tx = item.x
      node.ty = item.y
      node.tr = item.r
      node.removed = false
    })
    for (const node of this.#nodes.values()) {
      if (!seen.has(node.key)) {
        node.removed = true
      }
    }
    this.#order = [...this.#nodes.values()].toSorted((a, b) => a.depth - b.depth)
    if (firstLayout) {
      this.#cx = worldSize / 2
      this.#cy = worldSize / 2
      this.#k = this.#fitScale(worldSize / 2) * 0.35
      this.flyTo(rootKey, 2200)
    }
  }

  /** Flies the camera to a node (or the whole fleet) and keeps following it while the layout moves. */
  flyTo (key: string, duration?: number) {
    const node = this.#nodes.get(key)
    if (!node) {
      return
    }
    this.#flyToView(node.tx, node.ty, node.tr, duration)
    this.#follow = key
  }

  /** Flies to the bounding circle of several nodes. */
  flyToKeys (keys: string[]) {
    const nodes = keys.map(key => this.#nodes.get(key)).filter((node): node is Node => node !== undefined)
    if (nodes.length === 0) {
      return
    }
    if (nodes.length === 1) {
      this.flyTo(nodes[0]!.key)
      return
    }
    const minX = Math.min(...nodes.map(node => node.tx - node.tr))
    const maxX = Math.max(...nodes.map(node => node.tx + node.tr))
    const minY = Math.min(...nodes.map(node => node.ty - node.tr))
    const maxY = Math.max(...nodes.map(node => node.ty + node.tr))
    this.#follow = null
    this.#flyToView((minX + maxX) / 2, (minY + maxY) / 2, Math.max(maxX - minX, maxY - minY) / 2)
  }

  zoomBy (factor: number) {
    this.#follow = null
    this.#flight = null
    this.#k = clamp(this.#k * factor, this.#minScale(), this.#maxScale())
  }

  /** Twin keys inside a container (for tours and focus). */
  childrenOf (key: string): string[] {
    return this.#order.filter(node => node.parent === key && !node.removed).map(node => node.key)
  }

  /** The smaller side of the visible area, in pixels. */
  #viewSize () {
    return Math.max(1, Math.min(this.#width - this.#insetRight, this.#height - this.#insetTop))
  }

  #fitScale (radius: number) {
    return this.#viewSize() / (radius * 2 * 1.12)
  }

  #flyToView (x: number, y: number, radius: number, duration?: number) {
    const width = this.#viewSize()
    const from = [this.#cx, this.#cy, width / this.#k]
    const to = [x, y, width / this.#fitScale(radius)]
    const path = zoomPath(from, to)
    this.#flight = {
      at: path.at,
      start: performance.now(),
      duration: duration ?? clamp(path.S * 520, 500, 2600),
    }
    this.#velocity = [0, 0]
  }

  #minScale () {
    return this.#fitScale(worldSize / 2) * 0.4
  }

  #maxScale () {
    return this.#fitScale(worldSize / 2) * 900
  }

  #resize () {
    const rect = this.#canvas.getBoundingClientRect()
    this.#ratio = window.devicePixelRatio || 1
    this.#width = Math.max(1, rect.width)
    this.#height = Math.max(1, rect.height)
    this.#canvas.width = Math.round(this.#width * this.#ratio)
    this.#canvas.height = Math.round(this.#height * this.#ratio)
  }

  // -------------------------------------------------------------------------
  // Coordinates
  // -------------------------------------------------------------------------

  #screenX (x: number) {
    return (x - this.#cx) * this.#k + (this.#width - this.#insetRight) / 2
  }

  #screenY (y: number) {
    return (y - this.#cy) * this.#k + this.#insetTop + (this.#height - this.#insetTop) / 2
  }

  #worldAt (sx: number, sy: number): [number, number] {
    return [(sx - (this.#width - this.#insetRight) / 2) / this.#k + this.#cx, (sy - this.#insetTop - (this.#height - this.#insetTop) / 2) / this.#k + this.#cy]
  }

  #hit (sx: number, sy: number): Node | null {
    const [x, y] = this.#worldAt(sx, sy)
    for (let index = this.#order.length - 1; index >= 0; index--) {
      const node = this.#order[index]!
      if (node.removed || node.key === rootKey || node.alpha < 0.3 || node.r * this.#k < 2) {
        continue
      }
      if ((x - node.x) ** 2 + (y - node.y) ** 2 <= node.r ** 2) {
        return node
      }
    }
    return null
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  #local (event: PointerEvent | WheelEvent | MouseEvent): [number, number] {
    const rect = this.#canvas.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top]
  }

  #userCamera () {
    this.#flight = null
    this.#follow = null
    this.#callbacks.onUserCamera()
  }

  #onPointerDown = (event: PointerEvent) => {
    const point = this.#local(event)
    this.#pointers.set(event.pointerId, point)
    this.#canvas.setPointerCapture(event.pointerId)
    if (this.#pointers.size === 2) {
      const [a, b] = [...this.#pointers.values()]
      this.#pinch = Math.hypot(a![0] - b![0], a![1] - b![1])
      this.#drag = null
      return
    }
    if (this.lassoMode || event.shiftKey) {
      this.#lasso = [point]
      return
    }
    this.#drag = { x: point[0], y: point[1], moved: false, last: point, time: performance.now() }
    this.#velocity = [0, 0]
  }

  #onPointerMove = (event: PointerEvent) => {
    const point = this.#local(event)
    this.#pointer = point
    if (this.#pointers.has(event.pointerId)) {
      this.#pointers.set(event.pointerId, point)
    }
    if (this.#pinch !== null && this.#pointers.size === 2) {
      const [a, b] = [...this.#pointers.values()]
      const distance = Math.hypot(a![0] - b![0], a![1] - b![1])
      this.#zoomAround((a![0] + b![0]) / 2, (a![1] + b![1]) / 2, distance / this.#pinch)
      this.#pinch = distance
      return
    }
    if (this.#lasso) {
      this.#lasso.push(point)
      return
    }
    if (this.#drag) {
      const dx = point[0] - this.#drag.last[0]
      const dy = point[1] - this.#drag.last[1]
      if (!this.#drag.moved && Math.hypot(point[0] - this.#drag.x, point[1] - this.#drag.y) > 4) {
        this.#drag.moved = true
        this.#userCamera()
      }
      if (this.#drag.moved) {
        this.#cx -= dx / this.#k
        this.#cy -= dy / this.#k
        const now = performance.now()
        const elapsed = Math.max(1, now - this.#drag.time)
        this.#velocity = [dx / elapsed, dy / elapsed]
        this.#drag.time = now
      }
      this.#drag.last = point
      return
    }
    this.#hover = this.#hit(point[0], point[1])
    const cursor = this.lassoMode ? 'cursor-default' : (this.#hover ? 'cursor-pointer' : 'cursor-grab')
    this.#canvas.classList.remove('cursor-default', 'cursor-pointer', 'cursor-grab')
    this.#canvas.classList.add(cursor)
  }

  #onPointerUp = (event: PointerEvent) => {
    this.#pointers.delete(event.pointerId)
    if (this.#pointers.size < 2) {
      this.#pinch = null
    }
    if (this.#lasso) {
      const polygon = this.#lasso
      this.#lasso = null
      if (polygon.length > 4) {
        const keys = this.#order
          .filter(node => node.twin && !node.removed && this.#inside(polygon, this.#screenX(node.x), this.#screenY(node.y)))
          .map(node => node.key)
        this.#callbacks.onLasso(keys)
      }
      return
    }
    const drag = this.#drag
    this.#drag = null
    if (drag && !drag.moved) {
      const node = this.#hit(drag.x, drag.y)
      this.#callbacks.onClick(node?.key ?? null, node?.twin)
    } else if (drag && performance.now() - drag.time > 80) {
      this.#velocity = [0, 0]
    }
  }

  #onPointerLeave = () => {
    this.#hover = null
    this.#pointer = null
  }

  #onWheel = (event: WheelEvent) => {
    event.preventDefault()
    this.#userCamera()
    const [sx, sy] = this.#local(event)
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    this.#zoomAround(sx, sy, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0012)))
  }

  #onDoubleClick = (event: MouseEvent) => {
    const [sx, sy] = this.#local(event)
    const node = this.#hit(sx, sy)
    if (node) {
      this.flyTo(node.key)
    } else {
      this.#userCamera()
      this.#zoomAround(sx, sy, 2)
    }
  }

  #zoomAround (sx: number, sy: number, factor: number) {
    const [wx, wy] = this.#worldAt(sx, sy)
    this.#k = clamp(this.#k * factor, this.#minScale(), this.#maxScale())
    const [nx, ny] = this.#worldAt(sx, sy)
    this.#cx += wx - nx
    this.#cy += wy - ny
  }

  #inside (polygon: Array<[number, number]>, x: number, y: number) {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i]!
      const [xj, yj] = polygon[j]!
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside
      }
    }
    return inside
  }

  // -------------------------------------------------------------------------
  // Animation and drawing
  // -------------------------------------------------------------------------

  #tick = (now: number) => {
    this.#frame = requestAnimationFrame(this.#tick)
    const dt = Math.min(0.05, (now - (this.#last || now)) / 1000)
    this.#last = now
    this.#updateCamera(now, dt)
    this.#updateNodes(now, dt)
    this.#draw(now)
  }

  #updateCamera (now: number, dt: number) {
    if (this.#flight) {
      const t = clamp((now - this.#flight.start) / this.#flight.duration, 0, 1)
      const [x, y, w] = this.#flight.at(easeInOut(t))
      this.#cx = x!
      this.#cy = y!
      this.#k = this.#viewSize() / w!
      if (t >= 1) {
        this.#flight = null
      }
      return
    }
    if (this.#follow) {
      const node = this.#nodes.get(this.#follow)
      if (node && !node.removed) {
        const ease = 1 - Math.exp(-dt * 4)
        this.#cx += (node.tx - this.#cx) * ease
        this.#cy += (node.ty - this.#cy) * ease
        this.#k += (this.#fitScale(node.tr) - this.#k) * ease
      }
      return
    }
    if (!this.#drag && (Math.abs(this.#velocity[0]) > 0.01 || Math.abs(this.#velocity[1]) > 0.01)) {
      this.#cx -= this.#velocity[0] * dt * 1000 / this.#k
      this.#cy -= this.#velocity[1] * dt * 1000 / this.#k
      const decay = Math.exp(-dt * 5)
      this.#velocity = [this.#velocity[0] * decay, this.#velocity[1] * decay]
    }
  }

  #updateNodes (now: number, dt: number) {
    const ease = 1 - Math.exp(-dt * 5.5)
    const fade = 1 - Math.exp(-dt * 6)
    let removed = false
    for (const node of this.#order) {
      if (now < node.start) {
        continue
      }
      node.x += (node.tx - node.x) * ease
      node.y += (node.ty - node.y) * ease
      node.r += ((node.removed ? 0 : node.tr) - node.r) * ease
      node.alpha += ((node.removed ? 0 : 1) - node.alpha) * fade
      if (node.removed && node.alpha < 0.02) {
        this.#nodes.delete(node.key)
        removed = true
      }
      const paint = node.key === rootKey ? undefined : this.#callbacks.paint(node.key, node.twin)
      if (paint) {
        node.rgb = mix(node.rgb, rgbOf(paint.color), fade)
      }
    }
    if (removed) {
      this.#order = this.#order.filter(node => this.#nodes.has(node.key))
    }
  }

  #draw (now: number) {
    const context = this.#context
    const theme = this.#theme
    context.setTransform(this.#ratio, 0, 0, this.#ratio, 0, 0)
    this.#drawBackground(now)

    const onSurface = rgbOf(theme.onSurface)
    const glow = theme.dark && this.#order.length < 900
    for (const node of this.#order) {
      if (node.key === rootKey || node.alpha < 0.01) {
        continue
      }
      const sx = this.#screenX(node.x)
      const sy = this.#screenY(node.y)
      const sr = node.r * this.#k
      if (sr < 0.4 || sx + sr < -40 || sy + sr < -40 || sx - sr > this.#width + 40 || sy - sr > this.#height + 40) {
        continue
      }
      const paint = this.#callbacks.paint(node.key, node.twin)
      const dimmed = this.#matches !== null && !this.#matches.has(node.key)
      const alpha = node.alpha * (dimmed ? (node.container ? 0.35 : 0.12) : 1)
      if (node.container) {
        this.#drawContainer(node, paint, sx, sy, sr, alpha, onSurface, now)
      } else {
        this.#drawLeaf(node, paint, sx, sy, sr, alpha, onSurface, now, glow && !dimmed)
      }
    }

    // Labels of containers on top of their contents.
    for (const node of this.#order) {
      if (node.container && node.key !== rootKey && node.alpha > 0.05) {
        this.#drawContainerLabel(node, onSurface)
      }
    }
    this.#drawIntro(now)
    this.#drawLasso()
    this.#drawTooltip()
  }

  #drawBackground (now: number) {
    const context = this.#context
    const { dark } = this.#theme
    context.fillStyle = this.#theme.background
    context.fillRect(0, 0, this.#width, this.#height)
    const onSurface = rgbOf(this.#theme.onSurface)
    if (dark) {
      // A star field with slight parallax and twinkle.
      const offsetX = -this.#cx * this.#k * 0.015
      const offsetY = -this.#cy * this.#k * 0.015
      for (const [x, y, size, phase] of this.#stars) {
        const px = ((x * this.#width + offsetX) % this.#width + this.#width) % this.#width
        const py = ((y * this.#height + offsetY) % this.#height + this.#height) % this.#height
        context.fillStyle = rgba(onSurface, 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(now / 900 + phase)))
        context.fillRect(px, py, size, size)
      }
      const gradient = context.createRadialGradient(this.#width / 2, this.#height / 2, 0, this.#width / 2, this.#height / 2, Math.max(this.#width, this.#height) * 0.75)
      gradient.addColorStop(0, rgba(rgbOf(this.#theme.primary), 0.07))
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      context.fillStyle = gradient
      context.fillRect(0, 0, this.#width, this.#height)
    } else {
      // A dot grid that moves with the map.
      const spacing = 28
      const offsetX = ((-this.#cx * this.#k * 0.1) % spacing + spacing) % spacing
      const offsetY = ((-this.#cy * this.#k * 0.1) % spacing + spacing) % spacing
      context.fillStyle = rgba(onSurface, 0.07)
      for (let x = offsetX; x < this.#width; x += spacing) {
        for (let y = offsetY; y < this.#height; y += spacing) {
          context.fillRect(x, y, 1.5, 1.5)
        }
      }
    }
  }

  #drawIntro (now: number) {
    // A shock wave when the fleet appears.
    const elapsed = now - this.#bornAt
    if (!this.#bornAt || elapsed > 1800) {
      return
    }
    const root = this.#nodes.get(rootKey)
    if (!root) {
      return
    }
    const t = elapsed / 1800
    const context = this.#context
    context.beginPath()
    context.arc(this.#screenX(worldSize / 2), this.#screenY(worldSize / 2), (0.1 + t * 1.4) * Math.max(this.#width, this.#height) * 0.6, 0, Math.PI * 2)
    context.strokeStyle = rgba(rgbOf(this.#theme.primary), (1 - t) * 0.5)
    context.lineWidth = 2 + (1 - t) * 6
    context.stroke()
  }

  #drawContainer (node: Node, paint: Paint, sx: number, sy: number, sr: number, alpha: number, onSurface: Rgb, now: number) {
    const context = this.#context
    const isTwin = Boolean(node.twin)
    context.beginPath()
    context.arc(sx, sy, sr, 0, Math.PI * 2)
    context.fillStyle = isTwin ? rgba(node.rgb, (this.#theme.dark ? 0.06 : 0.035) * alpha) : rgba(onSurface, (this.#theme.dark ? 0.035 : 0.02) * alpha)
    context.fill()
    context.lineWidth = isTwin ? 1.6 : 1
    context.strokeStyle = isTwin ? rgba(node.rgb, 0.6 * alpha) : rgba(onSurface, 0.16 * alpha)
    context.stroke()

    if (paint.ring !== undefined && sr > 14) {
      this.#drawRing(sx, sy, sr + 3, paint.ring, node.rgb, alpha, clamp(sr * 0.012, 1.5, 4))
    }
    if (paint.pulse && sr > 6) {
      const period = paint.pulse === 'alarm' ? 1400 : 2400
      const t = (now % period) / period
      context.beginPath()
      context.arc(sx, sy, sr + 2 + t * 10, 0, Math.PI * 2)
      context.strokeStyle = rgba(rgbOf(paint.pulse === 'alarm' ? '#ef4444' : '#f59e0b'), (1 - t) * 0.7 * alpha)
      context.lineWidth = 2
      context.stroke()
    }
    this.#drawMarks(node, sx, sy, sr, alpha)
  }

  #drawContainerLabel (node: Node, onSurface: Rgb) {
    const sr = node.r * this.#k
    if (sr < 34) {
      return
    }
    const context = this.#context
    const sx = this.#screenX(node.x)
    const sy = this.#screenY(node.y)
    if (sx + sr < 0 || sx - sr > this.#width || sy + sr < 0 || sy - sr > this.#height) {
      return
    }
    const size = clamp(sr * 0.06, 11, 20)
    const y = sy - sr + size * 1.6
    if (y < -20 || y > this.#height + 20) {
      return
    }
    const dimmed = this.#matches !== null && !this.#matches.has(node.key)
    const alpha = node.alpha * (dimmed ? 0.5 : 1) * clamp((sr - 34) / 30, 0, 1)
    context.font = `600 ${size}px ${this.#font}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const text = this.#fit(node.label, sr * 1.3)
    const width = context.measureText(text).width
    context.fillStyle = rgba(rgbOf(this.#theme.background), 0.72 * alpha)
    this.#roundRect(sx - width / 2 - 8, y - size * 0.85, width + 16, size * 1.7, size * 0.85)
    context.fill()
    context.fillStyle = rgba(node.twin ? mix(node.rgb, onSurface, this.#theme.dark ? 0.55 : 0.2) : onSurface, 0.92 * alpha)
    context.fillText(text, sx, y + 0.5)
  }

  #drawLeaf (node: Node, paint: Paint, sx: number, sy: number, sr: number, alpha: number, onSurface: Rgb, now: number, glow: boolean) {
    const context = this.#context
    const surface = rgbOf(this.#theme.surface)
    // Close up, a twin turns into its card.
    const card = clamp((sr - 55) / 45, 0, 1)

    if (paint.pulse && sr > 1.5) {
      const period = paint.pulse === 'alarm' ? 1100 : 2200
      const color = rgbOf(paint.pulse === 'alarm' ? '#ef4444' : '#f59e0b')
      for (const offset of paint.pulse === 'alarm' ? [0, 0.5] : [0]) {
        const t = ((now / period) + offset) % 1
        context.beginPath()
        context.arc(sx, sy, sr * (1 + t * 1.4) + 2, 0, Math.PI * 2)
        context.strokeStyle = rgba(color, (1 - t) * 0.75 * alpha)
        context.lineWidth = paint.pulse === 'alarm' ? 2.5 : 1.5
        context.stroke()
      }
    }

    context.beginPath()
    context.arc(sx, sy, sr, 0, Math.PI * 2)
    if (glow && sr > 2.5) {
      context.shadowColor = rgba(node.rgb, 0.85 * alpha)
      context.shadowBlur = clamp(sr * 0.9, 4, 28)
    }
    const fill = mix(node.rgb, surface, card * 0.88)
    if (paint.hollow) {
      context.fillStyle = rgba(surface, 0.6 * alpha)
      context.fill()
      context.setLineDash([4, 3])
      context.strokeStyle = rgba(node.rgb, 0.9 * alpha)
      context.lineWidth = 1.5
      context.stroke()
      context.setLineDash([])
    } else {
      context.fillStyle = rgba(fill, (0.92 + card * 0.08) * alpha)
      context.fill()
    }
    context.shadowBlur = 0
    context.shadowColor = 'transparent'
    if (!paint.hollow) {
      context.lineWidth = 1 + card * clamp(sr * 0.03, 1, 6)
      context.strokeStyle = card > 0 ? rgba(node.rgb, alpha) : rgba(this.#theme.dark ? [255, 255, 255] : [0, 0, 0], 0.18 * alpha)
      context.stroke()
    }
    if (paint.ring !== undefined && sr > 6) {
      this.#drawRing(sx, sy, sr + clamp(sr * 0.08, 2, 8), paint.ring, node.rgb, alpha, clamp(sr * 0.05, 1.5, 7))
    }
    this.#drawMarks(node, sx, sy, sr, alpha)

    if (sr >= 55 && alpha > 0.2) {
      this.#drawCard(node, sx, sy, sr, alpha * clamp((card - 0.35) / 0.65, 0, 1), fill, onSurface)
    }
    // The plain label fades out before the card fades in, so they never overlap.
    const labelAlpha = clamp(1 - card / 0.3, 0, 1)
    if (sr >= 18 && labelAlpha > 0 && alpha > 0.2) {
      const size = clamp(sr * 0.2, 9, 14)
      context.font = `500 ${size}px ${this.#font}`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillStyle = luminance(node.rgb) > 0.6 ? rgba([20, 20, 28], alpha * labelAlpha) : rgba([255, 255, 255], alpha * labelAlpha)
      const label = node.twin?.designation || node.label
      context.fillText(this.#fit(label, sr * 1.7), sx, sy)
    }
  }

  #drawCard (node: Node, sx: number, sy: number, sr: number, alpha: number, fill: Rgb, onSurface: Rgb) {
    if (alpha < 0.02) {
      return
    }
    const context = this.#context
    const description = this.#callbacks.describe(node.key, node.twin)
    const text = luminance(fill) > 0.55 ? [24, 24, 32] as Rgb : [250, 250, 252] as Rgb
    const tint = mix(node.rgb, text, 0.35)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    if (description.icon) {
      const glyph = this.#callbacks.glyph(description.icon)
      if (glyph) {
        context.font = `${clamp(sr * 0.2, 14, 72)}px "Material Design Icons"`
        context.fillStyle = rgba(node.rgb, alpha)
        context.fillText(glyph, sx, sy - sr * 0.48)
      }
    }
    context.font = `700 ${clamp(sr * 0.1, 11, 34)}px ${this.#font}`
    context.fillStyle = rgba(text, alpha)
    context.fillText(this.#fit(description.title, sr * 1.6), sx, sy - sr * 0.22)
    context.font = `400 ${clamp(sr * 0.065, 9, 20)}px ${this.#font}`
    context.fillStyle = rgba(text, 0.7 * alpha)
    context.fillText(this.#fit(description.subtitle, sr * 1.55), sx, sy - sr * 0.07)

    const stats = description.stats.slice(0, 3)
    const columnWidth = sr * 1.45 / Math.max(stats.length, 1)
    for (const [index, stat] of stats.entries()) {
      const x = sx - (sr * 1.45) / 2 + columnWidth * (index + 0.5)
      context.font = `700 ${clamp(sr * 0.085, 10, 28)}px ${this.#font}`
      context.fillStyle = rgba(stat.color ? rgbOf(stat.color) : tint, alpha)
      context.fillText(this.#fit(stat.value, columnWidth * 0.95), x, sy + sr * 0.2)
      context.font = `500 ${clamp(sr * 0.05, 8, 15)}px ${this.#font}`
      context.fillStyle = rgba(text, 0.6 * alpha)
      context.fillText(this.#fit(stat.label.toUpperCase(), columnWidth * 0.95), x, sy + sr * 0.33)
    }
    void onSurface
  }

  #drawRing (sx: number, sy: number, radius: number, fraction: number, rgb: Rgb, alpha: number, width: number) {
    const context = this.#context
    context.lineCap = 'round'
    context.lineWidth = width
    context.beginPath()
    context.arc(sx, sy, radius, 0, Math.PI * 2)
    context.strokeStyle = rgba(rgbOf(this.#theme.onSurface), 0.1 * alpha)
    context.stroke()
    if (fraction > 0) {
      context.beginPath()
      context.arc(sx, sy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(fraction, 0, 1))
      context.strokeStyle = rgba(rgb, 0.95 * alpha)
      context.stroke()
    }
    context.lineCap = 'butt'
  }

  /** Match, selection, focus and hover outlines. */
  #drawMarks (node: Node, sx: number, sy: number, sr: number, alpha: number) {
    const context = this.#context
    const primary = rgbOf(this.#theme.primary)
    const onSurface = rgbOf(this.#theme.onSurface)
    const gap = clamp(sr * 0.12, 3, 12)
    if (this.#matches?.has(node.key) && !node.container) {
      context.beginPath()
      context.arc(sx, sy, sr + gap, 0, Math.PI * 2)
      context.strokeStyle = rgba(primary, 0.95)
      context.lineWidth = 2.5
      context.stroke()
    }
    if (this.#selection.has(node.key)) {
      context.beginPath()
      context.arc(sx, sy, sr + gap + 3, 0, Math.PI * 2)
      context.setLineDash([5, 4])
      context.strokeStyle = rgba(onSurface, 0.9 * alpha)
      context.lineWidth = 1.8
      context.stroke()
      context.setLineDash([])
    }
    if (this.#focus === node.key || this.#hover === node) {
      context.beginPath()
      context.arc(sx, sy, sr + 1, 0, Math.PI * 2)
      context.strokeStyle = rgba(this.#focus === node.key ? primary : onSurface, this.#focus === node.key ? 1 : 0.55)
      context.lineWidth = this.#focus === node.key ? 3 : 2
      context.stroke()
    }
  }

  #drawLasso () {
    if (!this.#lasso || this.#lasso.length < 2) {
      return
    }
    const context = this.#context
    const primary = rgbOf(this.#theme.primary)
    context.beginPath()
    context.moveTo(...this.#lasso[0]!)
    for (const point of this.#lasso.slice(1)) {
      context.lineTo(...point)
    }
    context.closePath()
    context.fillStyle = rgba(primary, 0.1)
    context.fill()
    context.setLineDash([6, 4])
    context.strokeStyle = rgba(primary, 0.9)
    context.lineWidth = 1.5
    context.stroke()
    context.setLineDash([])
  }

  #drawTooltip () {
    const node = this.#hover
    const pointer = this.#pointer
    if (!node || !pointer || this.#drag?.moved || this.#lasso || node.removed || node.key === rootKey) {
      return
    }
    const sr = node.r * this.#k
    if (!node.container && sr >= 70) {
      return
    }
    const context = this.#context
    const description = this.#callbacks.describe(node.key, node.twin)
    const lines = [description.subtitle, ...description.stats.map(stat => `${stat.label}: ${stat.value}`)].filter(Boolean).slice(0, 4)
    context.font = `600 13px ${this.#font}`
    const titleWidth = context.measureText(description.title).width
    context.font = `400 12px ${this.#font}`
    const width = Math.min(320, Math.max(titleWidth, ...lines.map(line => context.measureText(line).width)) + 24)
    const height = 30 + lines.length * 18
    let x = pointer[0] + 16
    let y = pointer[1] + 16
    if (x + width > this.#width - this.#insetRight - 8) {
      x = pointer[0] - width - 16
    }
    if (y + height > this.#height - 8) {
      y = pointer[1] - height - 16
    }
    const surface = rgbOf(this.#theme.surface)
    const onSurface = rgbOf(this.#theme.onSurface)
    context.shadowColor = 'rgba(0,0,0,0.35)'
    context.shadowBlur = 18
    context.fillStyle = rgba(surface, 0.96)
    this.#roundRect(x, y, width, height, 10)
    context.fill()
    context.shadowBlur = 0
    context.shadowColor = 'transparent'
    context.strokeStyle = rgba(node.rgb, 0.8)
    context.lineWidth = 1.2
    context.stroke()
    context.textAlign = 'left'
    context.textBaseline = 'top'
    context.font = `600 13px ${this.#font}`
    context.fillStyle = rgba(onSurface, 1)
    context.fillText(this.#fit(description.title, width - 24), x + 12, y + 10)
    context.font = `400 12px ${this.#font}`
    context.fillStyle = rgba(onSurface, 0.75)
    for (const [index, line] of lines.entries()) {
      context.fillText(this.#fit(line, width - 24), x + 12, y + 30 + index * 18)
    }
  }

  #roundRect (x: number, y: number, width: number, height: number, radius: number) {
    const context = this.#context
    context.beginPath()
    context.roundRect(x, y, width, height, radius)
  }

  /** Shortens text with an ellipsis to fit a width in the current font. */
  #fit (text: string, width: number) {
    const context = this.#context
    if (context.measureText(text).width <= width) {
      return text
    }
    let low = 0
    let high = text.length
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (context.measureText(`${text.slice(0, middle)}…`).width <= width) {
        low = middle
      } else {
        high = middle - 1
      }
    }
    return low > 0 ? `${text.slice(0, low)}…` : ''
  }
}

export { rootKey }
