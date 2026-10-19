# @basyx/studio-sdk

Build apps for [BaSyx Studio](../../README.md): submodel views, modules and
backends that Studio installs at runtime and runs isolated from itself
([ADR 0004](../../docs/adr/0004-runtime-installable-apps.md)).

An app is a static web UI (any framework) plus an optional Deno backend,
packaged as a `.zip` with a `studio-app.json` manifest at its root. Studio runs
the UI in a sandboxed frame on a separate origin. The app reaches AAS data and
Studio functions only through this SDK, and only with the permissions it
declares, limited by the signed-in user's own rights.

## Manifest

```json
{
  "$schema": "https://eclipse.dev/basyx/studio/schemas/app-manifest-0.json",
  "manifestVersion": 0,
  "id": "org.example.nameplate",
  "version": "1.0.0",
  "publisher": { "name": "Example Inc." },
  "title": { "en": "Nameplate" },
  "studioApi": "^0.1.0",
  "runtimes": ["hosted", "desktop"],
  "permissions": ["studio.aas.read"],
  "contributes": {
    "submodelViews": [{
      "id": "nameplate",
      "title": { "en": "Nameplate" },
      "entry": "ui/index.html",
      "semanticIds": ["https://admin-shell.io/idta/nameplate/3/0/Nameplate"],
      "columns": { "md": 12, "lg": 6, "xxl": 4 }
    }]
  }
}
```

The schema is [`app-manifest.schema.json`](app-manifest.schema.json).

| Contribution | Offered | Context |
| --- | --- | --- |
| `submodelViews` | On a shell's *Overview* tab and in the details drawer's *Visualization* mode, for submodels whose semantic ID equals one of `semanticIds` | target, shell, submodel |
| `modules` with `context: global` | Always, in the navigation rail, at `/apps/<installation>/<route>` | — |
| `modules` with `context: target` | While a target is open, at `/targets/<target>/apps/<installation>/<route>` | target |
| `modules` with `context: shell` | While a shell is open | target, shell |

| Permission | Allows |
| --- | --- |
| `studio.aas.read` | `aas.listShells`, `getShell`, `listSubmodels`, `getSubmodel`, `getElement` on the active target; `ui.openFile` and `ui.readFile` for its File elements |
| `studio.aas.write` | `aas.setElementValue` (Property and MultiLanguageProperty values, with the revision read before) |
| `studio.ui.notifications` | `ui.notify` |
| `studio.ui.navigation` | `ui.navigate`: change the module's own sub-path (nested routes) |
| `studio.backend` | `backend.call`: call the app's own Deno backend |
| `studio.ui.externalFiles` | `ui.readExternalFile`: files that elements name at other hosts, fetched by Studio's page; those hosts see the user's address |
| `studio.timeseries.read` | `timeseries.read`: read a segment of an IDTA Time Series Data submodel of the active target, including LinkedSegments in a database that the infrastructure's connections reach (ADR 0040). Reserved for the apps shipped with Studio; Studio app API 0.1.2 |

## UI

```ts
import { applyTheme, connect, StudioError } from '@basyx/studio-sdk'

const studio = await connect()
applyTheme(studio.context.theme) // --studio-color-primary, …
studio.onContext(context => applyTheme(context.theme))

const submodel = await studio.aas.getSubmodel(studio.context.submodel!.id)

const element = await studio.aas.getElement(studio.context.submodel!.id, 'SerialNumber')
try {
  await studio.aas.setElementValue({ submodelId: studio.context.submodel!.id, idShortPath: 'SerialNumber', value: 'SN-2', revision: element.revision })
} catch (error) {
  if (error instanceof StudioError && error.code === 'revision_conflict') {
    // someone else changed it: read again
  }
}
```

Build the UI with relative URLs (Vite: `base: './'`); it is served under
`/app/<installation>/`. The frame cannot use cookies, storage, popups, forms or
network requests outside its own package. Without forms, handle buttons with
click handlers instead of `submit` events.

