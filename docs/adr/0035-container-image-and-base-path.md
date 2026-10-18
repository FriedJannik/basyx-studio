# 0035: Container image and base path

- Status: Accepted
- Date: 2026-10-18
- Deciders: BaSyx Studio maintainers
- Requirements: DEP-001, DEP-005, SEC-001

## Context

Hosted Studio is to run on Docker Compose and Kubernetes (a Helm chart in
`eclipse-basyx/charts`) like the other BaSyx components, often behind an
ingress that serves several applications on one host under sub-paths. The
BaSyx AAS Web UI bakes placeholders into its build and rewrites the built
files with `sed` at container start, which breaks on restart of the same
container and on values with special characters.

## Decision

- **One image** (`eclipsebasyx/basyx-studio`, `linux/amd64` and
  `linux/arm64`): a Node runtime stage with the Nitro output, Deno for backend
  apps from the multi-arch `denoland/deno:bin` image, user `node` (uid 1000),
  `/data` as the only writable path besides `/tmp`, and a health check. All
  configuration comes from environment variables; secrets also as `*_FILE`.
- **Base path at runtime.** `STUDIO_BASE_PATH` (normalized by the image's
  launcher `docker/start.mjs` into Nuxt's `NUXT_APP_BASE_URL`) serves pages,
  assets, the API, the OIDC callback, app files and backend app calls under
  the path; nothing in the built files is rewritten. Plain links in the UI go
  through `useStudioUrl()`; an ESLint rule keeps `apiBasePath` out of other UI
  code. `STUDIO_PUBLIC_URL` stays an origin and may repeat the base path, but
  must not contradict it.
- **Session cookie.** The `__Host-` prefix requires `Path=/`, so a Studio
  under a base path keeps the prefix and gets its own cookie name, derived
  from a hash of the whole base path, instead of a narrower path.
- **Health.** `<base>/health/live` answers without the Studio runtime;
  `<base>/health/ready` checks configuration, migrations and the database.
  A hosted service with an invalid configuration exits with code 1.
- **Workflows.** A snapshot image on every push to `main`, a release image on
  every GitHub release, both signed with cosign and shipped with SBOM and
  provenance as for the BaSyx AAS Web UI.

## Consequences

- One image runs at `/` and under any path, and restarts are idempotent.
- Two Studios can share one origin under different paths without sharing
  sessions; they still share the origin as a security boundary.
- Every new plain URL in the UI must use `useStudioUrl()`.

## Alternatives considered

- **Placeholders replaced at start (BaSyx AAS Web UI):** rewrites the image's
  files, is not idempotent and needs a writable root file system.
- **A build per base path:** one image per deployment path is not shippable.
- **Cookie `Path` set to the base path:** forbidden with `__Host-`, and
  dropping the prefix allows cookie tossing from sibling subdomains.
