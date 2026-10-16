# 0031: Release-age exceptions for Eclipse AAS Core Works packages

- Status: Accepted
- Date: 2026-10-16
- Deciders: BaSyx Studio maintainers
- Amends: [ADR 0012](0012-release-age-exceptions-for-basyx-packages.md)
- Requirements: ARCH-009, DATA-001

## Context

ADR 0012 lets reviewed releases of Eclipse BaSyx packages skip the 24-hour
release-age delay of ADR 0010. Studio also develops together with Eclipse AAS
Core Works (`eclipse-aascw`): its package engine, `aas-package3-typescript`
(ADR 0014), gets fixes for problems found in Studio, such as
`aas-package3-typescript` 1.1.0, which lists every part of a package and finds
parts whose names contain a space. Waiting a day for such a fix has the same
cost as for a BaSyx release.

## Decision

The rule of ADR 0012 also applies to packages that Eclipse AAS Core Works
publishes from its repositories' release workflows with npm provenance. All
conditions of ADR 0012 hold unchanged: a maintainer reviews the release and
its dependency changes, the exception names the exact version in
`minimumReleaseAgeExclude`, and dependencies of an excepted package keep the
24-hour delay.

## Consequences

- Fixes in Studio's package engine are usable on the day of their release.
- One more organization can publish versions that skip the delay after review;
  review and provenance remain the controls for those versions.

## Alternatives considered

- **No exception for Eclipse AAS Core Works:** keeps ADR 0012 unchanged, but
  delays coordinated package-engine fixes by a day.
- **A separate rule per package:** rejected because the risk and the controls
  are the same for every package of the organization.
