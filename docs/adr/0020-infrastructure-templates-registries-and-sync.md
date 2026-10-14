# 0020: Infrastructure templates, registries, discovery and sync

- Status: Accepted
- Date: 2026-10-14
- Deciders: BaSyx Studio maintainers
- Requirements: DATA-001, DATA-002, DATA-017, DATA-020, SEC-008, UX-003

## Context

Until MVP-3, an infrastructure was a list of repository endpoints. Real AAS
infrastructures also run registries and a discovery service, and the BaSyx AAS
Web UI configures them as one of a few templates. Registries point to the
repositories that serve each shell and submodel, and some servers keep their
registries and discovery in step with their repositories while others leave
that to the clients that write.

## Decision

- **Templates.** As in the Web UI: `full` (every service with its own URL),
  `mono-all` (one AAS environment for everything), `mono-repo` (an AAS
  environment for the repositories, separate registries and discovery) and
  `identifiable` (an AAS repository only). The template is stored and decides
  which endpoint types the administrator may and must configure.
- **Endpoint types.** `aasEnvironment`, `aasRegistry`, `submodelRegistry`,
  `aasDiscovery`, `aasRepository`, `submodelRepository`,
  `conceptDescriptionRepository`. An environment serves the services that have
  no endpoint of their own, where the template allows it, plus the
  environment-only operations (upload, serialization).
- **List source.** With a registry and a repository, the administrator chooses
  where the shell list comes from (`registry` by default). There is no silent
  fallback when the registry is empty.
- **Resolution.** Shells and submodels are reached through the SDK's
  `AasService` and `SubmodelService`: the registry's descriptor endpoint, else
  the repository. With an AAS repository only, submodels are reached through
  the shell's superpath, so submodel requests name the open shell.
- **Base-URL rule.** A descriptor endpoint is used only if it lies under one of
  the infrastructure's configured URLs: same scheme, host and port, the base
  path as a prefix at a segment boundary, no credentials. Anything else is
  `blocked` and never contacted; the list marks such rows.
- **Sync.** Per infrastructure, whether the server keeps its registries and
  its discovery in step. Where it does not, the infrastructure's default
  (`autoCreate` or `dontCreate`) applies, and users may choose otherwise in
  their settings if the infrastructure allows it. With `autoCreate`, the BFF
  writes shell and submodel descriptors and asset links after an upload and
  removes the shell's after a delete. Each entry reports its outcome; a
  failure is shown and audited and never undoes the upload or delete.
- **Migration.** Migration `0003` gives existing infrastructures a template
  derived from their endpoints and the repository as list source.

## Consequences

- Registry-based infrastructures list descriptors without repository access,
  and a foreign descriptor cannot make Studio send credentials elsewhere.
- Descriptor writes after an upload are separate requests to independent
  services: they can partly fail, and Studio says so instead of pretending to
  be atomic.
- BaSyx Go with registry integration refuses to delete a shell whose
  descriptor is already missing (404 "AAS Descriptor not found"); Studio
  reports that as the delete's problem.
- The admin form and the contract grow with the templates; the Web UI's
  vocabulary keeps them recognizable.

## Alternatives considered

- **`AasService.getAasList` for the list:** one request per row and a silent
  fallback to the repository; too slow for large registries and misleading.
- **Following any descriptor URL:** turns registries into a way to direct
  Studio's credentialed requests at arbitrary hosts (SEC-008).
- **Always writing descriptors from Studio:** duplicates work where the server
  syncs itself and conflicts with it.
