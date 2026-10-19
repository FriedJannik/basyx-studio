# 0042: External files through Studio's server

- Status: Proposed
- Date: 2026-10-19
- Deciders: BaSyx Studio maintainers
- Requirements: SEC-008, APP-010

## Context

AAS content often names a file by its address at the manufacturer, e.g. a
File element whose value is `https://c1.api.wago.com/…/750-8217.stp` in an
MCAD submodel, or an IDTA 02026 `ExternalUrl`. Studio's viewers and
`studio.ui.readExternalFile` ([ADR 0038](0038-webassembly-workers-and-file-reads-for-apps.md))
fetch such files in the user's browser, which may read them only if the host
allows cross-origin reads (CORS). Many hosts serve the file but send no
`Access-Control-Allow-Origin`, so the browser withholds it and Studio can
only offer a link.

Studio's server is not bound by CORS. But a server that fetches addresses it
did not configure is the server-side request forgery that SEC-008 rules out:
whoever can write an element could make Studio contact any host, including
hosts that trust Studio's network position. Every outbound request of Studio
so far goes to a configured target, IdP or connection, and there is no
generic proxy ([ADR 0040](0040-connections-on-infrastructures.md)).

## Decision

- **`GET …/elements/{elementKey}/external-file`** returns the file that a
  File or Property element names by an http(s) address. Studio reads the
  element as the user, with their rights on the target, and fetches the
  address stored in it. A request never carries an address, so the route is
  no proxy for addresses of the caller's choice.
- **Opt-in per deployment** with `STUDIO_EXTERNAL_FILE_ORIGINS`, a list of
  origins (`https://downloads.example.com`) or `*` for any. Desktop allows
  `*` by default, as the user's own machine fetches; hosted allows none
  until an administrator lists origins. Any other origin is refused with
  `external_file_refused` (403) before Studio contacts it.
- **The guarded fetch** applies as for targets: the address policy (no
  link-local or reserved ranges; plain HTTP only inside private networks),
  30 s, and 200 MiB, the limit of `studio.ui.readFile`. Studio follows at
  most three redirects, each to an origin that the list allows and an
  address that the policy allows; any other is `external_file_refused`.
- Private and loopback addresses need `STUDIO_PRIVATE_NETWORK_TARGETS=allow`.
  In hosted deployments they are reached only for origins listed by name,
  never through `*`, as many deployments allow private networks for their
  own services.
- The request carries no credentials, cookies or user token, and no
  `Origin` or `Referer`. The host learns Studio's address and the file it
  serves.
- The answer is sent like an attachment: as a download, sandboxed, with
  `nosniff`. The media type is the element's `contentType`, else the host's.
- Every fetch is **audited** (`element.external_file`) with the user, the
  target, the origin and the outcome; the path is not, as it may carry
  tokens in its query.
- **The browser stays first.** Studio's 3D view and `readExternalFile` fetch
  in the browser as before and use the route only when the browser cannot
  read the file. So a host that allows CORS sees the user, as now, and a
  deployment that lists no origins behaves as before.
- `external_file_unavailable` (502) reports a host that failed: unreachable,
  slow, an error status, too many redirects or a file above the limit.

## Consequences

- Files from hosts without CORS headers, such as WAGO's CAD downloads, show
  in Studio's Visualization tab and in apps with `studio.ui.externalFiles`,
  in hosted deployments only from the listed origins.
- With `*`, a user who may write an element can have Studio fetch any
  public HTTPS address and read the answer, from Studio's network position.
  Internal services stay out of reach: hosted, `*` never reaches private
  addresses. A host that trusts Studio's egress address should not be
  reachable this way, so hosted deployments should list origins.
- Studio's egress carries these downloads; there is no cache, so each view
  fetches again.
- The app API stays 0.1.2: `readExternalFile` keeps its contract and only
  succeeds more often.

## Alternatives considered

- **Browser only (ADR 0038):** no new egress, but files from hosts without
  CORS never show; the most common case for manufacturers' downloads.
- **Server first:** one request instead of two for hosts without CORS, but
  every external file would leave from Studio, also where the browser could
  read it, and hosted deployments without a list would lose nothing yet gain
  a second failure path.
- **Addresses from the client (`?url=`):** simpler for apps, but a proxy for
  any address the caller names; refused by SEC-008.
- **Origins per infrastructure:** closer to the content, but the hosts named
  by AAS content are the same across targets, and administrators set
  egress per deployment; can be added if needed.
