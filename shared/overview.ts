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

/** Vuetify's breakpoint names, smallest first. */
export const displayBreakpoints = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const
export type DisplayBreakpoint = (typeof displayBreakpoints)[number]

/** Breakpoints the grid arranges for; narrower Overviews stack their widgets. */
export const overviewBreakpoints = ['sm', 'md', 'lg', 'xl', 'xxl'] as const
export type OverviewBreakpoint = (typeof overviewBreakpoints)[number]

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

const overviewItemsSchema = z.array(overviewItemSchema).max(100)

export const shellOverviewSchema = z.object({
  /** The layout per breakpoint of the Overview's width. */
  layouts: z.partialRecord(z.enum(overviewBreakpoints), overviewItemsSchema).default({}),
  /** A layout from before there was one per breakpoint; used where a breakpoint has none. */
  items: overviewItemsSchema.default([]),
  hidden: z.array(widgetId).max(100).default([]),
  pins: z.array(overviewPinSchema).max(overviewPinLimit).default([]),
})
export type ShellOverviewLayout = z.infer<typeof shellOverviewSchema>

/** What one undo puts back: positions, hidden widgets and pins. */
export type OverviewSnapshot = Pick<ShellOverviewLayout, 'layouts' | 'items' | 'hidden' | 'pins'>

/** The stored layout of one breakpoint. */
export function itemsAt (layout: Pick<ShellOverviewLayout, 'layouts' | 'items'>, breakpoint: OverviewBreakpoint): OverviewItem[] {
  return layout.layouts[breakpoint] ?? layout.items
}

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

/** The items in reading order: row by row, left to right. */
export function readingOrder<T extends GridBox> (items: T[]): T[] {
  return items.toSorted((a, b) => a.y - b.y || a.x - b.x)
}

// Rows. The Overview is a stack of rows: the widgets of a row sit side by
// side, share one height and together fill the 12 columns, so the grid looks
// even at every width. Stored items keep the `{ i, x, y, w, h }` shape; rows
// are derived from them and laid out again after every change.

/** Narrowest widget, in columns; so a row holds at most four widgets. */
export const overviewMinColumns = 3
export const overviewRowLimit = Math.floor(overviewColumns / overviewMinColumns)

/** The edge of a row, in grid rows, where a dropped widget gets a row of its own. */
export const overviewRowEdge = 3

/** A row of the Overview: its widgets, left to right. */
export type OverviewRow = OverviewItem[]

/**
 * Widths that fill the 12 columns, in proportion to `widths`, each at least
 * `overviewMinColumns`. The width at `keep` stays as it is (within what the
 * others need), the others share the rest.
 */
export function fillWidths (widths: number[], keep?: number): number[] {
  const count = widths.length
  if (count === 0) {
    return []
  }
  const fixed = keep === undefined || count === 1
    ? null
    : Math.min(Math.max(widths[keep]!, overviewMinColumns), overviewColumns - overviewMinColumns * (count - 1))
  const indexes = widths.map((_, index) => index).filter(index => fixed === null || index !== keep)
  const total = fixed === null ? overviewColumns : overviewColumns - fixed
  const weights = new Map(indexes.map(index => [index, Math.max(widths[index]!, 1)]))
  // Shares in proportion to the widths; a share below the minimum gets the
  // minimum, and the others share the rest again.
  const shares = new Map<number, number>()
  let open = [...indexes]
  let room = total
  for (;;) {
    const weightSum = open.reduce((sum, index) => sum + weights.get(index)!, 0)
    const small = open.filter(index => room * weights.get(index)! / weightSum < overviewMinColumns)
    if (small.length === 0) {
      for (const index of open) {
        shares.set(index, room * weights.get(index)! / weightSum)
      }
      break
    }
    for (const index of small) {
      shares.set(index, overviewMinColumns)
    }
    room -= overviewMinColumns * small.length
    open = open.filter(index => !small.includes(index))
  }
  // Whole columns; the remainders go to the largest fractions, so the row sums to 12.
  const result = [...widths]
  for (const index of indexes) {
    result[index] = Math.floor(shares.get(index)!)
  }
  let left = total - indexes.reduce((sum, index) => sum + result[index]!, 0)
  const byFraction = indexes.toSorted((a, b) => (shares.get(b)! % 1) - (shares.get(a)! % 1) || a - b)
  for (const index of byFraction) {
    if (left <= 0) {
      break
    }
    result[index]!++
    left--
  }
  if (fixed !== null) {
    result[keep!] = fixed
  }
  return result
}

