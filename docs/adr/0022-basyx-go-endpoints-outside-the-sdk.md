# 0022: BaSyx Go endpoints outside `basyx-typescript-sdk`

- Status: Accepted
- Date: 2026-10-14
- Deciders: BaSyx Studio maintainers
- Requirements: DATA-001, SEC-008, ARCH-005

## Context

DATA-001 requires live AAS operations through `basyx-typescript-sdk`.
Version 2.4.0 covers the standard repository, registry, discovery and query
endpoints. Some features Studio uses are proprietary BaSyx Go endpoints or
gaps of the SDK: `/upload`, AASX/JSON/XML serialization, `$history`, the
event feed (`/events`) and access rules (`$access`).

Operation invocations used the raw layer as well, because
`postInvokeOperationAsync*` returned no handle and the value-only invocations
required an AAS identifier that is not part of their path. Version 2.4.1
fixes both, so invocations go through the SDK. Once an asynchronous
invocation has finished, its status answers with a redirect (302) to the
result; Studio reads that redirect as the answer and never follows it.

## Decision

- Standard endpoints go through the SDK clients and services, configured per
  request with Studio's guarded fetch, the user's or Studio's token and the
  base-URL rule ([ADR 0020](0020-infrastructure-templates-registries-and-sync.md)).
- The endpoints above use a small raw HTTP layer (`server/lib/targets/http.ts`)
  on the same guarded, credentialed fetch, with the same problem mapping.
  Their formats are parsed in `server/lib/aas/basyx-go.ts`.
- Each raw call is replaced by the SDK once the SDK covers it; gaps are
  reported to `basyx-typescript-sdk`.

## Consequences

- One network policy, one credential path and one error mapping for all
  calls, whichever library builds the request.
- A small amount of request code to maintain until the SDK catches up.

## Alternatives considered

- **Extending the SDK first:** blocks Studio features on SDK releases.
- **Raw HTTP for everything:** reimplements what the SDK maintains (DATA-001).
