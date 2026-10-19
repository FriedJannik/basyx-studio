# MVP-7 plan: standalone app products

- Status: Proposed
- Date: 2026-10-19
- Depends on:
  - the app platform of [MVP-3](mvp-3-plan.md) (implemented);
  - the editor's write model from [MVP-5](mvp-5-plan.md) (implemented);
  - branding and switches of the [deployment plan](deployment-plan.md)
    (implemented);
  - declared infrastructures
    ([ADR 0037](../adr/0037-declared-infrastructures-export-and-import.md));
  - WebAssembly, workers and file reads for app frames
    ([ADR 0038](../adr/0038-webassembly-workers-and-file-reads-for-apps.md));
  - phase B of the [time series plan](time-series-plan.md), which introduces
    connections on infrastructures.
- Scope decision gate:
  - a product built as a Studio app runs in two ways: inside a full Studio, or
    as its own branded web application;
  - in both cases the Studio Service is the backend, so no credential reaches
    the browser;
  - hosted deployments only; desktop comes later.
- Requirements: APP-017 to APP-021, SAP-001 to SAP-006, CON-001 to CON-003
  and CON-005 to CON-007 ([requirements](../requirements.md))

## Goal

Today, a team building an AAS-based application writes the same plumbing
every time:

- sign-in and token refresh;
- configuration for a dozen service URLs;
- registry and discovery lookup;
- sharing and access checks;
- file handling;
- the clients for its own services.

The app usually also keeps tokens in the browser. With MVP-7 such a team builds
its product as a Studio app and gets all of this from Studio. It ships the
product in two forms:

- as an app in any Studio;
- as a single-app deployment: Studio under the product's name, logo and colours,
  showing only that app.

> an operator writes a Compose file:
>
> - Studio image, `STUDIO_PRODUCT_NAME=Fleet Atlas`, a logo;
> - `STUDIO_APP_PACKAGES=/opt/apps/fleet-atlas.zip`, `STUDIO_APP=org.example.fleet-atlas`;
> - one declared infrastructure, with a connection to the product's own import
>   service.
>
> → users open `https://atlas.example.org` and sign in on a page with the
> product's logo → the app fills the window under a slim bar (logo, product
> name, edit switch, user menu) → `https://atlas.example.org/lines/press-3` is
> a deep link into the app that survives reload and back → the app creates
> shells, uploads attachments, runs queries and calls the import service. It
> never sees a token or a service URL.

## Starting point

- **Apps:** sandboxed iframes on a separate apps origin, with a CSP that
  allows the app's own files only. Calls go through the MessagePort bridge to
  `POST /app-calls`. There, Studio checks each call against the installed
  manifest and runs it as the signed-in user (ADR 0017, ADR 0018).
- **Modules:**
  - modules have `route` and `context` (`global`, `target`, `shell`);
  - the module's sub-path is in `AppContext.subPath`, and changes arrive with
    every context update;
  - `studio.ui.navigate({subPath})` changes it.

  Deep links inside a module work today under
  `/targets/{id}/apps/{installation}/{route}/…`.
- **Capabilities:** `studio.aas.*` offers reads and `setElementValue` only.
  `studio.ui.readFile` returns a File element's content to the frame (up to
  200 MiB, ADR 0038). There are no structural writes, attachment uploads,
  queries, lookups or sharing. The manifest's `sandbox` already allows
  WebAssembly and `blob:` workers (ADR 0038); the app API is at 0.1.1.
  There is no network capability, and backend apps have no network.
- **Installation:**
  - admins install packages in the UI;
  - bundled apps are installed from server assets by digest at startup;
  - nothing installs operator-provided packages declaratively.
- **Branding:** `STUDIO_PRODUCT_NAME`, logos, primary colour, legal links,
  `STUDIO_READ_ONLY` and `STUDIO_ALLOW_UPLOADS` exist. The Studio frame
  (navigation drawer, target pages, palette) is always shown.
- **SDK:** `connect()` rejects outside an iframe. `StudioClient` is bound to a
  MessagePort, so an app cannot be unit-tested or run against anything else.
- **Studio already has the building blocks:**
  - structural writes with revisions and registry sync (MVP-5,
    ADR 0027, DATA-020);
  - uploads (`targets/{id}/uploads`);
  - AASQL searches;
  - asset ID lookup;
  - the *Share* dialog and target authorization;
  - the time series plan's connections, secrets and guarded fetch.

## Decisions

Decided on 2026-10-19.

### Single-app mode

