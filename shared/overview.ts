import { z } from 'zod'

/**
 * The layout of a shell's Overview (ADR 0032): widgets on a 12-column grid
 * that the user arranges and resizes. Positions use the shape of the layout
 * items of view definitions (docs/architecture/views-and-dashboards.md), so a
 * stored layout can later become one.
 */
export const overviewColumns = 12
/** Height of a grid row and the gap between rows and columns, in CSS pixels. */
export const overviewRowHeight = 16
export const overviewGap = 16

const widgetId = z.string().min(1).max(1200)

export const overviewItemSchema = z.object({
  i: widgetId,
  x: z.number().int().min(0).max(overviewColumns - 1),
  y: z.number().int().min(0).max(10_000),
  w: z.number().int().min(1).max(overviewColumns),
  /** Rows when expanded; a collapsed widget shows only its header. */
  h: z.number().int().min(1).max(400),
  /** Follows the height of its content until the user resizes it. */
  fit: z.boolean().default(true),
  collapsed: z.boolean().default(false),
})
export type OverviewItem = z.infer<typeof overviewItemSchema>

/** Values that can be pinned to one shell's Overview. */
export const overviewPinLimit = 24

/** A value of the shell pinned to its Overview. */
export const overviewPinSchema = z.object({
  submodelKey: z.string().min(1).max(4000),
  elementKey: z.string().min(1).max(4000),
  /** The element's title when it was pinned, shown until its value is read. */
  title: z.string().max(500),
})
export type OverviewPin = z.infer<typeof overviewPinSchema>

export const shellOverviewSchema = z.object({
  items: z.array(overviewItemSchema).max(100).default([]),
  hidden: z.array(widgetId).max(100).default([]),
  pins: z.array(overviewPinSchema).max(overviewPinLimit).default([]),
})
export type ShellOverviewLayout = z.infer<typeof shellOverviewSchema>

/** What one undo puts back: positions, hidden widgets and pins. */
export type OverviewSnapshot = Pick<ShellOverviewLayout, 'items' | 'hidden' | 'pins'>

function withoutNull<T> (record: Record<string, T | null>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, T] => entry[1] !== null))
}

/**
 * The Overviews of a user's preferences, per target and shell key. A shell's
 * stored value that no longer validates is dropped on its own, so the other
 * shells keep their layouts.
 */
export const overviewsSchema = z.record(
  z.string().max(100),
  z.record(z.string().max(4000), shellOverviewSchema.nullable().catch(null)).transform(withoutNull),
).default({}).catch({})

/** Shells per target whose Overview layout is kept; the least recently changed are dropped. */
export const overviewShellLimit = 30

/** Height of a widget's header with the divider below it, in CSS pixels. */
export const overviewHeaderHeight = 45

/** Grid rows that hold `pixels` of content. */
export function overviewRows (pixels: number): number {
  return Math.max(2, Math.ceil((pixels + overviewGap) / (overviewRowHeight + overviewGap)))
}

/** A grid position; `i` is the widget's ID. */
export interface GridBox { i: string, x: number, y: number, w: number, h: number }

function collides (a: GridBox, b: GridBox): boolean {
  return a.i !== b.i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** The first free position for a `w` × `h` box, row by row from the top. */
export function freePosition (layout: GridBox[], w: number, h: number): { x: number, y: number } {
  const width = Math.min(w, overviewColumns)
  const bottom = layout.reduce((max, box) => Math.max(max, box.y + box.h), 0)
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + width <= overviewColumns; x++) {
      const candidate = { i: '', x, y, w: width, h }
      if (!layout.some(box => collides(candidate, box))) {
        return { x, y }
      }
    }
  }
  return { x: 0, y: bottom }
}

/** A widget on the Overview with the size it starts with; `first` places a new one at the top. */
export interface OverviewWidgetSize { id: string, w: number, h: number, first?: boolean }

/**
 * The stored items of the given widgets, in the widgets' order, with a free
 * position for each widget that has none yet. Items of widgets that no
 * longer exist are dropped.
 */
export function mergeOverviewLayout (widgets: OverviewWidgetSize[], stored: OverviewItem[]): OverviewItem[] {
  const byId = new Map(stored.map(item => [item.i, item]))
  const placed: OverviewItem[] = widgets.flatMap(widget => byId.get(widget.id) ?? [])
  return widgets.map(widget => {
    const known = byId.get(widget.id)
    if (known) {
      return known
    }
    // A widget placed first overlaps the others; compacting the grid moves them down.
    const position = widget.first ? { x: 0, y: 0 } : freePosition(placed, widget.w, widget.h)
    const item: OverviewItem = { i: widget.id, ...position, w: widget.w, h: widget.h, fit: true, collapsed: false }
    placed.push(item)
    return item
  })
}

/** The items in reading order: row by row, left to right. */
export function readingOrder<T extends GridBox> (items: T[]): T[] {
  return items.toSorted((a, b) => a.y - b.y || a.x - b.x)
}

/** The common area of two boxes, in grid cells. */
export function overlapArea (a: GridBox, b: GridBox): number {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

/** New positions of boxes, by widget ID. */
export type GridPositions = Map<string, { x: number, y: number }>

/**
 * A widget dropped onto another trades places with it, instead of pushing
 * it down and leaving its own place empty: the widget it overlaps most moves
 * to where the dropped one started, every other widget goes back to its
 * start, and the dropped one stays where it was dropped. `null` when it was
 * dropped into free space, where the grid's own placement stays.
 */
export function swapOnDrop (boxes: GridBox[], id: string, start: ReadonlyMap<string, GridBox>): GridPositions | null {
  const dropped = boxes.find(box => box.i === id)
  const from = start.get(id)
  if (!dropped || !from) {
    return null
  }
  const target = boxes
    .filter(box => box.i !== id && start.has(box.i))
    .map(box => ({ box, area: overlapArea(start.get(box.i)!, dropped) }))
    .filter(candidate => candidate.area > 0)
    .toSorted((a, b) => b.area - a.area)[0]
    ?.box
  if (!target) {
    return null
  }
  const positions: GridPositions = new Map()
  for (const box of boxes) {
    const before = start.get(box.i)
    if (box.i !== id && before) {
      positions.set(box.i, { x: before.x, y: before.y })
    }
  }
  positions.set(target.i, { x: Math.min(from.x, overviewColumns - target.w), y: from.y })
  return positions
}

/**
 * Swaps a widget with the one before (`-1`) or after (`1`) it in reading
 * order, the keyboard way to arrange them. `null` at either end.
 */
export function swapInReadingOrder (boxes: GridBox[], id: string, step: -1 | 1): GridPositions | null {
  const order = readingOrder(boxes)
  const index = order.findIndex(box => box.i === id)
  const box = order[index]
  const other = order[index + step]
  if (index === -1 || !box || !other) {
    return null
  }
  return new Map([
    [box.i, { x: other.x, y: other.y }],
    [other.i, { x: Math.min(box.x, overviewColumns - other.w), y: box.y }],
  ])
}
