# 0039: three.js, web-ifc and OpenCascade for the 3D view

- Status: Proposed
- Date: 2026-10-18
- Deciders: BaSyx Studio maintainers
- Requirements: PROD-001, ARCH-002, ARCH-003, ARCH-005

## Context

The BaSyx AAS Web UI shows 3D models of File elements (STL, OBJ, glTF) with
three.js, and IFC with That Open's components and web-ifc. Studio should show
the same files, plus STEP, the common CAD exchange format, in the details
pane's Visualization tab and in the bundled *3D Models* app (IDTA 02026,
[ADR 0038](0038-webassembly-workers-and-file-reads-for-apps.md)).

Reading these formats by hand is not an option: IFC and STEP describe
geometry as boundary representations and swept solids, which take a
geometry kernel to turn into triangles.

## Decision

- One workspace package, **`@basyx/model-viewer`** (`packages/model-viewer`),
  holds the viewer for Studio and the app: format detection (without
  three.js, so Studio can decide whether to offer the view), the viewer, a
  parser worker, and a Vue composable. Each consumer draws its own Vuetify
  controls around it.
- **three.js** (MIT) renders, with its loaders for STL, OBJ and glTF (and
  Draco and meshopt compression), as the Web UI does.
- **web-ifc** (MPL-2.0, That Open) reads IFC directly; the viewer turns its
  triangles into three.js meshes and reads an element's property sets when
  it is picked. That Open's component, fragment and UI libraries are not
  used: they bring web components and their own UI, which the Vuetify-only
  UI rule excludes, and much more code than geometry and properties need.
- **occt-import-js** (LGPL-2.1; OpenCascade compiled to WebAssembly) reads
  STEP. It is used unmodified and loaded as a separate module and
  WebAssembly file, so it can be replaced on its own.
- IFC and STEP are parsed in a module worker; the parsers, their
  WebAssembly (about 1.6 MB and 7.6 MB) and three.js's loaders load only when
  a model of their format is shown.

## Consequences

- Studio's bundle and the app's package each carry the libraries (built into
  separate bundles): about 22 MB of Studio's public assets, with their
  precompressed copies, and a 7.5 MB app package. A browser downloads only
  what the model it shows needs, e.g. about 2.3 MB (Brotli) for STEP.
- The libraries need Eclipse IP review (dash-licenses could not verify any of
  them automatically); occt-import-js, as LGPL-2.1, needs the closest look.
- Formats the libraries cannot read (JT, native CAD formats) still download.
- occt-import-js is built with Emscripten's embind, which creates its
  function wrappers with `new Function(...)`. App frames forbid that (no
  `'unsafe-eval'`, ADR 0017), so the apps' build replaces those wrappers with
  the closures Emscripten uses when built with `DYNAMIC_EXECUTION=0`
  (`apps/shared/vite.ts`); a unit test reads STEP in a context without code
  generation from strings. web-ifc needs no such change.

## Alternatives considered

- **That Open components (`@thatopen/components`, `-front`, `ui`, `ui-obc`)
  as in the Web UI:** a property table and view cube out of the box, but web
  components outside Vuetify and several megabytes more.
- **Converting IFC and STEP on the server:** no WebAssembly in the browser,
  but a native geometry kernel in the Studio Service and the desktop app,
  and the file would leave the user's session for processing.
- **STL, OBJ and glTF only:** much smaller, but no CAD or BIM models, which
  are what Models3D submodels typically carry.