| # | Topic | Proposal |
| --- | --- | --- |
| M1 | Switch | `STUDIO_APP=<app ID>` turns single-app mode on. `STUDIO_APP_MODULE=<route>` picks the start module when the app has several, which then appear as tabs in the bar. Studio refuses to start if the app is not installed, has no module, or is not compatible. |
| M2 | Managed packages | `STUDIO_APP_PACKAGES` (paths, or a directory, of `.zip` files mounted into the container). Packages are installed or updated at startup by digest, like bundled apps, and marked `managed`. They cannot be removed in the UI. Unsigned managed packages are accepted, because the operator vouches for them; the *Apps* page says so. Works in full Studio too (SAP-003). |
| M3 | Target | A module with `context: global` needs no target. For `target` and `shell` modules, `STUDIO_APP_TARGET=<infrastructure key>` pins a declared infrastructure. Without the variable, one visible infrastructure is selected automatically. Several infrastructures get a branded picker, the existing one restyled. Sign-in to delegated infrastructures uses Studio's prompts. |
| M4 | Frame | The top-level page keeps: sign-in, a slim app bar, notifications, Studio dialogs (confirmation, sharing, sign-in to an infrastructure), session expiry and the about dialog. The bar shows logo, product name, module tabs, the edit switch (only when the app has `studio.aas.write`) and a user menu with language, theme and sign out. The page has no navigation drawer, no target pages, no command palette and no settings beyond the user menu. |
| M5 | URLs | `/{subPath}` maps to the module's sub-path. With several modules it is `/{route}/{subPath}`. `STUDIO_BASE_PATH` applies as usual. Studio's own routes move under `/_studio/…` in this mode, so they cannot collide with app paths. API, health and branding paths are unchanged. |
| M6 | Studio pages | `STUDIO_APP_STUDIO_PAGES=hidden` (default) or `allowed`. When allowed, `studio.ui.openTarget` and a new `studio.ui.openShell({shellId})` open Studio's shell or concepts page under `/_studio/…` with *Back to {product}* in the bar. Admin pages follow the user's roles. When hidden, these methods are refused, and the app can use `getContext().studioPages` to hide its buttons. |
| M7 | Branding | Existing variables, plus `STUDIO_FAVICON`. The sign-in page shows the product's logo and name. *Settings → About* and the user menu say "Built on BaSyx Studio" with the version. |
| M8 | Edit mode | UX-006 stays: the bar has the edit switch. In addition, any app with `studio.aas.write`, in full Studio and in single-app mode, may call `studio.ui.requestEditMode({reason})`. Studio asks the user in its own dialog, which names the app and shows the reason. After one confirmation per session and app, later requests switch without asking. The method is refused for users without write rights, on read-only targets and with `STUDIO_READ_ONLY`. Leaving edit mode stays with the user. |
| M9 | Desktop | Out of scope (SAP-007). |

### AAS capabilities for products

| # | Topic | Proposal |
| --- | --- | --- |
| A1 | Structural writes | New methods `studio.aas.createShell`, `createSubmodel` (with the shell reference), `putSubmodel`, `addElement`, `putElement`, `deleteElement`, `deleteSubmodel` and `deleteShell`. They need permission `studio.aas.write`. The edit mode is checked on the server, not only by the app. They use the editor's code paths: conditional writes with revisions (ADR 0013, ADR 0027), AAS Core validation with findings in the result, and registry sync by the infrastructure's policy (DATA-020). Identifier generation comes from the infrastructure scheme (ADR 0028) when no ID is passed. On workspaces they become undo-log entries (ADR 0030). |
| A2 | Attachments | Reading stays with `studio.ui.readFile` (ADR 0038). New: `studio.aas.putAttachment({submodelId, idShortPath, fileName, contentType, data})`, with up to 8 MiB per call. It reuses the upload route's checks: size, content type and the `STUDIO_ALLOW_UPLOADS` switch. Like `readFile`, Studio's page carries it out: the bytes cross the MessagePort as `ArrayBuffer`, and the host sends them through Studio's API as the user. |
| A3 | Query and lookup | `studio.aas.query({expression, cursor?})` uses AASQL through the existing searches route. The result includes a `mode` (`query`, `expression` or `filter`) as DATA-019 requires. `studio.aas.lookupShells({assetIds})` uses discovery or the registry, following the existing lookup route. |
| A4 | Rights and sharing | `studio.aas.getAccess({shellId})` returns `{read, write, share}` for the current user, from the server's announced access features (DATA-018). It never returns rules or tokens. `studio.ui.share({shellId})` opens Studio's *Share* dialog. Apps never call access-rule endpoints or decode tokens. |
| A5 | User in context | `AppContext.user = {displayName}` and nothing more. Apps that need group-based logic keep it in their own service. That service receives the user's identity through a `delegatedUser` connection (K5). |

### Connections for apps

These build on the connections core of the [time series plan](time-series-plan.md)
(C1–C8): infrastructure-scoped entries with `type`, `url`, `aliases`, `auth`
and `settings`, secrets as references or encrypted values, and guarded fetch.

