# 0024: AAS Query Language through the BFF

- Status: Accepted
- Date: 2026-10-14
- Deciders: BaSyx Studio maintainers
- Requirements: DATA-001, DATA-016, DATA-019, SEC-008

## Context

The shell list and the command palette need search over the whole target, not
only the loaded rows. The BaSyx AAS Web UI searches with the AAS Query
Language (IDTA-01002-3) and offers a search syntax and an advanced query
dialog. Browsers must not call BaSyx services directly (DATA-016).

## Decision

- **Syntax.** The Web UI's: free text plus `field:value`, `field=value`,
  `field!=value` and `-field:value`, with quoted values, over `id`, `idShort`,
  `assetKind`, `assetType`, `globalAssetId` and `specificAssetId`; free text as
  a case-insensitive regular expression. The parser is shared by the UI (chips)
  and the server.
- **Route.** `POST /targets/{targetId}/searches` with an expression or a raw
  query and a scope (`shells` or `elements`), cursor-paged. The BFF builds the
  query with the SDK's `Query` model and runs it on the list source's query
  endpoint (`/query/shell-descriptors` or `/query/shells`), else on the other.
- **Raw queries.** Checked with Ajv against the vendored IDTA-01002-3 JSON
  schema, at most 64 KiB, only the roots of the endpoint they run on, no
  `$select` (the list needs complete objects), with readable findings
  (`query_invalid`), then converted with `queryFromJsonable`.
- **Elements.** The palette searches elements with `/query/submodels` and
  `$sme` roots where the submodel repository announces queries.
- **Without query support** ([ADR 0021](0021-feature-detection-from-service-profiles.md)),
  the list filters its loaded rows and says so. AASX workspaces evaluate
  expressions in the Workspace Worker.

## Consequences

- Search scales with the server, and the BFF keeps credentials and the network
  policy.
- Studio depends on the query endpoints' implementations, which differ in
  regular-expression and paging support between servers.

## Alternatives considered

- **Filtering all shells in the BFF:** reads every shell for every search.
- **Forwarding raw queries unchecked:** expensive or malformed queries reach
  the server, and `$select` breaks the rows.
- **Queries from the browser:** violates DATA-016 and exposes tokens.