`studio.context.mode` is Studio's mode, `view` or `edit`. Show edit controls
only in `edit`, as Studio does; `onContext` reports when the user switches.
Views on the overview are sized to their content (`fitHeight`), so edit in
place rather than in dialogs. Measure the content itself: a root that is at
least as tall as the frame (Vuetify's `v-app`, `min-height: 100vh`) lets the
frame grow but never shrink. Studio draws the view's card, border and title,
so render the view flat, without a title of its own and with a transparent
background.

To show a File element's content in the app, e.g. an image or a 3D model,
read it with `ui.readFile(submodelId, idShortPath)` (Studio app API 0.1.1,
so declare `"studioApi": "^0.1.1"`): Studio's page loads it with the user's
rights and hands the bytes (`Uint8Array`, up to 200 MiB) and media type to
the frame. `ui.openFile` opens it in a new tab instead.

A file that an element names by an http(s) address at another host (a File
whose value is such an address, or a Property such as IDTA 02026's
`ExternalUrl`) is read with `ui.readExternalFile(submodelId, idShortPath)`
(permission `studio.ui.externalFiles`, Studio app API 0.1.2). Studio reads
the address from the element itself and fetches the file in the user's
browser without credentials or referrer; the host must allow it (CORS).
Otherwise the call fails with `external_file_unavailable`.

`ui.openFullscreen(state?)` opens the view again in a full-screen dialog,
as a new frame. Pass what the user has selected as `state` (a string, up to
4,000 characters, e.g. JSON); the view there reads it from
`context.viewState` and `context.fullscreen` is `true` (Studio app API
0.1.1).

An app that parses files with WebAssembly, or off the page in a worker,
declares it in the manifest ([ADR 0038](../../docs/adr/0038-webassembly-workers-and-file-reads-for-apps.md)):

```json
"sandbox": { "webAssembly": true, "workers": true }
```

`webAssembly` allows compiling WebAssembly (`'wasm-unsafe-eval'`, not
JavaScript `eval`); `workers` allows dedicated workers started from `blob:`
URLs, since the frame's origin is opaque: create a `blob:` module that
imports the bundled worker script by its absolute URL. Both still load and
fetch only the app's own files, and the Apps page shows them.

`columns` gives the view's default width as a widget on a shell's Overview,
in columns of 12, per breakpoint of the Overview's width (Vuetify's names, as
in `v-col`): a breakpoint without a value uses the nearest smaller one, and
without any the view starts full width, half wide from `lg`. Widgets in a
row share its width and height, so the widths are a starting point; users
arrange each breakpoint themselves.

## Backend

Declare `"backend": { "runtime": "deno", "entry": "backend/main.js" }` and the
`studio.backend` permission. Export one function per method:

```js
/** @type {import('@basyx/studio-sdk/backend').BackendHandler} */
export async function summarize (params, { studio }) {
  const page = await studio.call('studio.aas.listShells', { limit: 100 })
  return { shells: page.items.length }
}
```

The UI calls it with `studio.backend.call('summarize', params)`. The backend
runs in Deno with no file, environment, subprocess or network access other
than Studio's capability endpoint, with the rights of the user who made the
call.

## Examples

See [`examples/apps`](../../examples/apps).

## Desktop container capability

`studio.containers` is reserved for bundled desktop apps. Uploaded apps
requesting it are rejected; backend apps cannot call these methods. The
service uses a fixed BaSyx catalogue and local Docker/Podman sockets.

- Engines: `listEngines()`, `selectEngine(host | null)` (Unix socket or Windows pipe).
- Planning and lifecycle: `listStacks()`, `getStack(id)`, `planStack(spec, id?)`,
  `createStack({ spec, aasxFiles?, importId? })`, `changeStack({ stackId, spec, aasxFiles? })`,
  `startStack(id)`, `stopStack(id)`, `updateStack(id)`, `removeStack({ stackId, deleteData, removeInfrastructure })`.
- Progress and inspection: `getJob(id)`, `getLogs(id, component, tail?)`,
  `saveLogs(id, component)`, `getSignIn(id)`. Sign-in details contain passwords.
- Files: `pickFiles(kind, suggestedName?)` and its shortcut `pickAasxFiles()`;
  `exportStack(id, suggestedName?)`, `importStack()` and `saveLogs(id, component)`
  first pick a file, then call the method with its handle. Studio authorizes
  every pick before the host opens a native dialog; the app only receives
  single-use handles, which expire after five minutes. Cancelling returns `null`.

Mutations return jobs; poll `getJob` until it succeeds or fails. Export
includes current database data, generated credentials and exact image digests.
Show a password/data warning before calling it. Imports restore the database
before service startup; edited compose files are ignored. A bare JSON spec
imports settings without data. Keeping data on removal retains a recoverable
entry and its encrypted credentials.

Calls travel through `/app-calls`, never directly to the engine.
`ui.openTarget(id)` and `ui.openExternal(url)` require `studio.ui.navigation`;
`openExternal` accepts https, and http only to this computer.
`ui.copyText(text)` requires `studio.ui.clipboard`. Both `openExternal` and
`copyText` must be called from a click (or key press) in the app: the host
refuses them without a recent user activation. `presetSpec(preset, name)`
returns the defaults the wizard starts from.
