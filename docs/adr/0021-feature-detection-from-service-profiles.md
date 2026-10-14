# 0021: Feature detection from service profiles

- Status: Accepted
- Date: 2026-10-14
- Deciders: BaSyx Studio maintainers
- Requirements: DATA-018, ARCH-008, UX-002

## Context

Optional features differ between servers: history, the change feed,
relationship-based access control and the AAS Query Language. The viewer port
probed endpoints such as `$recent-changes`, which BaSyx Go serves in every
history mode, and offered history where no versions are recorded (MVP-4
defect D15). BaSyx Go is not the only backend Studio should work with.

## Decision

- Studio reads each endpoint's `/description` when an infrastructure is
  created, updated or probed, and stores the announced profiles with it.
  Infrastructures saved before profiles were stored are probed once when they
  are first loaded.
- Capabilities are derived from the stored profiles, the template and the
  security mode, never from probing feature endpoints:
  - history: Submodel Repository SSP-007 (IDTA-01002-3);
  - change feed: `https://basyx.org/aas/API/3/2/EventFeed/1.0`;
  - sharing: BaSyx relationship-based access control, and only with
    `delegated_user`;
  - queries: AAS Registry SSP-004, AAS Repository SSP-003 and Submodel
    Repository SSP-005, or the BaSyx 3.2+ service profiles that include them.
- A feature that is not announced is not offered: its tab, control or chip is
  absent, not disabled with an error.
- BaSyx Go announces the history and event-feed profiles since
  eclipse-basyx/basyx-go-components#764.

## Consequences

- Servers decide what Studio offers by what they announce, which works for any
  backend that follows the AAS API profiles.
- A server that serves a feature without announcing it gets no UI for it.
  Administrators can probe again after a server upgrade.
- No per-request feature checks and no feature cache.

## Alternatives considered

- **Probing feature endpoints:** wrong where an endpoint exists without the
  feature (D15) and costs requests.
- **Feature flags set by administrators:** duplicate what servers announce and
  drift from it.
