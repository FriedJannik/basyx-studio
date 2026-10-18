# 0037: Infrastructures declared by the deployment, export and import

- Status: Accepted
- Date: 2026-10-18
- Deciders: BaSyx Studio maintainers
- Requirements: DATA-001, DATA-002, DEP-005, SEC-008
- Builds on: [ADR 0020](0020-infrastructure-templates-registries-and-sync.md)

## Context

Hosted deployments (Compose, Helm) need their BaSyx infrastructures from
configuration, not from clicks in the admin panel after every fresh install.
Administrators also want to move infrastructures between Studios. The BaSyx
AAS Web UI reads a `basyx-infra.yml`, but in its own schema.

## Decision

- **Format.** YAML with `version: 1` and a list `infrastructures`; each entry
  has the fields of the infrastructure API input (`infrastructureInputSchema`)
  plus a stable `key`. Unknown fields are errors. Secrets follow the API's
  rules: hosted Studio accepts only `env:`/`file:` references.
- **Declared infrastructures.** `STUDIO_INFRASTRUCTURES_FILE` and the inline
  `STUDIO_INFRASTRUCTURES` are applied at every start: created, updated in
  place under their ID (preferences and credentials stay attached), and
  removed when no longer declared. They are *managed*: read-only in the UI and
  rejected by the API. Infrastructures made in Studio are never touched.
  Validation is static (endpoints may start after Studio); the first load
  probes them. An HMAC digest skips unchanged entries; an advisory lock keeps
  replicas from racing. Any invalid entry fails the start and changes nothing.
- **Fixed deployments.** `STUDIO_INFRASTRUCTURES_EDITABLE=false` stops
  administrators from creating, changing, deleting or importing any
  infrastructure.
- **Export and import.** The same format: export all or one entry; stored
  secrets and certificates never leave Studio and are replaced by a comment.
  Import takes pasted or dropped YAML (keys optional), checks it in a dry run
  while the user types, and creates or replaces entries one by one as ordinary
  infrastructures, each probed like a save in the form.

## Consequences

- A Helm chart puts the file into a ConfigMap and the secrets into a Secret.
- A file entry cannot be changed in the UI; changes go through the
  deployment, as they should for GitOps.
- Imports are not atomic: one entry can fail while others are saved, and the
  dialog says so per entry.

## Alternatives considered

- **The Web UI's `basyx-infra.yml`:** its security modes (basic, bearer,
  custom header) have no counterpart in Studio, and a second schema would
  drift from the API.
- **Seed once, then editable:** the deployment and the database disagree
  after the first edit.
- **Plain secret values in the file:** would put secrets into ConfigMaps and
  the database; references keep them in the deployment's secret store.
