# Endpoint overview: Frontend ↔ BFF

The complete machine-readable definition is in
[openapi.yaml](openapi.yaml). This document explains the endpoints at the
functional level without duplicating the OpenAPI schemas.

## Common rules

- Base: `/api/studio/v1`; the same contract applies to the browser and Electron.
- The session is an opaque, server-side HttpOnly cookie. OAuth tokens and
  downstream credentials never reach the frontend.
- Every domain target request contains an opaque `targetId`. The frontend does
  not send a BaSyx service URL as a routing decision.
- Mutations require `X-CSRF-Token`; revision-protected mutations also require
  `If-Match`. Responses return the new revision as `ETag`.
- Lists use `limit` and an opaque `cursor`.
- Repeatable commands use `Idempotency-Key`.
- Longer flows return `202 Accepted` and an operation resource. Progress can be
  followed through SSE or, as a fallback, through polling.
- Errors use `application/problem+json` with stable `code`,
  `requestId`, `correlationId` and `retryable`.

## Context and sign-in

| Method and path | Purpose |
| --- | --- |
| `GET /context` | Returns the deployment mode, API/Studio version, available platform functions and the session context for UI startup. Can be called anonymously. |
| `GET /session` | Returns the signed-in user, groups/roles, CSRF value, active target and session expiry. |
| `POST /auth/login` | Starts OIDC Authorization Code with PKCE. The response contains only a validated navigation URL. |
| `GET /auth/callback` | Receives the OIDC code; the BFF checks state/nonce, exchanges tokens server-side and sets or resumes the session. Also applies to target reauthentication. |
| `POST /auth/logout` | Ends the Studio session and the server-side target contexts. |
| `GET/PUT /me/preferences` | Reads or replaces the signed-in user's preferences: recently opened shells (`{ key, title }`) per target, theme, language of multi-language values, auto-refresh and `syncOverrides` per infrastructure (MVP-4). |

## Targets and infrastructures