| # | Topic | Proposal |
| --- | --- | --- |
| K1 | Type | `type: http`, a generic HTTP service whose usable surface is a set of declared operations. There is no free path or method (CON-002). |
| K2 | Manifest | `connections: [{ id, title, api, operations }]`. `api` is an OpenAPI 3.x document inside the package. `operations` lists the `operationId`s the app needs. Calling them needs permission `studio.connections`. The install dialog lists, per connection, the operations as method and path. |
| K3 | Binding | The administrator binds an app connection to an infrastructure connection with `apps: [{ app, connection }]` on the infrastructure connection, in YAML or in the infrastructure dialog. An unbound call is refused (`connection_not_bound`). Binding shows the operations again. The binding sits next to the credential, so one place defines where it may be used. |
| K4 | Method | `studio.connections.call({connection, operation, path?, query?, body?})` returns `{status, contentType, etag, location, body}`. Studio validates path and query parameters and the request body against the operation's schema. It builds the URL from the connection's `url` and the operation's path template, uses only the declared method, sets content type and accept, and adds auth. Non-2xx responses are results, not errors, so the app can show problem details. Redirects are not followed. |
| K5 | Auth | Schemes from CON-007: `none`; `token` or `header` (secret reference); `basic`; `oauth2ClientCredentials` through the credential broker; `delegatedUser`, allowed only when the infrastructure's issuer signs users in. With a service identity, Studio first checks that the user can open the infrastructure, and audits both identities (SEC-005). |
| K5a | Delegated user | `delegatedUser` uses token exchange (RFC 8693). Studio exchanges the user's access token at the issuer's token endpoint, as its own client, for a token with the connection's `audience` (and optional `scope`). The exchanged token is cached per session and connection until it expires. The IdP must allow the exchange for Studio's client, and *Test connection* checks this. Where the IdP has no token exchange, the administrator may set `forwardUserToken: true`. Studio then forwards the user's access token unchanged, but only if its `aud` contains the connection's `audience`; otherwise it refuses. The dialog and the docs warn that the service could replay that token against the AAS server. The audit records which of the two was used. |
| K6 | Bodies | JSON, text and bytes, up to 8 MiB per call. `multipart/form-data` operations take `{fields, files}` and Studio builds the multipart body. Larger uploads are chunked by the app through its service's own chunk operations. A streaming channel is out of scope. |
| K7 | Limits | 30 s default timeout, configurable per connection up to 120 s. 20 MiB response cap. At most 4 concurrent calls per session and connection. |
| K8 | Audit | `connection.call` records app, user, infrastructure, connection, operation, status and duration, without bodies (CON-006, OPS-006). Refusals are always audited. |
| K9 | Who may use it | Installed apps as well as bundled ones: the administrator's binding is the gate. Backend apps get the method through `studio.call` like `studio.aas.*`, so they can reach their services without network access of their own. |

### Sandbox extensions

| # | Topic | Proposal |
| --- | --- | --- |
| S1 | Manifest | ADR 0038's `sandbox` (`webAssembly`, `workers`) gains `imageOrigins` and `mediaOrigins`. Both are empty by default. |
| S2 | CSP | Origins are appended to `img-src` or `media-src`. They must be `https://host[:port]`, with at most one leading `*.` label. Nothing extends `connect-src`: data goes through capabilities. |
| S3 | Consent | The install dialog and the *Apps* page list the origins. Third-party origins get the data-egress note: the browser contacts them directly, which reveals the user's address and what they view. Changing extensions on update asks again. |

### SDK

| # | Topic | Proposal |
| --- | --- | --- |
| D1 | Transport | `StudioClient` keeps its API and is built on a `Transport` interface (`call`, `onContext`, `close`). `connect()` is unchanged for apps and creates the bridge transport. |
| D2 | Test transport | `@basyx/studio-sdk/testing` provides `createTestStudio({context, handlers})`, an in-memory transport with handlers typed by `Methods`. It lets apps run their UI in a plain Vite dev server and unit-test without Studio. Fixtures for shells and submodels come from the caller. |
| D3 | Wire format | The OpenAPI document describes `POST /app-calls` (method, params, results, problems) as the normative HTTP binding of the capability protocol. Another host could implement it. No HTTP transport ships in MVP-7. |
| D4 | Versioning | New methods raise the app API from 0.1.1 to `0.2.0`. Apps declare `^0.2.0` to use them. Older apps keep working. |

## Design

