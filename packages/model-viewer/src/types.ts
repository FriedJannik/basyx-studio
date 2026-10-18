/** Triangles of one color, as the IFC and STEP parsers hand them to the viewer. */
export interface MeshBatch {
  name: string | null
  /** x, y, z per vertex. */
  positions: Float32Array
  /** x, y, z per vertex, or `null` to compute them. */
  normals: Float32Array | null
  indices: Uint32Array
  /** sRGB red, green, blue and alpha (0 to 1), or `null` for the default color. */
  color: [number, number, number, number] | null
  /** sRGB red, green and blue per vertex; overrides `color`. */
  vertexColors: Float32Array | null
  /** IFC: the express ID of the element each vertex belongs to. */
  ids: Uint32Array | null
}

/** A value of an IFC property or quantity. */
export interface IfcProperty {
  name: string
  value: string
}

export interface IfcPropertyGroup {
  name: string
  properties: IfcProperty[]
}

/** What the viewer shows of a picked IFC element. */
export interface IfcElementInfo {
  expressId: number
  /** The IFC entity, e.g. `IFCWALLSTANDARDCASE`. */
  type: string
  name: string | null
  globalId: string | null
  /** The element's attributes, then its property and quantity sets. */
  groups: IfcPropertyGroup[]
}

/** Load progress from 0 to 1, or `null` while it is unknown. */
export type ProgressCallback = (progress: number | null) => void
