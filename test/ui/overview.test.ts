import type { OverviewItem, OverviewRow } from '#shared/overview'
import { describe, expect, it } from 'vitest'
import { defaultPreferences, preferencesSchema } from '#shared/contract'
import { columnsAt, dropInRows, fillWidths, fitRow, groupRows, itemsAt, layoutRows, mergeOverviewLayout, moveInRows, overviewBreakpoint, overviewRows, readingOrder, resizeInRows, rowHeight, sameRows } from '#shared/overview'

/** An item at the given place; following its content unless `fit` is given. */
function item (i: string, x: number, y: number, w: number, h = 4, fit = true): OverviewItem {
  return { i, x, y, w, h, fit, collapsed: false }
}

/** The widget IDs and widths of rows, e.g. `[['a', 6], ['b', 6]]` per row. */
function shape (rows: OverviewRow[]) {
  return rows.map(row => row.map(entry => [entry.i, entry.w]))
}

describe('overview layout', () => {
  it('sizes rows to hold their content', () => {
    // A row is 16 px with a 16 px gap: n rows hold 32n - 16 px.
    expect(overviewRows(48)).toBe(2)
    expect(overviewRows(49)).toBe(3)
    expect(overviewRows(0)).toBe(2)
  })

  it('orders widgets row by row, left to right', () => {
    const order = readingOrder([
      { i: 'c', x: 0, y: 5, w: 6, h: 1 },
      { i: 'b', x: 6, y: 0, w: 6, h: 1 },
      { i: 'a', x: 0, y: 0, w: 6, h: 1 },
    ])
    expect(order.map(box => box.i)).toEqual(['a', 'b', 'c'])
  })

  describe('widths', () => {
    it('fills the 12 columns in proportion', () => {
      expect(fillWidths([6])).toEqual([12])
      expect(fillWidths([6, 6])).toEqual([6, 6])
      expect(fillWidths([4, 4])).toEqual([6, 6])
      expect(fillWidths([3, 3, 3])).toEqual([4, 4, 4])
      expect(fillWidths([8, 4])).toEqual([8, 4])
      expect(fillWidths([])).toEqual([])
    })

    it('keeps the width of one widget and lets the others share the rest', () => {
      expect(fillWidths([8, 6], 0)).toEqual([8, 4])
      expect(fillWidths([3, 6, 6], 0)).toEqual([3, 5, 4])
      // Never narrower than three columns for the others.
      expect(fillWidths([12, 6], 0)).toEqual([9, 3])
    })
  })

  describe('rows', () => {
    it('groups items side by side into rows', () => {
      const rows = groupRows([item('c', 0, 4, 12), item('b', 6, 0, 6), item('a', 0, 0, 6)])
      expect(shape(rows)).toEqual([[['a', 6], ['b', 6]], [['c', 12]]])
    })

    it('starts a new row for an item that shares a column or sits lower', () => {
      // A layout arranged before rows: 'b' below 'a' in the same columns, 'c' half a row lower.
      const rows = groupRows([item('a', 0, 0, 6, 10), item('b', 0, 10, 6), item('c', 6, 6, 6)])
      expect(shape(rows)).toEqual([[['a', 6]], [['c', 6]], [['b', 6]]])
    })

    it('lays out rows full width, with one height each, from the top', () => {
      const items = layoutRows([[item('a', 0, 0, 6, 4), item('b', 6, 0, 3, 9)], [item('c', 0, 0, 6, 5)]], row => Math.max(...row.map(entry => entry.h)))
      expect(items).toEqual([
        item('a', 0, 0, 8, 9),
        item('b', 8, 0, 4, 9),
        item('c', 0, 9, 12, 5),
      ])
    })

    it('gives a row the tallest content, or the height the user gave it', () => {
      const desired = (entry: OverviewItem) => ({ a: 7, b: 12 })[entry.i as 'a' | 'b'] ?? entry.h
      expect(rowHeight([item('a', 0, 0, 6), item('b', 6, 0, 6)], desired)).toBe(12)
      expect(rowHeight([item('a', 0, 0, 6, 5, false), item('b', 6, 0, 6, 5, false)], desired)).toBe(5)
    })
  })

  describe('merging stored and new widgets', () => {
    it('keeps stored rows, fills new widgets into rows and drops unknown ones', () => {
      const stored = [item('a', 0, 0, 12), item('gone', 0, 4, 12)]
      const rows = mergeOverviewLayout([{ id: 'a', w: 6, h: 10 }, { id: 'b', w: 6, h: 3 }, { id: 'c', w: 6, h: 3 }, { id: 'd', w: 8, h: 3 }], stored)
      expect(shape(rows)).toEqual([[['a', 12]], [['b', 6], ['c', 6]], [['d', 8]]])
    })

    it('puts a new widget marked first in a row at the top', () => {
      const rows = mergeOverviewLayout([{ id: 'a', w: 6, h: 4 }, { id: 'live', w: 12, h: 4, first: true }], [item('a', 0, 0, 12)])
      expect(shape(rows)).toEqual([[['live', 12]], [['a', 12]]])
    })

    it('puts at most four widgets in a new row', () => {
      const widgets = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, w: 2, h: 4 }))
      expect(mergeOverviewLayout(widgets, []).map(row => row.length)).toEqual([4, 1])
    })
  })

  describe('resizing', () => {
    const rows = [[item('a', 0, 0, 4), item('b', 4, 0, 4), item('c', 8, 0, 4)], [item('d', 0, 4, 12)]]

    it('lets the other widgets of the row share what is left', () => {
      expect(shape(resizeInRows(rows, 'a', 6))).toEqual([[['a', 6], ['b', 3], ['c', 3]], [['d', 12]]])
    })

    it('moves the widgets that no longer fit to a row below', () => {
      expect(shape(resizeInRows(rows, 'b', 8))).toEqual([[['a', 4], ['b', 8]], [['c', 4]], [['d', 12]]])
      expect(shape(resizeInRows(rows, 'a', 12))).toEqual([[['a', 12]], [['b', 4], ['c', 4]], [['d', 12]]])
    })

    it('gives a new height to the whole row and stops it following its content', () => {
      const next = resizeInRows(rows, 'a', 4, 9)
      expect(next[0]!.map(entry => [entry.h, entry.fit])).toEqual([[9, false], [9, false], [9, false]])
      expect(next[1]![0]!.fit).toBe(true)
    })

    it('makes a row follow its content again', () => {
      const manual = resizeInRows(rows, 'a', 4, 9)
      expect(fitRow(manual, 'b')[0]!.every(entry => entry.fit)).toBe(true)
    })
  })

  describe('dropping', () => {
    // Two rows: 'a' and 'b' (rows 0–3), 'c' alone (rows 4–7).
    const rows = [[item('a', 0, 0, 6), item('b', 6, 0, 6)], [item('c', 0, 4, 12)]]

    it('joins the row it is dropped on, where it is dropped, sharing the width evenly', () => {
      expect(shape(dropInRows(rows, 'c', 0, 1.5))).toEqual([[['c', 4], ['a', 4], ['b', 4]]])
      expect(shape(dropInRows(rows, 'c', 10.5, 2))).toEqual([[['a', 4], ['b', 4], ['c', 4]]])
    })

    it('gets a row of its own over the edge of a row, or above every row', () => {
      // The rows are 4 grid rows high, so their edges are 1 grid row.
      expect(shape(dropInRows(rows, 'c', 3, 0.5))).toEqual([[['c', 12]], [['a', 6], ['b', 6]]])
      expect(shape(dropInRows(rows, 'c', 3, -1))).toEqual([[['c', 12]], [['a', 6], ['b', 6]]])
      expect(shape(dropInRows(rows, 'a', 3, 3.5))).toEqual([[['b', 12]], [['a', 12]], [['c', 12]]])
    })

    it('takes the height of the row it joins', () => {
      const tall = [[item('a', 0, 0, 6, 9, false), item('b', 6, 0, 6, 9, false)], [item('c', 0, 9, 12)]]
      expect(dropInRows(tall, 'c', 0, 4)[0]![0]).toMatchObject({ i: 'c', h: 9, fit: false })
    })

    it('gets a row of its own below every row', () => {
      expect(shape(dropInRows(rows, 'a', 0, 20))).toEqual([[['b', 12]], [['c', 12]], [['a', 12]]])
    })

    it('reorders within its own row and keeps every width', () => {
      expect(shape(dropInRows(rows, 'a', 10, 2))).toEqual([[['b', 6], ['a', 6]], [['c', 12]]])
      const uneven = [[item('a', 0, 0, 8), item('b', 8, 0, 4)]]
      expect(shape(dropInRows(uneven, 'a', 11, 2))).toEqual([[['b', 4], ['a', 8]]])
    })

    it('tells whether a drop changed anything', () => {
      expect(sameRows(dropInRows(rows, 'c', 3, 5), rows)).toBe(true)
      expect(sameRows(dropInRows(rows, 'a', 10, 2), rows)).toBe(false)
    })

    it('stays where it was when dropped back into the row it was alone in', () => {
      expect(shape(dropInRows(rows, 'c', 3, 5))).toEqual([[['a', 6], ['b', 6]], [['c', 12]]])
    })

    it('gets a new row below a full one', () => {
      const full = [[item('a', 0, 0, 3), item('b', 3, 0, 3), item('c', 6, 0, 3), item('d', 9, 0, 3)], [item('e', 0, 4, 12)]]
      expect(shape(dropInRows(full, 'e', 0, 2))).toEqual([[['a', 3], ['b', 3], ['c', 3], ['d', 3]], [['e', 12]]])
    })

    it('uses the rows as shown, where a collapsed row is lower', () => {
      // The first row is collapsed to 2 grid rows, so row 3 is already the second row.
      const spans = [{ top: 0, height: 2 }, { top: 2, height: 4 }]
      expect(shape(dropInRows(rows, 'a', 0, 4, spans))).toEqual([[['b', 12]], [['a', 6], ['c', 6]]])
    })
  })

  describe('moving in reading order', () => {
    const rows = [[item('a', 0, 0, 8), item('b', 8, 0, 4)], [item('c', 0, 4, 12)]]

    it('trades places and widths with the next widget', () => {
      expect(shape(moveInRows(rows, 'a', 1)!)).toEqual([[['b', 8], ['a', 4]], [['c', 12]]])
      expect(shape(moveInRows(rows, 'b', 1)!)).toEqual([[['a', 8], ['c', 4]], [['b', 12]]])
    })

    it('does nothing at either end', () => {
      expect(moveInRows(rows, 'a', -1)).toBeNull()
      expect(moveInRows(rows, 'c', 1)).toBeNull()
      expect(moveInRows(rows, 'missing', 1)).toBeNull()
    })
  })

  describe('breakpoints', () => {
    const thresholds = { xs: 0, sm: 600, md: 840, lg: 1145, xl: 1545, xxl: 2138 }

    it('picks the breakpoint of the Overview\'s own width', () => {
      expect(overviewBreakpoint(400, thresholds)).toBe('sm')
      expect(overviewBreakpoint(927, thresholds)).toBe('md')
      expect(overviewBreakpoint(1545, thresholds)).toBe('xl')
    })

    it('takes a widget\'s width from its breakpoint or the nearest smaller one', () => {
      const columns = { md: 12, lg: 6, xxl: 4 }
      expect(columnsAt(columns, 'sm')).toBe(12)
      expect(columnsAt(columns, 'md')).toBe(12)
      expect(columnsAt(columns, 'xl')).toBe(6)
      expect(columnsAt(columns, 'xxl')).toBe(4)
      expect(columnsAt({ lg: 4 }, 'md', 8)).toBe(8)
      expect(columnsAt({ md: 1 }, 'md')).toBe(3)
    })

    it('reads a breakpoint\'s layout, or the one stored before there were breakpoints', () => {
      const legacy = [item('a', 0, 0, 6)]
      expect(itemsAt({ layouts: { lg: [] }, items: legacy }, 'lg')).toEqual([])
      expect(itemsAt({ layouts: { lg: [] }, items: legacy }, 'md')).toEqual(legacy)
    })
  })

  it('drops an invalid stored layout without invalidating the other preferences', () => {
    const parsed = preferencesSchema.parse({ theme: 'dark', overviews: { t1: { s1: { items: [{ i: 'a', x: 99 }] } } } })
    expect(parsed.theme).toBe('dark')
    expect(parsed.overviews).toEqual({ t1: {} })
    expect(defaultPreferences.overviews).toEqual({})
  })

  it('keeps the other shells when one stored layout no longer validates', () => {
    const valid = { layouts: { lg: [{ i: 'a', x: 0, y: 0, w: 6, h: 4 }] } }
    const parsed = preferencesSchema.parse({ overviews: { t1: { broken: { items: [{ i: 'a', x: 99 }] }, kept: valid }, t2: { other: {} } } })
    expect(Object.keys(parsed.overviews.t1!)).toEqual(['kept'])
    expect(parsed.overviews.t1!.kept!.layouts.lg![0]).toMatchObject({ i: 'a', fit: true, collapsed: false })
    expect(parsed.overviews.t2!.other).toEqual({ layouts: {}, items: [], hidden: [], pins: [] })
  })

  it('drops overviews that are not records at all', () => {
    expect(preferencesSchema.parse({ overviews: 'nonsense' }).overviews).toEqual({})
  })
})
