# 0034: Vue Flow for the graph of the BOM viewer

- Status: Accepted
- Date: 2026-10-17
- Deciders: BaSyx Studio maintainers
- Requirements: PROD-001, APP-012, ARCH-002, ARCH-003

## Context

The bundled *Bill of Material* app shows the Hierarchical Structures
enabling Bills of Material (IDTA 02011) of an asset, as the BaSyx AAS Web UI
does. A tree (Vuetify's `v-treeview`) shows the structure, but not how parts
relate across levels at a glance; a graph does. Vuetify has no graph
component, and drawing, panning and zooming a node graph by hand would be
several hundred lines of pointer and layout code to maintain.

The dependency belongs to one bundled app, not to Studio: it is built into
the app's own bundle and runs only in the app's sandboxed frame
([ADR 0017](0017-app-origin-and-content-security-policy.md)). It still enters
Studio's lockfile and supply chain ([ADR 0010](0010-pnpm-only-supply-chain.md)).

## Decision

- The BOM viewer draws its graph with **Vue Flow** (`@vue-flow/core` and
  `@vue-flow/background`, MIT, Vue 3 native). Its runtime
  dependencies are `@vueuse/core` and four small d3 modules (`d3-drag`,
  `d3-interpolate`, `d3-selection`, `d3-zoom`); Vue is a peer.
- Nodes are Vuetify cards in Vue Flow's node slot, so the graph follows
  Studio's theme; the app places nodes itself (a top-down tree layout), so no
  layout library is added.
- `vue-demi`, a transitive dependency, may not run its install script
  (`pnpm-workspace.yaml`, `allowBuilds`): the script only switches its shim
  between Vue 2 and 3, and the published files already target Vue 3.
- Vue Flow brings its own stylesheet, imported by the app; Studio's rule of
  no custom CSS applies to the app's own code.

## Consequences

- The tree stays available next to the graph, for keyboard use and screen
  readers; the graph adds zoom and fit controls with accessible names.
- Vue Flow updates arrive through Dependabot like other app dependencies and
  are checked with the app's build and type check.
- Graphical view definitions ([ADR 0009](0009-declarative-graphical-views.md))
  may later need a graph widget; adopting Vue Flow there would be a decision
  of its own, as it would then run in Studio's renderer.

## Alternatives considered

- **A hand-written SVG graph:** no dependency, but pan, zoom, fitting and hit
  testing would be maintained code with no other use.
- **Cytoscape.js:** a larger, framework-agnostic library with its own
  rendering; nodes could not be Vuetify components.
- **Only the tree:** no overview of how parts relate across levels.
