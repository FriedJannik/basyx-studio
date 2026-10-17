import { describe, expect, it } from 'vitest'
import { defaultPreferences, preferencesSchema } from '#shared/contract'
import { freePosition, mergeOverviewLayout, overlapArea, overviewRows, readingOrder, swapInReadingOrder, swapOnDrop } from '#shared/overview'

describe('overview layout', () => {
  it('sizes rows to hold their content', () => {
    // A row is 16 px with a 16 px gap: n rows hold 32n - 16 px.
    expect(overviewRows(48)).toBe(2)
    expect(overviewRows(49)).toBe(3)
    expect(overviewRows(0)).toBe(2)
  })

  it('places a widget in the first free slot, row by row', () => {
    const layout = [{ i: 'a', x: 0, y: 0, w: 6, h: 4 }]
    expect(freePosition(layout, 6, 4)).toEqual({ x: 6, y: 0 })
    expect(freePosition([...layout, { i: 'b', x: 6, y: 0, w: 6, h: 2 }], 6, 2)).toEqual({ x: 6, y: 2 })
    expect(freePosition(layout, 12, 2)).toEqual({ x: 0, y: 4 })
  })

  it('keeps stored items, places new widgets and drops unknown ones', () => {
    const stored = [
      { i: 'a', x: 6, y: 0, w: 6, h: 4, fit: false, collapsed: false },
      { i: 'gone', x: 0, y: 0, w: 6, h: 4, fit: true, collapsed: false },
    ]
    const merged = mergeOverviewLayout([{ id: 'a', w: 6, h: 10 }, { id: 'b', w: 6, h: 3 }], stored)
    expect(merged).toEqual([
      stored[0],
      { i: 'b', x: 0, y: 0, w: 6, h: 3, fit: true, collapsed: false },
    ])
  })

  it('puts a new widget marked first at the top', () => {
    const merged = mergeOverviewLayout([{ id: 'a', w: 6, h: 4 }, { id: 'live', w: 12, h: 4, first: true }], [
      { i: 'a', x: 0, y: 0, w: 6, h: 4, fit: true, collapsed: false },
    ])
    expect(merged[1]).toMatchObject({ i: 'live', x: 0, y: 0 })
  })

  it('orders widgets row by row, left to right', () => {
    const order = readingOrder([
      { i: 'c', x: 0, y: 5, w: 6, h: 1 },
      { i: 'b', x: 6, y: 0, w: 6, h: 1 },
      { i: 'a', x: 0, y: 0, w: 6, h: 1 },
    ])
    expect(order.map(box => box.i)).toEqual(['a', 'b', 'c'])
  })

  it('drops an invalid stored layout without invalidating the other preferences', () => {
    const parsed = preferencesSchema.parse({ theme: 'dark', overviews: { t1: { s1: { items: [{ i: 'a', x: 99 }] } } } })
    expect(parsed.theme).toBe('dark')
    expect(parsed.overviews).toEqual({ t1: {} })
    expect(defaultPreferences.overviews).toEqual({})
  })

  it('keeps the other shells when one stored layout no longer validates', () => {
    const valid = { items: [{ i: 'a', x: 0, y: 0, w: 6, h: 4 }] }
    const parsed = preferencesSchema.parse({ overviews: { t1: { broken: { items: [{ i: 'a', x: 99 }] }, kept: valid }, t2: { other: {} } } })
    expect(Object.keys(parsed.overviews.t1!)).toEqual(['kept'])
    expect(parsed.overviews.t1!.kept!.items[0]).toMatchObject({ i: 'a', fit: true, collapsed: false })
    expect(parsed.overviews.t2!.other).toEqual({ items: [], hidden: [], pins: [] })
  })

  it('drops overviews that are not records at all', () => {
    expect(preferencesSchema.parse({ overviews: 'nonsense' }).overviews).toEqual({})
  })

  it('measures the overlap of two boxes', () => {
    expect(overlapArea({ i: 'a', x: 0, y: 0, w: 6, h: 4 }, { i: 'b', x: 4, y: 2, w: 6, h: 4 })).toBe(4)
    expect(overlapArea({ i: 'a', x: 0, y: 0, w: 6, h: 4 }, { i: 'b', x: 6, y: 0, w: 6, h: 4 })).toBe(0)
  })

  describe('swapping on drop', () => {
    const start = new Map([
      ['a', { i: 'a', x: 0, y: 0, w: 6, h: 4 }],
      ['b', { i: 'b', x: 6, y: 0, w: 6, h: 4 }],
      ['c', { i: 'c', x: 0, y: 4, w: 12, h: 4 }],
    ])

    it('trades places with the widget it was dropped on, and puts the others back', () => {
      // 'a' dropped over 'b'; the grid pushed 'c' down meanwhile.
      const boxes = [{ i: 'a', x: 6, y: 0, w: 6, h: 4 }, { i: 'b', x: 6, y: 4, w: 6, h: 4 }, { i: 'c', x: 0, y: 8, w: 12, h: 4 }]
      expect(swapOnDrop(boxes, 'a', start)).toEqual(new Map([
        ['b', { x: 0, y: 0 }],
        ['c', { x: 0, y: 4 }],
      ]))
    })

    it('keeps a wide widget inside the grid when it takes a place on the right', () => {
      const boxes = [{ i: 'b', x: 0, y: 4, w: 6, h: 4 }, { i: 'a', x: 6, y: 4, w: 6, h: 4 }, { i: 'c', x: 0, y: 0, w: 12, h: 4 }]
      expect(swapOnDrop(boxes, 'b', start)?.get('c')).toEqual({ x: 0, y: 0 })
    })

    it('leaves the grid alone when dropped into free space', () => {
      const boxes = [{ i: 'a', x: 0, y: 20, w: 6, h: 4 }, { i: 'b', x: 6, y: 0, w: 6, h: 4 }, { i: 'c', x: 0, y: 4, w: 12, h: 4 }]
      expect(swapOnDrop(boxes, 'a', start)).toBeNull()
    })

    it('ignores widgets without a start', () => {
      expect(swapOnDrop([{ i: 'x', x: 0, y: 0, w: 6, h: 4 }], 'x', start)).toBeNull()
    })
  })

  describe('swapping in reading order', () => {
    const boxes = [
      { i: 'b', x: 6, y: 0, w: 6, h: 4 },
      { i: 'a', x: 0, y: 0, w: 6, h: 4 },
      { i: 'c', x: 0, y: 4, w: 12, h: 4 },
    ]

    it('swaps with the next widget', () => {
      expect(swapInReadingOrder(boxes, 'a', 1)).toEqual(new Map([
        ['a', { x: 6, y: 0 }],
        ['b', { x: 0, y: 0 }],
      ]))
    })

    it('keeps a wide widget inside the grid', () => {
      expect(swapInReadingOrder(boxes, 'b', 1)).toEqual(new Map([
        ['b', { x: 0, y: 4 }],
        ['c', { x: 0, y: 0 }],
      ]))
    })

    it('does nothing at either end', () => {
      expect(swapInReadingOrder(boxes, 'a', -1)).toBeNull()
      expect(swapInReadingOrder(boxes, 'c', 1)).toBeNull()
      expect(swapInReadingOrder(boxes, 'missing', 1)).toBeNull()
    })
  })
})
