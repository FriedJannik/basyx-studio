# BaSyx Studio Setup Guide

This guide describes the target technical setup of BaSyx Studio, based on the
[product requirements](docs/requirements.md), the
[accepted ADRs](docs/adr/README.md) and the
[architecture documentation](docs/architecture/overview.md). It covers the three
prioritized deployment variants:

1. Hosted web Studio with one or more live AAS infrastructures
2. Desktop Studio with live AAS infrastructures
3. Desktop Studio with a local AASX workspace

The app platform, graphical views, security, tests and observability are set up
as cross-cutting functions.

> **Important repository status:** At this stage, no `package.json`, no
> `pnpm-lock.yaml`, no application sources and no Compose files are checked in.
> `pnpm install`, `pnpm dev` and the profiles described below can therefore only
> run after the one-time project bootstrap has been done as a separate,
> reviewable implementation step. This guide does not invent scripts or
> configuration names that do not exist yet.

## 1. Architecture rules before setup

The setup must follow these rules:

- The browser and the Electron renderer talk only to the versioned Studio API.
  OAuth tokens, refresh tokens and client secrets stay in the BFF.
- Live AAS access runs server-side through `basyx-typescript-sdk`.
- Metadata lives in PostgreSQL: hosted in a PostgreSQL server, on the desktop in
  embedded PGlite (ADR 0011); AASX files live in the user-controlled file
  system.
- The Studio Service remains a modular Nuxt/Nitro deployable. The Workspace
  Worker and the App Runner are separate processes because of their trust and
  crash boundaries.
- HTTP is the default for queries and commands, SSE for one-way progress and
  invalidation events. WebSockets require a concrete, documented bidirectional
  use case.
- AAS models are checked with AAS Core or qualified package validation, not with
  a parallel Zod metamodel.
- Installed apps and app widgets never run in the Studio Service process or in
  the trusted renderer context.
- Redis, MongoDB, Kafka, MQTT, Kubernetes, service mesh, GraphQL, TanStack Query,
  Module Federation and a separate dashboard backend are not baseline
  dependencies.

See in particular
[ADR 0001](docs/adr/0001-runtime-and-service-boundaries.md),
[ADR 0002](docs/adr/0002-bff-and-authentication.md),
[ADR 0005](docs/adr/0005-storage-and-observability.md),
[ADR 0007](docs/adr/0007-http-and-realtime-transports.md) and
[ADR 0008](docs/adr/0008-evolutionary-architecture-and-dependencies.md).

## 2. Choose a setup profile

Not every local installation needs all external services.

| Profile | Requires | Covers |
| --- | --- | --- |
| `web` | Node.js, PNPM, Studio Service | UI, BFF and SSR development |
| `hosted-live` | `web`, Docker/Compose, PostgreSQL, OIDC test IdP, one or more BaSyx Go test infrastructures | DEP-001, DEP-005, DATA-001/002/011–016, SEC-001–008 |
| `desktop-live` | `web`, Electron toolchain, PGlite, OS keychain, OIDC test IdP and a reachable BaSyx infrastructure | DEP-003, DEP-006–008, SEC-007/009 |
| `desktop-aasx` | `web`, Electron toolchain, PGlite and, later, a qualified Workspace Worker/package engine | DEP-004, DATA-005–007/009 |
| `apps` | OCI registry, Cosign/Sigstore tools, Deno evaluation runtime and isolated runners | APP-001–016 |
| `observability` | OTel Collector, Prometheus, Tempo, Loki, Alloy and Grafana | OPS-004–006 |

Recommendation for daily development: start with `web`, `hosted-live` and the
desktop variant relevant to the current feature. The app platform and the full
observability stack only need to run when the vertical slice being worked on
uses them.

### 2.1 Complete dependency inventory

The following table consolidates the dependencies named in the technical
documents. "Accepted" means architecture baseline; version numbers are fixed
after a compatibility check in `pnpm-lock.yaml` or in the container/tooling
lock.

