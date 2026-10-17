import type { GridBox, GridPositions, OverviewItem, OverviewSnapshot, OverviewWidgetSize } from '#shared/overview'
import type { Ref } from 'vue'
import { mergeOverviewLayout, overviewColumns, overviewGap, overviewHeaderHeight, overviewRowHeight, overviewRows, readingOrder, swapInReadingOrder, swapOnDrop } from '#shared/overview'

/** A widget's place on the grid; the grid library moves and resizes these objects. */
export interface OverviewBox extends GridBox {
  /** Rows when expanded (`h` is the header's rows while collapsed). */
  rows: number
  fit: boolean
  collapsed: boolean
}

/** The rows a collapsed widget keeps: its header. */
export const collapsedRows = overviewRows(overviewHeaderHeight - 1)

type ShellOverview = ReturnType<typeof useShellOverview>

/**
 * The arrangement of a shell's Overview (ADR 0032): the grid's boxes built
 * from the stored layout, drags and resizes, the menu actions that arrange
 * without a pointer, views that follow their content height, and the one
 * undo of every change. The placement rules themselves are in
 * `shared/overview.ts`.
 */
export function useOverviewGrid (options: {
  overview: ShellOverview
  /** The widgets shown, in their default order, with the size they start with. */
  widgets: () => OverviewWidgetSize[]
  /** The grid component, to make it place its items again. */
  container: Readonly<Ref<{ layoutUpdate?: () => void } | null>>
}) {
  const { t } = useI18n()
  const { overview } = options

  // The grid's boxes, rebuilt from the stored layout whenever it or the
  // widgets change. Boxes are kept by ID, so frames are never re-created.
  const grid = ref<OverviewBox[]>([])
  const moving = ref(false)
  watch([options.widgets, () => overview.layout.value.items, moving], () => {
    // Not while a widget is dragged; its drop saves the grid, which rebuilds it.
    if (moving.value) {
      return
    }
    const existing = new Map(grid.value.map(box => [box.i, box]))
    grid.value = mergeOverviewLayout(options.widgets(), overview.layout.value.items).map(item => Object.assign(existing.get(item.i) ?? { i: item.i }, {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.collapsed ? collapsedRows : item.h,
      rows: item.h,
      fit: item.fit,
      collapsed: item.collapsed,
    }) as OverviewBox)
  }, { immediate: true })

  /** The grid knows its width and has placed the widgets. */
  const ready = ref(false)
  // The negative margin cancels the grid's outer gap, so widgets line up with the page.
  const gridProps = computed(() => ({
    class: 'ma-n4',
    onLayoutReady: () => (ready.value = true),
    // Emitted when a drag or resize ends (and when the grid compacts).
    onLayoutUpdated: () => endGesture(),
    layout: grid.value,
    colNum: overviewColumns,
    rowHeight: overviewRowHeight,
    margin: [overviewGap, overviewGap],
    useStyleCursor: false,
  }))

  /** The props of a widget's grid item. */
  function itemProps (box: OverviewBox) {
    return {
      i: box.i,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      minW: 2,
      minH: collapsedRows,
      isResizable: !box.collapsed,
      dragAllowFrom: '.overview-handle',
      onMove: () => startGesture('move', box.i),
      onResize: () => startGesture('resize', box.i),
      onDblclick: (event: MouseEvent) => {
        if ((event.target as HTMLElement | null)?.classList.contains('vgl-item__resizer')) {
          fitToContent(box)
        }
      },
    }
  }

  function relayout () {
    options.container.value?.layoutUpdate?.()
  }

  function place (positions: GridPositions) {
    for (const box of grid.value) {
      const position = positions.get(box.i)
      if (position) {
        Object.assign(box, position)
      }
    }
  }

  function toItem (box: OverviewBox): OverviewItem {
    return { i: box.i, x: box.x, y: box.y, w: box.w, h: box.collapsed ? box.rows : box.h, fit: box.fit, collapsed: box.collapsed }
  }

  /** Stores the grid; stored items of widgets not shown now (hidden, or not loaded) are kept. */
  function save () {
    const shown = new Set(grid.value.map(box => box.i))
    const others = overview.layout.value.items.filter(item => !shown.has(item.i))
    return overview.saveItems([...grid.value.map(box => toItem(box)), ...others].slice(0, 100))
  }

  // Every change of the Overview can be undone once.
  const undo = ref<{ text: string, snapshot: OverviewSnapshot } | null>(null)
  const undoOpen = ref(false)
  /** Offers to put back what `before` holds. */
  function offerUndo (text: string, before: OverviewSnapshot) {
    undo.value = { text, snapshot: before }
    undoOpen.value = true
  }
  /** Saves a change of the grid and offers to undo it. */
  function commit (text: string, before = overview.snapshot()) {
    offerUndo(text, before)
    return save()
  }
  function restoreUndo () {
    if (undo.value) {
      void overview.restore(undo.value.snapshot)
    }
    undo.value = null
    undoOpen.value = false
  }

  // A drag or resize in progress: the widget and where every widget started.
  let gesture: { kind: 'move' | 'resize', id: string, start: Map<string, GridBox>, before: OverviewSnapshot } | null = null
  function startGesture (kind: 'move' | 'resize', id: string) {
    if (!gesture) {
      gesture = { kind, id, start: new Map(grid.value.map(box => [box.i, { i: box.i, x: box.x, y: box.y, w: box.w, h: box.h }])), before: overview.snapshot() }
    }
    moving.value = true
  }

  function endGesture () {
    if (!gesture) {
      return
    }
    const { kind, id, start, before } = gesture
    gesture = null
    const box = grid.value.find(entry => entry.i === id)
    const changed = grid.value.some(entry => {
      const from = start.get(entry.i)
      return !from || from.x !== entry.x || from.y !== entry.y || from.w !== entry.w || from.h !== entry.h
    })
    if (box && changed) {
      if (kind === 'resize') {
        box.fit = false
        box.rows = box.h
      } else {
        const swapped = swapOnDrop(grid.value, id, start)
        if (swapped) {
          place(swapped)
          relayout()
        }
      }
      void commit(kind === 'resize' ? t('overview.resized') : t('overview.moved'), before)
    }
    // After saving: the rebuild this allows reads the saved layout.
    moving.value = false
  }

  // Heights the views reported (`studio.ui.setHeight`), by widget ID.
  const contentHeights = new Map<string, number>()
  /** Rows that hold a view's content, or `null` while it has not reported its height. */
  function contentRows (box: OverviewBox): number | null {
    const height = contentHeights.get(box.i)
    return height === undefined ? null : overviewRows(height + overviewHeaderHeight)
  }

  function fitToContent (box: OverviewBox) {
    const before = overview.snapshot()
    box.fit = true
    box.collapsed = false
    box.rows = contentRows(box) ?? box.rows
    box.h = box.rows
    relayout()
    void commit(t('overview.fitted'), before)
  }

  // A view that follows its content grows and shrinks with it. The new
  // height is stored only if the user arranged this Overview already.
  let fitTimer: ReturnType<typeof setTimeout> | undefined
  function onContentHeight (box: OverviewBox, height: number) {
    contentHeights.set(box.i, height)
    const rows = contentRows(box)
    if (!box.fit || rows === null || rows === box.rows) {
      return
    }
    box.rows = rows
    if (!box.collapsed) {
      box.h = rows
      relayout()
    }
    if (overview.layout.value.items.length > 0) {
      clearTimeout(fitTimer)
      fitTimer = setTimeout(() => void save(), 1000)
    }
  }
  onBeforeUnmount(() => clearTimeout(fitTimer))

  function toggleCollapsed (box: OverviewBox) {
    const before = overview.snapshot()
    box.collapsed = !box.collapsed
    box.h = box.collapsed ? collapsedRows : box.rows
    relayout()
    void commit(box.collapsed ? t('overview.collapsed') : t('overview.expanded'), before)
  }

  function setWidth (box: OverviewBox, columns: number) {
    const before = overview.snapshot()
    box.w = columns
    box.x = Math.min(box.x, overviewColumns - columns)
    relayout()
    void commit(t('overview.resized'), before)
  }

  /** Swaps a widget with the one before or after it in reading order (the keyboard way to arrange them). */
  function move (box: OverviewBox, step: -1 | 1) {
    const swapped = swapInReadingOrder(grid.value, box.i, step)
    if (!swapped) {
      return
    }
    const before = overview.snapshot()
    place(swapped)
    relayout()
    void commit(t('overview.moved'), before)
  }

  const order = computed(() => readingOrder(grid.value))

  return {
    grid,
    order,
    moving,
    ready,
    gridProps,
    itemProps,
    undo,
    undoOpen,
    offerUndo,
    restoreUndo,
    fitToContent,
    onContentHeight,
    toggleCollapsed,
    setWidth,
    move,
  }
}
