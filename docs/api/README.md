# Studio Frontend API

This folder contains the first design-oriented contract draft for the
communication between the Nuxt/Vue interface and the Studio Service/BFF:

- [OpenAPI 3.1 specification](openapi.yaml)

## Status and authority

`openapi.yaml` is `1.0.0-draft.1` and serves as a basis for bootstrap and
discussion while no domain Nitro routes or TypeScript contract schemas exist
yet. It deliberately implements the requirements, accepted ADRs and
architecture documents ahead of the current prototype.

Once implementation starts, the contract must get a single authoritative
source. The preferred target direction is:

```text
authoritative route/contract schemas
  -> runtime validation
  -> TypeScript DTOs/clients
  -> generated OpenAPI 3.1
```

The YAML must then not be maintained by hand in parallel to the same Zod,
route or TypeScript DTOs. Public view and app contracts use JSON Schema
2020-12/Ajv; AAS data uses generated AAS Core types and AAS Core/package
validation.

## Implementation status (MVP-4)

For the implemented routes, the contract in `shared/contract` (Zod) is
authoritative. With MVP-4, `openapi.yaml` was brought up to date for all
implemented routes (among others `PUT` with `If-Match` for infrastructures,
`searches`, `shell-availability`, tree levels with a node budget, XML output,
registry synchronization); routes that exist only in the draft are described as
such. The deviations of the MVPs are recorded in the plans under
[`docs/development`](../development/).

## Covered HTTP contract

The specification covers all frontend-to-Studio-BFF surfaces described in
`docs/`:

| Area | Included workflows |
| --- | --- |
| Context and auth | Deployment mode, session, CSRF, OIDC/PKCE login, callback, logout and separate target authentication |
| Targets | Visible live/AASX targets, active target, health, metamodel, capabilities and effective rights |
| Infrastructures | Administrative configuration, probe, sanitized details, security mode and server-side secret references |
| AAS | Shells, submodels, elements, concept descriptions, operations, supplementary files and semantic index |
| AASX workspaces | Opaque native handles, import, open, metadata, duplicate, save and export; editing runs through the same target routes |
| Cross-target copy | Preflight plan, collision policy, explicit confirmation, idempotent execution, progress, report and safe retry |
| Views | Declarative definitions, revisions, ACLs, import/export, widget palette, binding resolution, runtime context and scoped binding calls |
| Apps | Catalogue projection, compatibility/applicability, installation, permission approval, visibility, activation, update, rollback and removal |
| Operations and events | Polling resources, SSE progress, notifications and cache invalidation |
| Audit | Authorized, sanitized audit summaries for administration and operation diagnostics |

## Deliberate contract boundaries

This OpenAPI describes only the versioned HTTP/SSE edge between the core UI and
the Studio Service. The following boundaries remain separate, versioned
contracts:

- Electron preload/IPC for native dialogs, approved handles, updates and the
  local launch secret injection;
- app/widget `postMessage` and capability RPC from `@basyx/studio-sdk`;
- internal Studio Service to Workspace Worker communication;
- marketplace publisher, build, signing, catalogue storage and OCI APIs;
- Studio BFF to BaSyx APIs, which are addressed only through
  `basyx-typescript-sdk`;
- OIDC provider and desktop update service APIs.

This separation keeps trust boundaries from blurring into a seemingly uniform
browser API. The BFF returns no downstream tokens, secrets, native paths or
arbitrary upstream URLs.

## Conventions fixed in the draft

- relative base URL `/api/studio/v1` for same-origin web and authenticated
  Electron loopback;
- camelCase Studio DTOs and opaque, URL-safe target/resource keys;
- cookie-based opaque Studio session, no browser bearer scheme;
- mandatory `X-CSRF-Token` plus same-origin check for mutations;
- cursor pagination with `{ items, page: { nextCursor, hasMore } }`;
- strong `ETag`/`If-Match` revisions; stale writes result in a structured
  `412 Precondition Failed` and leave the UI draft untouched;
- `Idempotency-Key` for create, copy and app lifecycle commands;
- `application/problem+json` with stable `code`, `requestId`,
  `correlationId`, `retryable`, optional violations and revision;
- "target authentication required" is a typed domain `409` state, not to be
  confused with a missing Studio session;
- `202 Accepted` plus an operation resource for long copy/app flows;
- SSE only one-way; `GET /operations/{id}` remains the polling fallback;
- cross-target copy is snapshot-oriented, leaves the source unchanged and
  claims neither atomicity nor distributed rollback;
- view definition `1-draft` is deliberately experimental and contains no
  executable content, credentials, service URLs, native paths or AAS values.

## Traceability

Operations carry `x-requirements` with the requirement IDs they implement
directly. Cross-cutting architecture, persistence, supply-chain and
observability constraints are listed as `info.x-design-constraints`, because
they shape the whole API and do not produce a single endpoint.

| Requirements | Contract part |
| --- | --- |
| `SEC-001` to `SEC-008`, `DATA-011` | Session, OIDC, target auth, secret/network boundaries |
| `DATA-001` to `DATA-009`, `DATA-016`, `PROD-001` to `PROD-005` | Target contract, AAS CRUD/invoke/files, revisions and AASX |
| `PROD-007`, `DATA-012` to `DATA-015`, `OPS-007` | Copy plan, execution, operation, report, SSE and retry |
| `VIEW-001` to `VIEW-011`, `APP-016`, `PROD-006` | View, widget, binding and runtime contract |
| `APP-001` to `APP-014`, `APP-016`, `SEC-006`, `SEC-008` | Catalogue projection and app lifecycle; app RPC remains a separate contract |
| `OPS-004` to `OPS-007` | IDs, normalized errors, audit, operations and events |
| `ARCH-001` to `ARCH-009` | One resource-oriented API without GraphQL, a generic proxy, CRUD WebSockets or speculative services |

Optional later product ideas are not presented as an already available API:
developer mode (`APP-015`), view templates/parameters (`VIEW-012`),
collaborative editing/presence (`DATA-010`) and additional broker/realtime
infrastructure (`OPS-008`).

## Still to be decided or proven by a vertical slice

- concrete authoritative inclusion of the AAS Core 3.1 schema in the generated
  OpenAPI;
- final target/AAS identifier encoding behind the opaque resource keys;
- a stabilized view definition after the first builder/renderer vertical slice;
- OIDC return/callback details for the system browser and the hosted browser;
- SSE resume window, event retention and concrete deployment limits;
- whether the audit read API ships in the first product increment;
- selection and pinning of an OpenAPI 3.1 linter/generator in the PNPM tooling.

## Validation of the first draft

The draft was parsed as YAML and checked structurally with the locally available
`openapi-generator validate`. The remaining warnings concern only the SSE event
models documented through `x-event-schema`, which OpenAPI Generator does not
count as normal response model references.