```text
┌ [logo] Fleet Atlas    Map │ Lines │ Imports         ✎ Edit   ◐   AZ ▾ ┐
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│                 app iframe, full width and height                     │
│                 (sub-path ↔ https://atlas.example.org/…)              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
  Studio snackbars, dialogs and sign-in prompts appear above the frame.
  With STUDIO_APP_STUDIO_PAGES=allowed, "Open in Studio" shows the shell
  page under /_studio/… with "← Back to Fleet Atlas".
```

### Configuration (hosted)

```yaml
# compose.yaml (excerpt)
environment:
  STUDIO_PRODUCT_NAME: Fleet Atlas
  STUDIO_LOGO: /branding/logo.svg
  STUDIO_APP_PACKAGES: /opt/apps
  STUDIO_APP: org.example.fleet-atlas
  STUDIO_APP_TARGET: plant
  STUDIO_INFRASTRUCTURES_FILE: /config/infrastructures.yaml
```

```yaml
# infrastructures.yaml (excerpt)
infrastructures:
  - key: plant
    # AAS endpoints and security as today
    connections:
      - key: imports
        type: http
        url: http://import-service:8080
        auth: { scheme: delegatedUser }
        apps:
          - { app: org.example.fleet-atlas, connection: imports }
```

### Code structure

- **`server/lib/apps/`:**
  - `packages.ts`: managed packages (M2);
  - `single-app.ts`: configuration checks (M1, M3, M6);
  - `csp.ts`: sandbox extensions (S2).
- **`server/lib/connections/http.ts`:** the OpenAPI operation index, parameter
  and body validation, URL building and multipart. It uses the connection
  registry from the time series plan.
- **`server/utils/apps.ts`:** dispatches `studio.aas.*` structural methods,
  attachments, query, lookup and access to the existing target operations.
- **`server/utils/connections.ts`:** the `studio.connections.call` dispatcher
  (K4–K8).
- **`server/lib/config.ts`:** `STUDIO_APP`, `STUDIO_APP_MODULE`,
  `STUDIO_APP_PACKAGES`, `STUDIO_APP_TARGET`, `STUDIO_APP_STUDIO_PAGES` and
  `STUDIO_FAVICON`.
- **`app/`:**
  - a single-app layout (`app/layouts/single-app.vue`) with the slim bar;
  - root routing to the module page;
  - `/_studio/…` route prefixing in single-app mode;
  - `useAppBridge.ts` for binary transfer and the new UI methods
    (`share`, `openShell`, `requestEditMode`).
- **`packages/studio-sdk/`:**
  - `Transport` and `testing.ts`;
  - the new methods and permission `studio.connections`;
  - the manifest schema (`connections`, `sandbox`);
  - `studioApi` 0.2.0.
- **`shared/contract/apps.ts`:** parameter schemas for every new method.
- **`examples/deployment/single-app/`:** a Compose example with Fleet Atlas,
  one declared infrastructure and a small mock import service with an OpenAPI
  document.

## Phases

| Phase | Content | Done when |
| --- | --- | --- |
| A | Three ADRs: ADR 0042 (single-app mode, managed packages, app-requested edit mode), ADR 0043 (HTTP connections, declared operations, token exchange), ADR 0044 (image and media origins for app frames, extending ADR 0038). Updates to `security.md`, `app-platform.md` and `deployment-variants.md`. | ADRs reviewed |
| B | Managed packages, single-app mode (M1–M7), the `/_studio` prefix, branded sign-in, and the Compose example with Fleet Atlas | Fleet Atlas runs as its own product at the root URL; deep links, reload and back work; hidden Studio pages are unreachable; full Studio is unchanged when `STUDIO_APP` is unset |
| C | SDK transport split, test transport, `studioApi` 0.2.0, `/app-calls` in the OpenAPI document | Existing apps work unchanged; one example app has unit tests on the test transport |
| D | AAS capabilities A1–A5, with server-side edit-mode checks and audit | Contract tests per method, on a live target and on a workspace; registry sync and findings as in the editor |
| E | HTTP connections (K1–K9); binding in YAML and in the infrastructure dialog | An app calls the mock service with `delegatedUser` and with a static token. Foreign URLs, undeclared operations, unbound apps, invalid bodies and redirects are refused and audited. The browser's network log shows no token. |
| F | Image and media origins (S1–S3) | An example loads map images from a declared origin; without the declaration, the CSP blocks them |
| G | Pilot: port an existing multi-service AAS application's main workflows to an app, outside this repository. Report the missing capabilities. | A follow-up plan lists the gaps found |

## Later

- An HTTP transport and a standalone host that implements the capability
  binding (D3) without Studio, if a product needs to run with no Studio
  Service at all.
- Branded desktop builds (SAP-007).
- Apps embedding other apps' submodel views, such as the Time Series view, in
  their own pages.
- Streaming uploads and downloads for large files.
- Server-sent events from connections (live data) through a capability.