| Area | Dependency | Status/installation |
| --- | --- | --- |
| Runtime | Node.js, Corepack, PNPM | Accepted; Node.js 22 or later, one approved LTS version everywhere |
| UI/BFF | Vue 3, Nuxt 4, Nitro/H3, TypeScript | Accepted; Nitro/H3 comes with Nuxt, no second BFF framework |
| UI system | Vuetify, Material Design Icons | Accepted |
| Client state | Pinia | Accepted |
| Complex remote state | Pinia Colada plus Nuxt module | Accepted, but only per feature |
| Studio validation | Zod | Accepted for TypeScript-owned trust boundaries |
| Public schemas | JSON Schema 2020-12, Ajv | Accepted; `ajv-formats` for required standard formats |
| Live AAS | `basyx-typescript-sdk` | Mandatory for live access |
| AAS model | `@aas-core-works/aas-core3.1-typescript` | Mandatory peer matching the SDK |
| Hosted data | PostgreSQL | Accepted baseline with its own Studio user/schema |
| Desktop data | PGlite (embedded PostgreSQL) and user file system | ADR 0011; qualification gate in phase 0 of MVP-1, fallback `embedded-postgres` |
| DB access | Drizzle ORM/query builder | Candidate, do not install automatically yet |
| Background jobs | Node workers, PostgreSQL job records; Graphile Worker if needed | Process/DB baseline accepted, queue library only on concrete need |
| Desktop | Electron, Electron Builder, Electron Updater, `safeStorage` | Accepted; `safeStorage` is part of Electron |
| AASX | separate Workspace Worker, AAS package library, AAS Core | Boundary accepted; package engine still open |
| App backend | Deno plus process/container isolation | Preferred evaluation target, still to be qualified |
| App distribution | OCI registry | Accepted |
| App trust | Sigstore/Cosign, CycloneDX or SPDX | Accepted signature/provenance/SBOM direction |
| Logging | Pino | Accepted for structured Node JSON logs |
| Telemetry in code | OpenTelemetry Node SDK, OTLP Protobuf exporter, HTTP/Undici/PostgreSQL instrumentation | Accepted, install selectively only |
| Telemetry platform | OTel Collector, Prometheus, Tempo, Loki, Alloy, Grafana | Reuse the existing BaSyx Go stack |
| Unit/component | Vitest, Vue Test Utils, Nuxt Test Utils | Accepted |
| Browser/E2E | Playwright | Accepted |
| Integration | Testcontainers, OIDC test provider, qualified BaSyx targets | Accepted; Keycloak only as reference IdP |
| API contract | OpenAPI 3.1 | Generate later from authoritative routes/contracts, no duplicate hand-written model |
| Views | Vue/Vuetify and JSON Schema/Ajv | Accepted; layout/drag-and-drop library still open |

Future internal packages such as `@basyx/studio-sdk`,
`@basyx/studio-protocol`, `@basyx/studio-semantic` and
`@basyx/studio-view-schema` are not created empty in advance. They are only
extracted from a real workflow with at least one real consumer.

## 3. Install system prerequisites

### 3.1 Required tools