/**
 * Groups items into rows, top to bottom: an item joins the row above it
 * when its top lies in that row's upper half and it shares no column with
 * the row's widgets; a full row starts a new one. Items arranged by hand
 * before rows existed come out as rows of their own.
 */
export function groupRows (items: OverviewItem[]): OverviewRow[] {
  const rows: { top: number, height: number, items: OverviewItem[] }[] = []
  for (const item of readingOrder(items)) {
    const row = rows.at(-1)
    const fits = row
      && item.y < row.top + Math.max(1, Math.ceil(row.height / 2))
      && row.items.length < overviewRowLimit
      && !row.items.some(member => item.x < member.x + member.w && member.x < item.x + item.w)
    if (row && fits) {
      row.items.push(item)
      row.height = Math.min(row.height, item.h)
    } else {
      rows.push({ top: item.y, height: item.h, items: [item] })
    }
  }
  return rows.map(row => row.items.toSorted((a, b) => a.x - b.x))
}

/**
 * Places rows on the grid: widths fill each row, every widget of a row
 * gets the row's height, and rows stack from the top. `heightOf` gives a
 * row's height in grid rows.
 */
export function layoutRows (rows: OverviewRow[], heightOf: (row: OverviewRow) => number): OverviewItem[] {
  let y = 0
  return rows.filter(row => row.length > 0).flatMap(row => {
    const widths = fillWidths(row.map(item => item.w))
    const h = heightOf(row)
    let x = 0
    const placed = row.map((item, index) => {
      const next = { ...item, x, y, w: widths[index]!, h }
      x += next.w
      return next
    })
    y += h
    return placed
  })
}

/**
 * The height of a row: the height the user gave it, or, while its widgets
 * follow their content, the tallest content (`desired`).
 */
export function rowHeight (row: OverviewRow, desired: (item: OverviewItem) => number): number {
  const manual = row.filter(item => !item.fit)
  return manual.length > 0
    ? Math.max(...manual.map(item => item.h))
    : Math.max(...row.map(item => desired(item)))
}

/** A widget on the Overview with the size it starts with; `first` places a new one at the top. */
export interface OverviewWidgetSize { id: string, w: number, h: number, first?: boolean }

/** Rows of new widgets, filled left to right in their order. */
function packRows (widgets: OverviewWidgetSize[]): OverviewRow[] {
  const rows: OverviewRow[] = []
  let used = overviewColumns
  for (const widget of widgets) {
    const item: OverviewItem = { i: widget.id, x: 0, y: 0, w: widget.w, h: widget.h, fit: true, collapsed: false }
    const row = rows.at(-1)
    if (row && used + widget.w <= overviewColumns && row.length < overviewRowLimit) {
      row.push(item)
      used += widget.w
    } else {
      rows.push([item])
      used = widget.w
    }
  }
  return rows
}

/**
 * The rows of the given widgets: the stored items' rows, then the widgets
 * without one, filled into new rows at their default widths (a widget
 * marked `first` gets a row at the top). Items of widgets that no longer
 * exist are dropped.
 */
