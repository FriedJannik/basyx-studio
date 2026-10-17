# 0032: Overview grid layout

- Status: Accepted
- Date: 2026-10-17
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
  Widgets move up into free space (vertical compaction), so no gaps are left.
- A widget is dragged by its header and resized from its lower right corner,
  both of which show while the pointer is over it. Its body scrolls when the
  widget is smaller than its content. Frames take no pointer events while a
  widget moves, so a drag over them is not lost.
- A view follows its content height until the user resizes it; *Fit to
  content* (or a double click on the corner) turns that back on. Widgets can
  be collapsed, hidden and shown again from the widget palette, which groups
  them by submodel. Every change on the Overview, including pinning and
  unpinning a live value, can be undone once; a value pinned in the details
  drawer is unpinned with the same button.
- Menus offer the same arrangement without a pointer: move earlier or later in
  reading order, and preset widths.
- Values (Property, Range, MultiLanguageProperty) can be pinned from the
  details drawer or the live values. A pinned value reads its element on its
  own and re-reads it while auto-refresh is on.
- The layout is stored per user, target and shell in the preferences
  (`overviews`), as `{ i, x, y, w, h }` items like the layout of view
  definitions, plus `fit` and `collapsed`, the hidden widgets and the pins.
  At most 30 shells are kept per target. A shell's stored value that no
  longer validates is dropped on its own, instead of invalidating the other
  shells' layouts or any other preference.
- Below the `md` breakpoint the widgets are shown one below the other in the
  grid's reading order, without dragging.
- App frames load only when their widget scrolls into sight.
- The library's styles are themed in `app/assets/styles/grid-layout.css`
  through its custom properties, the one stylesheet outside Vuetify's own.
  Besides them it only shows the resize corner while the pointer is over its
  widget. Radii are not set there, so the placeholder does not follow the
  *More rounded* shape; that shape is a defaults provider and has no CSS
  variable to read.

## Consequences

- A layout is per shell: two shells of the same type are arranged separately.
  Shared layouts belong to view definitions (ADR 0009).
- Layout logic that does not depend on the library (placement, reading order,
  row sizes, swapping on drop and from the menu) lives in `shared/overview.ts`
  and is unit-tested; `useOverviewGrid` connects it to the library.
- grid-layout-plus injects its styles at runtime; a Content Security Policy
  for Studio's own pages must allow inline styles, as Vuetify already does.