- Git
- Node.js 22 or later; the same approved even-numbered LTS version for CI and
  development. Nuxt 4 currently requires at least Node.js 22; see the
  [official Nuxt installation](https://nuxt.com/docs/4.x/getting-started/installation).
- Corepack and PNPM; `pnpm-lock.yaml` is the only JavaScript lockfile. npm,
  Yarn, Bun and other package managers are forbidden in the project.
- Docker Engine or Docker Desktop with Docker Compose v2 for the hosted,
  integration and observability profiles

Check versions:

```bash
git --version
node --version
corepack --version
docker version
docker compose version
```

Enable PNPM through Corepack:

```bash
corepack enable pnpm
pnpm --version
```

Once the bootstrap has set a PNPM version in the `packageManager` field of
`package.json`, exactly this version must be used locally, in CI, in container
builds and in release builds. No `package-lock.json`, `yarn.lock`, `bun.lock` or
other additional lockfile may be committed.

#### 3.1.1 Mandatory PNPM supply-chain hardening

The hardening adopts the pattern established in `basyx-aas-web-ui` and extends
it with the strict configuration PNPM offers today:

1. `package.json` lists PNPM as an exactly pinned dev dependency and, with
   SHA-512 integrity, in the `packageManager` field, for example
   `pnpm@X.Y.Z+sha512.HASH`.
2. A shared setup check runs `corepack enable pnpm`, reads `packageManager`,
   checks the `pnpm@` prefix and aborts if `pnpm --version` does not match the
   pinned version.
3. `pnpm-lock.yaml` is committed. CI, Docker and releases install only with
   `pnpm install --frozen-lockfile`.
4. `pnpm-workspace.yaml` enforces at least the following baseline:

```yaml
packages:
  - "."
  - "packages/*"
  - "services/*"

minimumReleaseAge: 1440
minimumReleaseAgeStrict: true
strictDepBuilds: true
blockExoticSubdeps: true
trustLockfile: false

allowBuilds: {}
```

`allowBuilds` starts empty. When a dependency needs a legitimate build, install
or postinstall step, only that dependency is added after review. The approval
records the package/version or immutable source, purpose, risk and reviewer.
`pnpm approve-builds` must not be run blindly for all pending entries;
`dangerouslyAllowAllBuilds` is forbidden.

The explicit 1,440 minutes create a 24-hour window in which newly published
compromised versions can be detected and removed from the registry.
`minimumReleaseAgeStrict: true` prevents a silent fallback to a version that is
too young. `blockExoticSubdeps` prevents unexpected transitive Git/tarball
sources. `trustLockfile: false` makes PNPM apply the supply-chain rules to
submitted lockfiles again.

Exceptions to the waiting period exist only for reviewed releases of Eclipse
BaSyx and Eclipse AAS Core Works packages, and only for the exact version in
`minimumReleaseAgeExclude`, such as `basyx-typescript-sdk@2.4.1`
([ADR 0012](docs/adr/0012-release-age-exceptions-for-basyx-packages.md),
[ADR 0031](docs/adr/0031-release-age-exceptions-for-aas-core-works-packages.md)).
Their dependencies still wait 24 hours.

For multiple registries, PNPM named registries are used so that the origin is
bound in the lockfile. Registry credentials belong only in the trusted user/CI
configuration; they must not appear in `pnpm-workspace.yaml` or in a committed
`.npmrc`.

Dependency update PRs must review together:

- the manifest and the complete `pnpm-lock.yaml` diff
- changes to `allowBuilds`
- the PNPM dev dependency and the integrity-pinned `packageManager` field
- licenses, advisories, transitive dependencies and provenance
- an SBOM from a scanner that understands the complete PNPM lockfile

As in the reference project, CI actions are pinned to full commit SHAs. Release
images receive BuildKit provenance, SPDX/CycloneDX SBOMs, vulnerability scans
and Cosign signatures on the immutable digest. See
[ADR 0010](docs/adr/0010-pnpm-only-supply-chain.md) and the
[PNPM supply-chain recommendations](https://pnpm.io/supply-chain-security).

### 3.2 Additional desktop tools

- macOS: Xcode Command Line Tools; for releases, an Apple certificate and
  notarization access
- Windows: Visual Studio Build Tools, if a qualified native package dependency
  needs them; for releases, a code-signing certificate
- Linux: the system libraries Electron needs for the target distribution
- Access to the respective OS keychain/secret store for Electron `safeStorage`

Check or install the macOS tools:

```bash
xcode-select -p
xcode-select --install
```

Release signing is not needed for local development builds, but it is mandatory
for published desktop installers and updates.

### 3.3 Additional app platform tools

- Deno as the preferred default backend runtime target, still to be qualified
- an OCI-compatible registry
- Cosign/Sigstore-compatible signing and attestation tools
- SBOM generation in CycloneDX or SPDX format

Check the installation:

```bash
deno --version
cosign version
```

Deno does not replace container/OS isolation for untrusted code. Hosted backend
apps must additionally run in unprivileged, resource-limited containers or pods.

## 4. Check the repository

Run in the project root:

```bash
git status --short
git branch --show-current
test -f package.json && echo "package.json present" || echo "bootstrap required"
test -f pnpm-lock.yaml && echo "pnpm-lock.yaml present" || echo "lockfile missing"
```

Unrelated local changes must not be overwritten. In the current docs-only state,
the output `bootstrap required`/`lockfile missing` is expected.

## 5. One-time project bootstrap

The team runs this section only once, and it is reviewed as a separate pull
request. Anyone who only wants to use the repository locally skips it after the
later bootstrap commit and continues with section 6.

### 5.1 Generate the Nuxt foundation

The foundation is Vue 3, Nuxt 4, TypeScript, Nitro/H3 and Node.js. Because the
root already contains documentation, generate outside the root first and then
integrate the generated files deliberately in an implementation commit:

```bash
mkdir -p .bootstrap
pnpm dlx create-nuxt@X.Y.Z .bootstrap/studio
```

`X.Y.Z` is a previously reviewed version of the Nuxt starter that is at least
24 hours old. The one-time bootstrap does not use an unpinned `latest` or
`pnpm create` call.

After that, at least `package.json`, `pnpm-lock.yaml`, the Nuxt configuration,
the TypeScript configuration and the real app structure must be reviewed and
adopted. `.bootstrap/` is temporary and must not be committed. Do not blindly
overwrite the project root.

The bootstrap then pins a reviewed PNPM version exactly. The same version number
appears as a dev dependency and, together with the SHA-512 hash verified from
`dist.integrity`, in the `packageManager` field:

```bash
pnpm add -D --save-exact pnpm@X.Y.Z
pnpm view pnpm@X.Y.Z dist.integrity
```

As in `basyx-aas-web-ui`, the hash is converted automatically from the registry
response and written in the form `pnpm@X.Y.Z+sha512.HASH`. A reviewable CI
workflow synchronizes the field on PNPM updates, and the setup check aborts on
any version mismatch. `X.Y.Z` is chosen deliberately during the bootstrap; this
guide does not pin an unreviewed future version in advance.

After the integration:

```bash
pnpm install
pnpm dev
```

The expected development endpoint of a standard Nuxt setup is
`http://localhost:3000`. A different port must be documented through the real
project configuration.

### 5.2 Add the accepted core dependencies

The following packages make up the accepted UI, state and validation stack:

```bash
pnpm add nuxt@^4 vue@^3 vue-router@^4 vuetify @mdi/font
pnpm add pinia @pinia/nuxt
pnpm add @pinia/colada @pinia/colada-nuxt
pnpm add zod ajv ajv-formats
pnpm add -D typescript vite-plugin-vuetify sass
```

The following applies:

- Local component state: Vue Composition API
- UI selection, active target, drafts and undo/redo: Pinia
- Simple SSR/route data: Nuxt `useFetch`/`useAsyncData`
- Pinia Colada only for complex, shared remote state; every AAS query key
  contains the target kind, the target ID and all query variables
- Zod only at Studio-owned TypeScript trust boundaries
- Ajv/JSON Schema 2020-12 for public manifest, capability and view contracts

If Nuxt/Vuetify requires a different officially supported integration at
bootstrap time, the choice must be qualified against
[ADR 0008](docs/adr/0008-evolutionary-architecture-and-dependencies.md)
and fixed in the lockfile.

### 5.3 Add the live AAS dependencies

Before installing, check the SDK peer dependencies:

```bash
pnpm view basyx-typescript-sdk versions --json
pnpm view basyx-typescript-sdk peerDependencies --json
```

Then use approved, mutually compatible versions:

```bash
pnpm add basyx-typescript-sdk@X.Y.Z
pnpm add @aas-core-works/aas-core3.1-typescript@A.B.C
```

`X.Y.Z` and `A.B.C` are deliberately not made-up version numbers. The chosen SDK
version and its AAS Core 3.1 peer version must be fixed together in
`pnpm-lock.yaml`. Before core feature work, a compatibility test against the
repository, registry, discovery, AASX File Server and the required semantic SDK
functions is required.

SDK clients run only in the Studio Service. Never initialize the SDK with
downstream credentials in the browser, the renderer or a UI app.

### 5.4 Set up hosted persistence

PostgreSQL is the accepted baseline for hosted metadata, sessions,
infrastructure configuration, apps, views, ACLs, operation records and audit.

Once the repository contains a reviewed Compose file:

```bash
docker compose up -d postgres
docker compose ps
docker compose logs postgres
```

For the database, configure at least separate values for the database name, the
Studio user and the password as local secrets. Production secrets come from the
secret manager of the target platform, not from client-side runtime config or
ordinary database columns.

Data access is not finally decided yet. Drizzle is a candidate, not an accepted
default. Before installing it, a vertical slice must prove the following:

- ordered migrations from at least N−2 supported versions
- transactions and PostgreSQL row locking
- one PostgreSQL schema and one migration chain for PostgreSQL server and PGlite
- Electron packaging on all target operating systems
- a documented exit/migration path

Only after this qualification would an implementation step such as the following
be allowed:

```bash
pnpm add drizzle-orm
pnpm add -D drizzle-kit
```

The planned drivers are `node-postgres` (hosted) and `pglite` (desktop and
tests) (ADR 0011); both are qualified with this slice.

### 5.5 Add Electron and desktop dependencies

For the desktop host:

```bash
pnpm add electron-updater
pnpm add -D electron electron-builder
```

The Electron setup is only correct once the following properties are
implemented and tested:

- renderer sandbox enabled, `contextIsolation` enabled, no Node integration
- a minimal, schema-validated preload/IPC bridge
- a local Studio Service on a dynamic loopback port
- a one-time launch secret between Electron and the local Studio Service
- explicit readiness, shutdown and crash supervision
- OS-protected secret storage with Electron `safeStorage`
- signed/notarized installers and signed updates
- upgrade, migration and rollback tests for the current, N−1 and N−2 versions

For `desktop-aasx`, a separately supervised Workspace Worker is added. The AASX
package engine has not been chosen yet and may only be installed after it passes
round-trip qualification. The tests must cover AAS, submodels, concept
descriptions, XML/JSON, supplementary files, thumbnails, unusual valid paths,
metamodel versions, atomic saving and recovery.

### 5.6 Add observability dependencies

Install only the Node instrumentations that are needed, not the entire
auto-instrumentation package:

```bash
pnpm add pino
pnpm add @opentelemetry/api @opentelemetry/sdk-node
pnpm add @opentelemetry/exporter-trace-otlp-proto
pnpm add @opentelemetry/exporter-metrics-otlp-proto
pnpm add @opentelemetry/instrumentation-http
pnpm add @opentelemetry/instrumentation-undici
pnpm add @opentelemetry/instrumentation-pg
```

OpenTelemetry must be initialized before the Nitro application loads. The
platform side uses the existing BaSyx stack:

- OpenTelemetry Collector
- Prometheus
- Tempo
- Loki
- Grafana Alloy
- Grafana

Once a Compose observability profile is checked in:

```bash
docker compose --profile observability up -d
docker compose --profile observability ps
```

After a validated startup configuration, telemetry is fail-open. A collector
outage must not block AAS requests, package saves or app execution. Browser
telemetry is not part of the first increment; desktop telemetry is disabled by
default.

### 5.7 Add test dependencies

```bash
pnpm add -D vitest @vue/test-utils @nuxt/test-utils happy-dom
pnpm add -D @playwright/test testcontainers
pnpm exec playwright install
```

The test pyramid must contain at least:

- unit and component tests with Vitest, Vue Test Utils and Nuxt Test Utils
- hosted and Electron-relevant browser flows with Playwright
- integration tests with Testcontainers for PostgreSQL
- a standards-based OIDC test provider; Keycloak is the reference, but the
  application stays generically OIDC-compatible
- qualified BaSyx test targets for repository, registry, discovery and copy
- an AASX golden corpus and semantic round-trip comparisons
- contract tests for the Studio SDK, capability RPC, the local target API, app
  manifests and declarative view schemas

### 5.8 App platform and graphical views

The app platform needs, outside the Studio process:

- a separate/opaque UI app origin with sandboxed iframes
- a Deno evaluation runtime for default backend apps
- hosted runners isolated and resource-limited per app/version
- an OCI registry for immutable artifacts
- Cosign/Sigstore-compatible signatures and attestations
- `pnpm-lock.yaml` for app builds
- a CycloneDX or SPDX SBOM
- an isolated build, scan and review pipeline

Runtime installations or `pnpm add` in an installed app or in the Studio Service
are forbidden. Dependencies are locked, scanned and bundled into an immutable
artifact only with PNPM during the isolated build. App sources may declare npm
packages as ecosystem dependencies, but npm, Yarn, Bun or other package managers
are not run.

For graphical views, Ajv/JSON Schema and the existing Studio stack are the
baseline. Do not install a large layout, drag-and-drop or low-code library in
advance. A candidate must first prove keyboard operability, responsive layouts,
stable serialization, Vue/Nuxt compatibility, bundle cost and the Studio code it
actually removes in a vertical slice.

## 6. Daily setup after the bootstrap exists

Once `package.json`, `pnpm-lock.yaml` and the related scripts are checked in:

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm dev
```

Production build and local preview:

```bash
pnpm build
pnpm preview
```

Expected scripts for desktop development, once implemented:

```bash
pnpm dev:electron
pnpm build:electron
```

Expected quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

These names are a goal for the bootstrap. Until then, always check which scripts
actually exist with the following command:

```bash
pnpm run
```

## 7. Start local infrastructure per use case

For the MVP-1 slice, a validated test environment already exists with
PostgreSQL, an OIDC test IdP (Keycloak), and one unsecured and one secured
BaSyx Go target. [test-setup/README.md](test-setup/README.md) describes its
structure, users, IdP configuration per runtime and the Entra ID mapping:

```bash
pnpm testenv:up
pnpm testenv:smoke
pnpm testenv:down
```

The following commands assume validated Compose profiles that will be checked in
later. Until these files exist, they must not be documented as a working current
state or used in CI.

### 7.1 Hosted Studio with live AAS

```bash
docker compose --profile hosted-live up -d
docker compose --profile hosted-live ps
pnpm dev
```

The profile is meant to contain:

- PostgreSQL with a Studio-owned schema/user
- a standards-based OIDC test provider
- at least one BaSyx Go test infrastructure
- optionally a second, independently authenticated infrastructure for target
  switching and cross-target copy
- optionally the shared observability profile

### 7.2 Desktop Studio with live AAS

```bash
docker compose --profile desktop-live up -d
pnpm dev:electron
```

The desktop app connects through its local BFF to internet, private network or
localhost/Docker targets. Private and loopback addresses must be allowed
explicitly; SSRF, redirect, timeout and response limits stay active regardless.

### 7.3 Desktop Studio with local AASX

```bash
pnpm dev:electron
```

This use case does not need a BaSyx server. The renderer must not receive
arbitrary file paths. Native dialogs return constrained handles; the Workspace
Worker handles import, validation, revisions, recovery and atomic saving.

### 7.4 App platform

```bash
docker compose --profile apps up -d
docker compose --profile apps ps
```

The profile is meant to contain the registry, a test catalogue, isolated runners
and the required signing/verification chain. App assets must be loaded from a
different origin than the Studio UI.

### 7.5 Observability

```bash
docker compose --profile observability up -d
docker compose --profile observability ps
```

Studio, the App Runner and BaSyx Go send OTLP/HTTP to the collector; JSON logs go
to `stderr` and are picked up by Alloy. Tempo is the trace backend. No additional
Jaeger stack is required.

## 8. Configuration and secrets

The concrete variable names must be defined by the later, Zod-validated
configuration layer and documented in a `.env.example`. Until then, no invented
environment variables are binding.

The following configuration groups are required:

- the public Studio base URL and server-side session/cookie settings
- the PostgreSQL connection or the PGlite data directory
- secret manager/keychain integration
- OIDC discovery, client ID, redirect URI and server-side client secret
- per AAS target: opaque ID, allowed endpoints, auth strategy and
  capability/metamodel metadata
- the outbound allowlist, scheme/port/private network policy, timeouts,
  redirect and size limits
- the OTLP endpoint and bounded service resource attributes
- marketplace/OCI/signature trust anchors
- the desktop update channel and signature metadata

Rules:

- Local secrets only in unversioned `.env` files or in the OS keychain
- Production secrets only through the deployment secret manager
- No tokens, cookies, client secrets, DB DSNs or file paths in the public Nuxt
  runtime configuration
- No secrets, authorization headers, request/response bodies or AASX content in
  logs, traces or metrics
- Only a secret-free `.env.example` is committed

## 9. Verify the setup

### 9.1 Static and build checks

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### 9.2 Hosted live smoke test

Check that:

1. Login through Authorization Code + PKCE works.
2. The browser receives only a Secure/HttpOnly session cookie and no downstream
   tokens.
3. At least two targets keep separate sessions, credentials and cache
   namespaces.
4. SDK-based repository, registry and discovery queries work.
5. Switching targets does not leak data or drafts into the other target.
6. Cross-target copy first shows a plan, leaves the source unchanged and reports
   partial results correctly.

### 9.3 Desktop live smoke test

Check that:

1. Electron starts the local Studio Service on a random loopback port.
2. The renderer sandbox, context isolation and minimal validated IPC are active.
3. OIDC uses the system browser and secrets stay in the OS-protected store.
4. localhost/Docker and remote targets are reachable only through the local BFF.

### 9.4 Desktop AASX smoke test

Check that:

1. Opening and saving run only through native, constrained file/workspace
   handles.
2. Malformed archives, path traversal, absolute paths, decompression bombs,
   size/entry limits and timeouts are rejected.
3. Import, editing, atomic save, reopen and AAS Core validation pass the golden
   corpus.
4. A conflict keeps the user's draft and reports a structured revision.

### 9.5 Apps/views smoke test

Check that:

1. Digest, signature, compatibility, revocation and permissions are checked
   before activation.
2. UI apps and widgets stay cross-origin sandboxed.
3. Backend apps run outside the Studio Service with deny-by-default rights.
4. Capability calls are authorized and audited per app, user, target and
   operation and never return infrastructure tokens.
5. View definitions are purely declarative and missing apps/bindings degrade
   only the affected widget.

### 9.6 Observability smoke test

Check that:

1. `traceparent`, `tracestate`, `X-Request-ID` and `X-Correlation-ID` are
   propagated to BaSyx Go.
2. Requests, the PostgreSQL pool, and copy, view and app operations produce
   bounded signals.
3. User, workspace, shell, submodel or package IDs do not become unbounded
   metric labels.
4. A collector outage does not block any product operation.

## 10. Dependency gates and deliberately uninstalled components

| Component | Status | Condition for adoption |
| --- | --- | --- |
| Drizzle | Candidate | Prove migrations, locking, both DBs and Electron packaging in the slice |
| Graphile Worker/other PostgreSQL queue | Candidate | A concrete retry/concurrency/durability requirement |
| AASX package engine | Open | Pass golden round trip, security, recovery and cross-platform packaging |
| Layout/drag-and-drop library | Open | Prove accessibility, serialization, bundle cost and avoided code |
| Deno backend runtime | Preferred evaluation | Qualify deny-by-default plus process/container isolation in practice |
| Redis/broker | Not baseline | A measured scaling/durability gap and a new ADR |
| Kubernetes/service mesh | Not baseline | A measured hosted scale need and a new ADR |
| WebSockets | Not default | A documented bidirectional use case with protocol and operating rules |
| Browser OpenTelemetry | Deferred | A privacy and operational-value decision |

Every new major dependency, runtime, database or service must document the code
it removes or the risk it reduces, alternatives, transitive dependencies,
license, maintenance, security history, operating effort and exit strategy. A
cross-cutting change requires a new or superseding ADR.

## 11. Definition of done for a complete setup

The project counts as technically fully set up when:

- `package.json`, `pnpm-lock.yaml`, reproducible PNPM scripts and a secret-free
  `.env.example` exist;
- hosted Studio starts with PostgreSQL, OIDC and at least one BaSyx test target;
- Electron starts the same UI/API path with a hardened local BFF;
- the qualified Workspace Worker processes an AASX golden corpus safely;
- app artifacts can be built, signed, verified and run in isolation;
- views are stored declaratively and rendered through the same capability/target
  path;
- lint, typecheck, tests, build, integration, security and N−2 migration tests
  succeed;
- logs, traces and metrics correlate with the BaSyx Grafana stack without
  capturing secrets or unbounded domain identifiers.

Until these artifacts are implemented and checked in, this document is the setup
plan of the target architecture and not a claim that the current docs-only state
is already runnable.