export function mergeOverviewLayout (widgets: OverviewWidgetSize[], stored: OverviewItem[]): OverviewRow[] {
  const ids = new Set(widgets.map(widget => widget.id))
  const known = new Set(stored.map(item => item.i))
  const rows = groupRows(stored.filter(item => ids.has(item.i)))
  const missing = widgets.filter(widget => !known.has(widget.id))
  const first = missing.filter(widget => widget.first)
  const rest = missing.filter(widget => !widget.first)
  return [...first.map(widget => packRows([widget])[0]!), ...rows, ...packRows(rest)]
}

function rowIndexOf (rows: OverviewRow[], id: string): number {
  return rows.findIndex(row => row.some(item => item.i === id))
}

function copyRows (rows: OverviewRow[]): OverviewRow[] {
  return rows.map(row => row.map(item => ({ ...item })))
}

/**
 * A widget resized to `w` columns (and `h` grid rows, if given): the other
 * widgets of its row share the remaining columns, and those that no longer
 * fit move to a new row below. A new height is the whole row's.
 */
export function resizeInRows (rows: OverviewRow[], id: string, w: number, h?: number): OverviewRow[] {
  const next = copyRows(rows)
  const index = rowIndexOf(next, id)
  if (index === -1) {
    return next
  }
  const row = next[index]!
  const width = Math.min(Math.max(w, overviewMinColumns), overviewColumns)
  const room = Math.floor((overviewColumns - width) / overviewMinColumns)
  const position = row.findIndex(item => item.i === id)
  const others = row.filter(item => item.i !== id)
  const kept = others.slice(0, room)
  const moved = others.slice(room)
  const resized = { ...row[position]!, w: width }
  const members = [...kept.slice(0, position), resized, ...kept.slice(position)]
  const widths = fillWidths(members.map(item => item.w), members.indexOf(resized))
  const placed = members.map((item, at) => ({ ...item, w: widths[at]!, ...(h === undefined ? {} : { h, fit: false }) }))
  next.splice(index, 1, placed, ...(moved.length > 0 ? [moved] : []))
  return next
}

/**
 * A widget dropped with the pointer at column `x` and grid row `y` (both may
 * be fractional) of the rows as they were when the drag began: over the
 * middle of a row, it joins that row where it was dropped, and the row's
 * widgets share the width evenly; a full row gets a new row below it. Over
 * the upper or lower edge of a row (a quarter of it, at most
 * `overviewRowEdge` grid rows), or above or below all rows, it gets a row of
 * its own there, so it can move without joining or resizing anything.
 * Moved within its own row, it only changes places: every width stays.
 * `spans` are the rows' places on the grid as shown (a collapsed row is
 * lower than its height); by default the rows' heights stacked from the top.
 */
export function dropInRows (rows: OverviewRow[], id: string, x: number, y: number, spans?: { top: number, height: number }[]): OverviewRow[] {
  const from = rowIndexOf(rows, id)
  if (from === -1) {
    return copyRows(rows)
  }
  const dragged = rows[from]!.find(item => item.i === id)!
  let top = 0
  const places = spans ?? rows.map(row => {
    const span = { top, height: row[0]?.h ?? 0 }
    top += span.height
    return span
  })
  const target = rows.findIndex((_, index) => places[index] !== undefined && y >= places[index]!.top && y < places[index]!.top + places[index]!.height)
  const next = copyRows(rows).map(row => row.filter(item => item.i !== id))
  const moved: OverviewItem = { ...dragged, w: overviewColumns }
  const alone = next[from]!.length === 0
  if (target === -1) {
    // Above or below every row.
    if (y < 0) {
      next.unshift([moved])
    } else {
      next.push([moved])
    }
    return refill(next)
  }
  const place = places[target]!
  const edge = Math.min(overviewRowEdge, place.height / 4)
  const side = y < place.top + edge ? 'above' : (y >= place.top + place.height - edge ? 'below' : null)
  if (target === from && alone) {
    // Back into the row it was alone in.
    next[from] = [moved]
    return refill(next)
  }
  if (side) {
    // Between rows: a row of its own, nothing else changes.
    next.splice(side === 'above' ? target : target + 1, 0, [moved])
    return refill(next)
  }
  const row = next[target]!
  if (row.length >= overviewRowLimit) {
    next.splice(target + 1, 0, [moved])
    return refill(next)
  }
  // Before the first widget whose centre lies right of the drop.
  const at = row.filter(item => item.x + item.w / 2 <= x).length
  if (target === from) {
    // Reordered within its row: every widget keeps its width.
    next[target] = [...row.slice(0, at), dragged, ...row.slice(at)]
    return refill(next)
  }
  const even = Math.floor(overviewColumns / (row.length + 1))
  const members = [...row.slice(0, at), { ...moved, h: row[0]?.h ?? moved.h, fit: row[0]?.fit ?? moved.fit }, ...row.slice(at)]
  next[target] = members.map(item => ({ ...item, w: even }))
  return refill(next)
}

