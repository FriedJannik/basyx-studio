# 0023: Bundled first-party apps

- Status: Accepted
- Date: 2026-10-14
- Deciders: BaSyx Studio maintainers
- Requirements: VIEW-006, UX-002, UX-006

## Context

The Web UI shows submodel templates such as the Digital Nameplate, Technical
Data, Carbon Footprint and Handover Documentation with dedicated views. Studio
has a runtime app platform ([ADR 0004](0004-runtime-installable-apps.md)), and
MVP-3 proved it with example apps that had to be installed in developer mode.

## Decision

- Studio ships four first-party apps in `apps/`: Digital Nameplate, Technical
  Data, Carbon Footprint and Handover Documentation. `pnpm apps:bundle` packages
  them into `server/bundled-apps/`, and the Studio service installs or updates
  them at startup by content digest.
- Bundled apps use the same manifest, packages, origin, sandbox and capability
  bridge as installed apps. They need neither developer mode nor a marketplace
  signature, because they come from the Studio build. Users cannot uninstall
  them; an administrator's own app with the same ID takes precedence.
- The bundled Digital Nameplate replaces the MVP-3 example. It edits in place,
  and only in Studio's edit mode, which apps now receive in their context
  (`mode`).

## Consequences

- The viewer shows template views out of the box, and the app platform is used
  for Studio's own features.
- The first-party apps are released with Studio; changing them means a Studio
  release.

## Alternatives considered

- **Built-in Vue components:** faster to write, but without the isolation and
  least authority that apps get, and without proving the platform.
- **Installation from a marketplace:** not available yet.
