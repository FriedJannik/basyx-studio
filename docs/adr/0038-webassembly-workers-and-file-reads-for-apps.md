# 0038: WebAssembly, workers and file reads for app frames

- Status: Proposed
- Date: 2026-10-18; revised 2026-10-19 (external files)
- Deciders: BaSyx Studio maintainers
- Requirements: APP-006, APP-007, APP-010, APP-011

## Context

The bundled *3D Models* app shows the 3D models of an asset (IDTA 02026,
Provision of 3D Models), as the BaSyx AAS Web UI does. It needs the content
of a File element, and it reads IFC and STEP with parsers compiled to
WebAssembly ([ADR 0039](0039-3d-viewer-libraries.md)), which should run in a
worker so a large model does not freeze the page.

An app frame cannot do any of this today
([ADR 0017](0017-app-origin-and-content-security-policy.md)): it may not call
Studio's API, `studio.ui.openFile` only opens a file in a new tab, and its
Content Security Policy allows neither WebAssembly (`'wasm-unsafe-eval'`) nor
workers (`worker-src 'none'`).

## Decision

- **`studio.ui.readFile(submodelId, idShortPath)`** returns a File element's
  content (`{ bytes, contentType }`) to the app. Like `studio.ui.openFile`, it
  needs `studio.aas.read`, Studio authorizes it at `/app-calls`, and Studio's
  page carries it out: it loads the file through Studio's API (so the user's
  own rights apply) and transfers the bytes to the frame. Files above 200 MiB
  are refused. Backend apps cannot call it, as other `studio.ui.*` methods.
- `studio.ui.openFullscreen` takes an optional `state` string, which the
  full-screen frame receives as `context.viewState`: it is a new frame, and
  without it a view could not show the model the user had selected.
- The Studio app API version becomes 0.1.1.
- A manifest may declare **`sandbox: { webAssembly, workers }`**. Only for
  that installation, the policy of its files adds `'wasm-unsafe-eval'` to
  `script-src`, and `worker-src blob:` instead of `'none'`. Workers start
  from `blob:` URLs because a frame's origin is opaque; they inherit the
  frame's policy, so they load and fetch only the app's own files. The Apps
  page lists both for every installation that declares them.
- **`studio.ui.readExternalFile(submodelId, idShortPath)`** returns a file
  that an element names by an http(s) address at another host, e.g. a 3D
  model of IDTA 02026 kept only as an `ExternalFile`. The element is a File
  whose value is such an address, or a Property holding one (`ExternalUrl`).
  Studio's page reads the element itself, through Studio's API as the user,
  so the app names an element, never an address. It fetches the file as
  Studio's own viewers do: without credentials or referrer, up to 200 MiB,
  and only if the host allows it (CORS). A host that does not hand out the
  file is reported as `external_file_unavailable`. The method needs its own
  permission, `studio.ui.externalFiles`, which the install dialog and the
  *Apps* page show: the user's browser contacts that host. The Studio app
  API version becomes 0.1.2.
- Everything else of ADR 0017 stays: no network beyond the app's files, no
  frames, no storage, the same sandbox.

## Consequences

- WebAssembly runs only code the app ships in its reviewed package; it gains
  no access a script would not have. `'wasm-unsafe-eval'` does not allow
  `eval` of JavaScript.
- A file read moves its bytes into the frame, which can then show or
  process them but send them nowhere; the frame's `connect-src` is still the
  app's own files.
- An app that uses `readFile` declares `studioApi: "^0.1.1"`, so an older
  Studio refuses to install it instead of failing at runtime; one that uses
  `readExternalFile` declares `"^0.1.2"`.
- External files reach an app only from addresses that AAS content holds, as
  in Studio's own viewers, and the app's CSP stays closed: the frame still
  contacts no host. The browser cannot read a file from a host that does not
  allow cross-origin reads (CORS); Studio's server then fetches it for the
  origins the deployment lists
  ([ADR 0042](0042-external-files-through-studio.md)), and otherwise the 3D
  Models app shows the preview image and the link.
- The hostile probe app checks that WebAssembly and `blob:` workers stay
  blocked for an app that does not declare them.

## Alternatives considered

- **A Studio-rendered viewer the app asks for (`studio.ui.showModel`):** no
  new sandbox rights, but the app could not lay out the viewer next to its
  own content as the Web UI does, and every new viewer would be Studio API.
- **Files as base64 from the server (`studio.aas.readFile`):** usable by
  backend apps too, but a third larger and parsed as JSON on both ends;
  can be added later if a backend app needs file contents.
- **Parsing on the frame's main thread:** no `worker-src`, but large IFC
  and STEP files would freeze the app (and with it the details pane) for
  seconds. The viewer still falls back to it where no worker starts.