/** The same rows: the same widgets in the same places, with the same sizes. */
export function sameRows (a: OverviewRow[], b: OverviewRow[]): boolean {
  const shape = (rows: OverviewRow[]) => JSON.stringify(rows.map(row => row.map(item => [item.i, item.w, item.h, item.fit, item.collapsed])))
  return shape(a) === shape(b)
}

/** Rows without the empty ones, each filling the 12 columns. */
function refill (rows: OverviewRow[]): OverviewRow[] {
  return rows.filter(row => row.length > 0).map(row => {
    const widths = fillWidths(row.map(item => item.w))
    return row.map((item, index) => ({ ...item, w: widths[index]! }))
  })
}

/**
 * Swaps a widget with the one before (`-1`) or after (`1`) it in reading
 * order, the keyboard way to arrange them: each takes the other's place and
 * width. `null` at either end.
 */
export function moveInRows (rows: OverviewRow[], id: string, step: -1 | 1): OverviewRow[] | null {
  const next = copyRows(rows)
  const slots = next.flat()
  const index = slots.findIndex(item => item.i === id)
  const other = slots[index + step]
  if (index === -1 || !other) {
    return null
  }
  const box = slots[index]!
  const swapped = { i: other.i, collapsed: other.collapsed }
  Object.assign(other, { i: box.i, collapsed: box.collapsed })
  Object.assign(box, swapped)
  return next
}

/** Every widget of the row of `id` follows its content again. */
export function fitRow (rows: OverviewRow[], id: string): OverviewRow[] {
  const index = rowIndexOf(rows, id)
  return copyRows(rows).map((row, at) => at === index ? row.map(item => ({ ...item, fit: true })) : row)
}

// Breakpoints. Each widget brings default widths per Vuetify breakpoint (an
// app declares them in its manifest), and the Overview keeps one layout per
// breakpoint, picked by its own width, so open drawers count.

/** Default widths of a widget, in columns of 12, per breakpoint. */
export type WidgetColumns = Partial<Record<DisplayBreakpoint, number>>

/**
 * The columns a widget asks for at a breakpoint: the value given for it or
 * for the nearest smaller breakpoint; `fallback` when none is given.
 */
export function columnsAt (columns: WidgetColumns | null | undefined, breakpoint: DisplayBreakpoint, fallback: number = overviewColumns): number {
  const index = displayBreakpoints.indexOf(breakpoint)
  for (let at = index; at >= 0; at--) {
    const value = columns?.[displayBreakpoints[at]!]
    if (value !== undefined) {
      return Math.min(Math.max(Math.round(value), overviewMinColumns), overviewColumns)
    }
  }
  return fallback
}

/** The breakpoint of an Overview `width` pixels wide, with Vuetify's thresholds. */
export function overviewBreakpoint (width: number, thresholds: Record<DisplayBreakpoint, number>): OverviewBreakpoint {
  const name = displayBreakpoints.findLast(breakpoint => width >= thresholds[breakpoint]) ?? 'xs'
  return name === 'xs' ? 'sm' : name
}
