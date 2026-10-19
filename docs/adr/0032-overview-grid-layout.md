# 0032: Overview grid layout

- Status: Accepted
- Date: 2026-10-17; revised 2026-10-18 (rows, layouts per breakpoint, widget widths) and 2026-10-19 (4 px grid rows)
- Deciders: BaSyx Studio maintainers
- Requirements: PROD-004

## Context

A shell's *Overview* tab showed the views of installed apps in two columns of
a Vuetify grid. Each view is as tall as its content (`studio.ui.setHeight`), so
the tallest view of a row set the row's height and left empty space next to
smaller ones. Users want to arrange the widgets themselves, resize them, and
pin single values next to them.

ADR 0009 leaves the layout and drag-and-drop library as an implementation
choice. Graphical view definitions (docs/architecture/views-and-dashboards.md)
will need the same kind of grid later.

## Decision

- The Overview is a 12-column grid built on **grid-layout-plus** (MIT, Vue 3
  native, its only dependencies are interactjs and two small helper packages).
- The grid is a stack of **rows**, so it looks even at every width. The
  widgets of a row sit side by side, share one height and together fill the
  12 columns; a row holds at most four widgets (three columns each at least).
  Rows are derived from the stored items after every change and laid out
  again: a row's height is the height the user gave it, or, while its widgets
  follow their content, the tallest content.
- A widget is dragged by its header and resized from its lower right corner,
  both of which show while the pointer is over it; the library offers no
  other corner, and with rows stacked from the top a top or left edge would
  only move the row. Resizing a widget's width lets the other widgets of its
  row share what is left, and moves those that no longer fit into a row below;
  resizing its height sets the whole row's height. A widget dropped over a
  row joins it where the pointer is, and the row's widgets share its width
  evenly; a full row gets a new row below it, and a drop below all rows gives
  the widget a row of its own. Its body scrolls when the widget is smaller
  than its content. Frames take no pointer events while a widget moves, so a
  drag over them is not lost.
- A row follows its content height until the user resizes it; *Fit to
  content* (or a double click on the corner) turns that back on. Grid rows
  are 4 px with no gap between them; each widget keeps the 16 px gap below
  it inside its grid item. A widget that follows its content therefore ends
  within 4 px of it, where 16 px rows with 16 px gaps left up to 31 px empty.
  Layouts stored with the old rows (no `rowStep`) are converted when read,
  so every widget keeps its height in pixels. Widgets can
  be collapsed (a row whose widgets are all collapsed shrinks to their
  headers), hidden and shown again from the widget palette, a compact menu
  that lists each widget with the title and subtitle of its header. Every
  change on the Overview, including pinning and unpinning a live value, can be
  undone once; a value pinned in the details drawer is unpinned with the same
  button.
- Menus offer the same arrangement without a pointer: move earlier or later in
  reading order (trading place and width with the neighbour), and preset
  widths.
- The Overview keeps **one layout per breakpoint** of its own width, with
  Vuetify's thresholds (`sm` to `xxl`), so open drawers count as much as the
  window. A breakpoint the user has not arranged starts from the widgets'
  default widths for it: an app declares them per breakpoint in its manifest
  (`columns`, as `v-col` does), live values span the row and pinned values
  start at a quarter to half of it. Widgets are filled into rows in order, and
  each row is widened to the 12 columns.
- Values (Property, Range, MultiLanguageProperty) can be pinned from the
  details drawer or the live values. A pinned value reads its element on its
  own and re-reads it while auto-refresh is on.
- The layout is stored per user, target, shell and breakpoint in the
  preferences (`overviews`, `layouts`), as `{ i, x, y, w, h }` items like the
  layout of view definitions, plus `fit` and `collapsed`, the hidden widgets
  and the pins. A layout stored before there was one per breakpoint (`items`)
  is used for every breakpoint without its own.
  At most 30 shells are kept per target. A shell's stored value that no
  longer validates is dropped on its own, instead of invalidating the other
  shells' layouts or any other preference.
- Below the window's `md` breakpoint (phones) the widgets are shown one
  below the other in the grid's reading order, without dragging.
- App frames load only when their widget scrolls into sight. Apps render
  their views flat: the widget draws the border, the radius and the title.
- The library's styles are themed in `app/assets/styles/grid-layout.css`
  through its custom properties, the one stylesheet outside Vuetify's own.
  Besides them it shows the resize corner while the pointer is over its
  widget, rounds the corner and the drop placeholder like the widgets' cards,
  and cancels the grid's outer gap. The *More rounded* shape is a defaults
  provider with no CSS variable, so the Overview sets a class for it and the
  stylesheet maps it to the cards' radius.

## Consequences

- A layout is per shell: two shells of the same type are arranged separately.
  Shared layouts belong to view definitions (ADR 0009).
- Layout logic that does not depend on the library (rows, widths that fill a
  row, row heights, resizing, dropping and moving in reading order, widths and
  breakpoints) lives in `shared/overview.ts` and is unit-tested;
  `useOverviewGrid` connects it to the library.
- Free placement is gone: a widget cannot leave space beside it in a row.
  Arranging is coarser, but every layout is even at every width.
- A layout arranged on a wide screen does not shrink onto a narrow one; each
  breakpoint is arranged on its own, so a user may arrange the same Overview
  more than once.
- grid-layout-plus injects its styles at runtime; a Content Security Policy
  for Studio's own pages must allow inline styles, as Vuetify already does.