| Method and path | Purpose |
| --- | --- |
| `GET /targets` | Lists visible live infrastructures and local AASX workspaces with status, capabilities and permissions. |
| `GET /targets/{targetId}` | Returns the detailed status of a target; credentials and unsafe internal details stay hidden. Capabilities (among others `search`, `queryTarget`, `elementSearch`, `listSource`) follow from the stored service profiles ([ADR 0021](../adr/0021-feature-detection-from-service-profiles.md)); `registrySync` names the sync default and the user override where Studio keeps registries and discovery up to date. |
| `PUT /targets/{targetId}/activation` | Checks rights/health and sets the active target of the session. The decision about unsaved UI drafts comes from the frontend in the request. |
| `POST /targets/{targetId}/authorization` | Starts or resumes authentication for exactly this target. Other target sessions stay unchanged. |
| `DELETE /targets/{targetId}/authorization` | Disconnects only the credential context of this target. |
| `GET /infrastructures` | Lists administratively managed live infrastructures. |
| `POST /infrastructures` | Accepts an admin configuration (template, endpoints, `listSource`, `sync`, security), validates the template and SSRF/network rules as well as an optional client certificate (`clientCertificate`, PKCS#12), runs a probe and only then registers it. When hosted, secrets and certificates are handled only as references; the desktop stores uploaded values encrypted. |
| `GET /infrastructures/{infrastructureId}` | Returns sanitized configuration details, endpoints, service profiles (`serviceProfiles`, `probedAt`, `announced`) and revision. |
| `PUT /infrastructures/{infrastructureId}` | Replaces the configuration with `If-Match`, renewed validation and a probe. An omitted `clientCertificate` is kept; `null` removes it. |
| `DELETE /infrastructures/{infrastructureId}` | Removes the Studio configuration, not the data of the infrastructure. |
| `POST /infrastructures/{infrastructureId}/probe` | Queries `/description` of each endpoint again, returns reachability and profiles per endpoint and replaces the stored profiles. |

## AAS and target data

All of the following paths are scoped under `/targets/{targetId}`. The BFF
selects the BaSyx TypeScript SDK client or the Workspace Worker server-side.

| Method and path | Purpose |
| --- | --- |
| `GET/POST /targets/{targetId}/shells` | Lists shells from the list source (AAS registry or repository) with a cursor, or creates a validated shell. |
| `POST /targets/{targetId}/shell-availability` | Reports for up to 50 shell keys whether the shell can be opened: `available`, `forbidden`, `not_found`, `blocked` (descriptor endpoint outside the infrastructure) or `unreachable`. |
| `POST /targets/{targetId}/searches` | Searches shells by search expression (`expression`) or AAS query (`query`) with a cursor, or submodel elements by text (`scope: elements`). Invalid queries result in `query_invalid` with `violations`, missing query support in `query_unsupported`. |
| `GET /targets/{targetId}/lookup` | Finds the shells of an asset by its global asset ID: through discovery, otherwise through a query on the AAS repository where it announces queries. |
| `GET/PUT/DELETE /targets/{targetId}/shells/{shellKey}` | Reads a shell, replaces it with `If-Match` or deletes it. Deletion returns the registry and discovery steps that Studio ran afterwards (`sync`). |
| `GET /targets/{targetId}/shells/{shellKey}/submodel-refs` | Referenced submodels with status (`available`, `forbidden`, `not_found`, `blocked`, `error`). |
| `GET /targets/{targetId}/shells/{shellKey}/thumbnail` | Streams the shell's thumbnail; `204` if it has none. |
| `GET /targets/{targetId}/shells/{shellKey}/export` | Downloads the shell with its submodels and concept descriptions as AASX, JSON or XML. |
| `GET /targets/{targetId}/shells/{shellKey}/rights` | The signed-in user's effective rights on the shell, so that the UI hides disallowed actions. |
| `GET/PUT /targets/{targetId}/shells/{shellKey}/access` | Reads a shell's ReBAC shares or replaces them with `If-Match`. |
| `POST /targets/{targetId}/shells/{shellKey}/access/invitations` | Creates an invitation that grants a relation on the shell. |
| `POST /targets/{targetId}/invitations` | Accepts an invitation for the signed-in user. |
| `GET/POST /targets/{targetId}/submodels` | Lists or creates submodels. |
| `GET/PUT/DELETE /targets/{targetId}/submodels/{submodelKey}` | Reads a submodel (`content=metadata\|full`, `format=json\|xml`, `at`), replaces or deletes it. |
| `GET/POST /targets/{targetId}/submodels/{submodelKey}/elements` | Tree nodes below the submodel or `parentElementKey`, with as many complete levels as fit into `budget` nodes (default 2,000, at most 5,000), also historically with `at`; or creates an element. |
| `GET/PUT/DELETE /targets/{targetId}/submodels/{submodelKey}/elements/{elementKey}` | Reads a single element as JSON with revision and `ancestors` or as AAS XML (`format`, `at`), replaces or deletes it. |
| `POST /targets/{targetId}/submodels/{submodelKey}/elements/{elementKey}/moves` | Moves an element to a position among its siblings; `If-Match` with the structure revision of the parent node (`structure_conflict` on a concurrent structural change). |
| `PUT /targets/{targetId}/submodels/{submodelKey}/elements/{elementKey}/value` | Sets the value of a Property or MultiLanguageProperty with `If-Match`. |
| `GET/PUT /targets/{targetId}/submodels/{submodelKey}/elements/{elementKey}/attachment` | Streams the content of a File element or replaces it with `If-Match`. |
| `POST /targets/{targetId}/submodels/{submodelKey}/elements/{elementKey}/invocations` | Invokes an Operation synchronously or asynchronously; asynchronous invocations return a handle. |
| `GET /targets/{targetId}/submodels/{submodelKey}/elements/{elementKey}/invocations/{handle}` | Queries the state and outputs of an asynchronous invocation. |
| `GET/POST /targets/{targetId}/concept-descriptions` | Lists or creates concept descriptions (without an ID, Studio generates one following the infrastructure's scheme; `identifier_conflict` if the ID exists). |
| `GET/PUT/DELETE /targets/{targetId}/concept-descriptions/{resourceKey}` | Reads a concept description as JSON with revision or as AAS XML (`format`), replaces it with `If-Match` or deletes it. |
| `GET /targets/{targetId}/concept-descriptions/{resourceKey}/usages` | Counts submodels and elements whose semantic ID names the concept description (for the delete confirmation). |
| `GET /targets/{targetId}/changes` | Reads change events of shells, submodels and assets where the server announces its event feed. |
| `POST /targets/{targetId}/uploads` | Adds the content of an AASX, JSON or XML file; returns the new shells and the registry and discovery steps (`sync`). |
| `POST /targets/{targetId}/operation-invocations` | Runs an explicitly selected AAS operation with validated inputs and, if required, confirmation. |
| `GET/POST /targets/{targetId}/files` | Lists supplementary file metadata or streams a bounded upload. |
| `GET/DELETE /targets/{targetId}/files/{fileKey}` | Streams a file within limits or deletes it. No local paths are returned. |
| `GET /targets/{targetId}/semantic-index` | Searches semantic facts for shell/submodel selection, bindings and app applicability. |

AAS models stay deliberately generic in the contract: validation uses the
authoritative AAS Core 3.1 types and package validators, not a second Studio
metamodel specification.

Status MVP-4: Implemented are the shell list, reading single shells, submodels
and elements, as well as `shell-availability`, `searches`, `lookup`,
`submodel-refs`, `thumbnail`, `export`, `rights`, `access`, invitations,
`changes`, `concept-descriptions` (read-only), `uploads`, shell deletion,
values, attachments and invocations per Operation element. Creating and
replacing whole shells, submodels, elements and concept descriptions, the
submodel list, `operation-invocations`, `files` and `semantic-index` remain
draft. Studio offers optional functions (history through `at`, `changes`,
shares, queries) only where the server announces them in its service profiles
([ADR 0021](../adr/0021-feature-detection-from-service-profiles.md)); search and
queries run through the BFF
([ADR 0024](../adr/0024-aas-query-language-through-the-bff.md)). The routes
`GET /targets/{targetId}/search` and
`GET /targets/{targetId}/submodels/{submodelKey}/tree` of the viewer port are
replaced by `POST …/searches` and the level route `…/elements` with a node
budget. After uploads and deletions, Studio writes or removes registry
descriptors and discovery asset links where the server does not maintain them
itself and the effective sync mode is `autoCreate`
([ADR 0020](../adr/0020-infrastructure-templates-registries-and-sync.md)).
New problem codes: `descriptor_endpoint_blocked`, `query_invalid` and
`query_unsupported`. Details are in the
[MVP-4 plan](../development/mvp-4-plan.md#studio-api).

Status MVP-6: Concept descriptions are created, replaced and deleted, on live
targets as in workspaces, checked with AAS Core and with the same revisions as
submodels; `validations` also accepts `conceptDescription`. Shells, submodels
and elements write their `embeddedDataSpecifications` (IEC 61360) through the
existing routes. Details are in the
[MVP-6 plan](../development/mvp-6-plan.md#implementation-status).

Infrastructures can have a TLS client certificate (mTLS), independent of the
access mode ([ADR 0025](../adr/0025-client-certificates-for-infrastructures.md)).
The Studio Service presents it on every HTTPS request to the endpoints and to
the IdP. The API returns only the subject, issuer, expiry date and, where
applicable, the reference, never the bundle, key or passphrase. New problem
codes: `target_client_certificate_required`,
`target_client_certificate_rejected` and `client_certificate_invalid`.

## Desktop workspaces and AASX

Native file and folder dialogs belong to the Electron IPC contract. The BFF sees
only short-lived opaque handles.

| Method and path | Purpose |
| --- | --- |
| `GET /workspaces` | Lists local projects, never native paths. Only available with the desktop capability. |
| `POST /workspaces` | Creates a project at an approved destination handle. |
| `POST /workspaces/imports` | Imports an AASX through the Workspace Worker; archive size, paths, entry count, MIME type and resource limits are checked. |
| `GET/PATCH/DELETE /workspaces/{workspaceId}` | Reads metadata and recovery/validation status, changes metadata or deletes the project. Deleting the file is an explicit option. |
| `PUT /workspaces/{workspaceId}/activation` | Opens the project and provides it as a local `AasTarget`. |
| `POST /workspaces/{workspaceId}/duplications` | Duplicates the project to an approved destination handle. |
| `POST /workspaces/{workspaceId}/saves` | Saves the current revision atomically into the package. |
| `POST /workspaces/{workspaceId}/exports` | Exports the validated revision atomically to an approved destination handle. |

After opening, AAS reads and mutations run through the normal
`/targets/{targetId}/...` endpoints.

Status MVP-2: Implemented are `POST /workspaces` (opens an AASX from a file
handle), `POST /workspaces/{workspaceId}/saves`,
`POST /workspaces/{workspaceId}/exports` (save as) and
`DELETE /workspaces/{workspaceId}?force=`. Only the Electron main process issues
file handles, through `POST /desktop/file-grants`
([ADR 0015](../adr/0015-desktop-native-bridge-and-file-grants.md)); details and
deviations are in the [MVP-2 plan](../development/mvp-2-plan.md#results).

## Cross-target copy

| Method and path | Purpose |
| --- | --- |
| `POST /copy-plans` | Creates a read-only preflight plan with source and destination rights, capabilities, dependency closure, collisions, findings, size estimate and actions. |
| `GET /copy-plans/{copyPlanId}` | Reads the versioned, expiring plan again. |
| `POST /copy-plans/{copyPlanId}/executions` | Confirms the policy and visible consequences; starts the execution idempotently as an operation. The source stays unchanged; atomicity is not claimed. |
| `GET /copy-operations/{operationId}/report` | Returns `created`, `skipped`, `replaced` or `failed` per resource, including validation and partial success. |
| `POST /copy-operations/{operationId}/retries` | Retries only safe, failed or incomplete resources. |

The default collision policy is `fail_without_changes`; `skip_existing` and
`replace` are allowed only with the capability and permission.

## Views, widgets and bindings

| Method and path | Purpose |
| --- | --- |
| `GET/POST /views` | Lists visible views or saves a validated declarative view. |
| `GET/PUT/DELETE /views/{viewId}` | Loads a view, replaces it with revision protection or deletes it. |
| `POST /views/validations` | Checks an unsaved draft including bindings and widget compatibility. |
| `POST /views/imports` / `GET /views/{viewId}/export` | Imports a portable definition or exports it without apps, secrets or AAS values. |
| `GET/PUT /views/{viewId}/access-rules` | Manages view opening and view authorization separately. |
| `POST /views/{viewId}/runtime-contexts` | Migrates the definition, authorizes widgets and resolves all bindings in the active context. Individual broken widgets are returned as diagnostics. |
| `POST /binding-resolutions` | Resolves a proposed instance or semantic binding. Status: `resolved`, `ambiguous`, `missing`, `incompatible`, `unauthorized`. |
| `POST /binding-executions` | Runs a concrete, authorized binding read, write or operation call. Opening a view alone grants no data rights. |
| `GET /widget-types` | Returns the built-in and app widgets allowed for the target/context, with schema, slots, compatibility, applicability and permissions. |

View definitions are declarative data; JavaScript, Vue, HTML, credentials,
service URLs and file system paths are excluded.

## Apps

| Method and path | Purpose |
| --- | --- |
| `GET /apps/catalog` | Sanitized marketplace projection for the UI, including compatibility and applicability. |
| `GET /apps/catalog/{appId}/versions/{version}` | Immutable version with digest, signature/revocation status, SBOM/review information and requested capabilities. |
| `GET/POST /app-installations` | Shows installations or installs digest-pinned with explicit permissions. Installation runs asynchronously; a developer mode package (`application/zip`) is checked and installed synchronously (MVP-3). |
| `GET/DELETE /app-installations/{installationId}` | Shows lifecycle and permissions or removes the installation. Apps shipped with Studio (`bundled`, ADR 0023) cannot be removed (MVP-4). |
| `GET /app-installations/{installationId}/compatibility` | Assesses technical compatibility and semantic applicability separately. |
| `GET /app-contributions` | Modules of the installed apps and, for one or more semantic IDs (repeated parameter, MVP-4), matching submodel views with a reason (MVP-3). |
| `POST /app-calls` | Capability call for an app: from the host bridge by session or from the backend by a short-lived capability token; checked against the manifest and user rights (MVP-3, ADR 0018). MVP-4 adds `shellId`, `studio.ui.setHeight` and `studio.ui.openFile`; the app context names the mode (`view` or `edit`). `studio.ui.openFullscreen` opens the view again in a fullscreen dialog (without permission, only in the host bridge); there, `fullscreen` is set in the context. |
| `POST/DELETE /app-installations/{installationId}/activations` | Activates or deactivates for a target/context. |
| `POST /app-installations/{installationId}/updates` | Checks a signed immutable version and provides it as an update. |
| `POST /app-installations/{installationId}/rollbacks` | Rolls back to a verified previous version. |
| `GET/PUT /app-installations/{installationId}/visibility` | Manages visibility for users/groups independently of the installation scope. |

App `postMessage`/capability RPC and App Runner communication are a separate
contract; these endpoints manage only the BFF-side app lifecycle.

## Operations, events and audit

| Method and path | Purpose |
| --- | --- |
| `GET /operations` | Bounded list of running or completed copy/app operations for polling. |
| `GET /operations/{operationId}` | Queries a single status, progress, errors and links. |
| `GET /operations/{operationId}/events` | One-way SSE stream for progress and outcomes; resume through `Last-Event-ID`. |
| `GET /events` | Topic-filtered SSE notifications and cache invalidations; not a command channel. |
| `GET /audit-events` | Authorized, sanitized audit summaries. No tokens, bodies, package contents or secrets. |

## Not part of this API

Electron IPC, the Workspace Worker API, the App SDK RPC, the marketplace
publisher/OCI API, the OIDC provider API, the BaSyx downstream API and the
desktop updater remain separate contracts. This keeps the trust boundaries
described in the architecture and security parts of the documentation intact.

## Status MVP-5: Editor

Structural writes use structure revisions (`s.<hash>`, ADR 0027) and whole
resources. In addition to the routes above, the following are implemented:

| Route | Purpose |
| --- | --- |
| `POST /targets/{targetId}/submodels/{submodelKey}/elements` | Inserts an element (`parentElementKey`, `index`); `If-Match` with the structure revision of the parent node. |
| `PUT/DELETE /targets/{targetId}/submodels/{submodelKey}/elements/{elementKey}` | Replaces (also renames) or deletes an element; `If-Match` with the element revision. |
| `POST …/elements/{elementKey}/moves` | Moves an element (list elements; BaSyx Go sorts named children by name). |
| `PUT /targets/{targetId}/submodels/{submodelKey}` | Replaces submodel metadata; elements stay. |
| `POST /targets/{targetId}/shells` | Creates a shell with new submodels (wizard); submodels first, steps in the result. |
| `PUT /targets/{targetId}/shells/{shellKey}` | Replaces shell metadata and asset information; submodel references stay. |
| `PUT /targets/{targetId}/shells/{shellKey}/thumbnail` | Sets the thumbnail. |
| `POST /targets/{targetId}/shells/{shellKey}/instances` | Instance from a type shell. |
| `POST/DELETE /targets/{targetId}/shells/{shellKey}/submodel-refs[/{submodelKey}]` | Adds or removes a submodel (`deleteSubmodel`). |
| `POST /targets/{targetId}/submodels/{submodelKey}/instance-conversions` | Converts a template into an instance. |
| `GET /targets/{targetId}/templates[/{templateId}]`, `GET /submodel-templates/{templateId}` | Templates and their fields. |
| `POST /targets/{targetId}/validations` | AAS Core findings for JSON, without writing. |
| `POST /workspaces` with `{ "empty": true }` | New, empty package. |
| `POST /workspaces/{workspaceId}/undos`, `/redos` | Undo / redo until save or close. |

New problem codes: `idshort_conflict`, `structure_conflict`,
`identifier_conflict`, `partial_write` (with `steps`), `template_invalid`.

## Local BaSyx instances (desktop, ADR 0033)

The bundled app uses `POST /app-calls` with the `studio.containers`
permission. There are no separate `/containers` HTTP routes. Uploaded apps with
this permission are rejected; backend apps must not call it. In hosted mode,
the manager is not available.

| Capability method (`studio.containers.*`) | Purpose |
| --- | --- |
| `listEngines`, `selectEngine` | Detects the local engine or selects the socket/pipe |
| `listStacks`, `getStack`, `planStack` | Inventory, status and start plan |
| `createStack`, `changeStack`, `startStack`, `stopStack`, `updateStack`, `removeStack` | Lifecycle as jobs; only labeled objects |
| `getJob` | Progress and errors by polling |
| `getLogs`, `saveLogs` | Reads the latest log lines or saves them to a file chosen with `pickFiles` |
| `getSignIn` | Shows generated credentials after an explicit user action |
| `pickFiles` | Native file dialogs after a check by Studio; returns single-use handles |
| `exportStack`, `importStack` | Export or import with a handle from `pickFiles`; the export contains passwords and a database snapshot |

The parameters and results are in `shared/contract/apps.ts`,
`shared/contract/containers.ts` and in the Studio SDK. Tested images are pinned
by digest; a missing digest is not replaced by SNAPSHOT. When a stack is
removed without deleting data, the spec and the encrypted secrets are kept for
restoring it.

`studio.ui.openTarget` and `studio.ui.openExternal` require
`studio.ui.navigation`; `openExternal` opens only https addresses or http
addresses of this computer. `studio.ui.copyText` requires the new
`studio.ui.clipboard` permission. The host bridge runs `copyText` and
`openExternal` only directly after a click or key press in the app. Lifecycle
calls are audited with their result when their job ends.
