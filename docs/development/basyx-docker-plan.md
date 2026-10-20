# BaSyx Docker plan: local BaSyx instances from Studio

- Status: Implemented; engine and OS qualification (phase G) open, so
  [ADR 0033](../adr/0033-desktop-container-capability.md) stays *Proposed*
- Date: 2026-10-17
- Depends on: infrastructure templates
  ([ADR 0020](../adr/0020-infrastructure-templates-registries-and-sync.md)),
  file grants ([ADR 0015](../adr/0015-desktop-native-bridge-and-file-grants.md))
  and the new container capability
  ([ADR 0033](../adr/0033-desktop-container-capability.md))
- Scope decision gate: BaSyx Go only; Docker and Podman through the Engine
  REST API; a native desktop-only Studio feature; v1 with the
  *Secured* preset (ABAC and ReBAC), registration as an infrastructure, export
  and import

## Goal

A desktop user with no container knowledge gets a running BaSyx server and
opens it in Studio within a few clicks, and can hand the same setup to a
colleague as a compose project.

> on the desktop, a user opens *BaSyx Docker* → Studio says that it
> found Docker Desktop (or Podman, or explains how to get one) → *New BaSyx*
> → picks *Quick start* or *Secured* → gives it a name, keeps
> the defaults, optionally adds AASX files → *Start* and watches download,
> start and health check → *Open in Studio* opens the new infrastructure
> with the AASX files loaded → later stops, starts, reads logs, exports it as
> a ZIP, imports it again or deletes it, with or without its data

## Starting point

- **Apps:** modules with `context: global` are listed under *Apps* without a
  target (`app/pages/apps/[installationId]/[route]/[...subPath].vue`).
  Manifests declare `runtimes` (`hosted`, `desktop`) and permissions from a
  fixed list (`packages/studio-sdk/app-manifest.schema.json`,
  `packages/studio-sdk/src/protocol.ts`). Bundled apps are built by
  `pnpm apps:bundle` from `apps/`.
- **Desktop bridge:** the preload offers `chooseAasxFile` and
  `chooseSaveLocation`; grants are limited to `.aasx`
  (`electron/main.ts`, `server/api/studio/v1/desktop/file-grants.post.ts`).
- **Infrastructures:** created through `POST /infrastructures` with a
  template, endpoints and a security mode (`unsecured`,
  `deployment_client_credentials`, `delegated_user` with issuer and client
  ID) (`shared/contract/infrastructure.ts`).
- **BaSyx Go setups we already run:** `test-setup/docker-compose.yaml`
  (Postgres, configuration service, AAS environment with registry
  integration, history and event feed; a secured variant with Keycloak,
  ABAC, trust list and `keycloak.localhost` mapped to the host gateway) and
  the ReBAC example in `basyx-go-components`
  (`REBAC_ENABLED`, `REBAC_ADMINISTRATORS`, ABAC and OIDC required).
- **Starter kit:** the basyx.org starter kit asks questions and downloads a
  ZIP with compose file, configuration and AASX files; it targets the Java
  server. This app follows its idea for BaSyx Go and runs the result as well.

## Decisions

Made on 2026-10-17. Items marked *assumption* were proposed with the plan and
not discussed individually; they hold unless changed.

### Scope

| # | Topic | Decision |
| --- | --- | --- |
| S1 | Implementation | BaSyx Go images only (`eclipsebasyx/*-go`), as in the test environment. The BaSyx Java server is out of scope. |
| S2 | Engines | Docker (Docker Desktop, Docker Engine) and Podman (Podman Desktop, `podman machine`, rootless and rootful on Linux) through the Docker Engine REST API; no compose CLI ([ADR 0033](../adr/0033-desktop-container-capability.md)). |
| S3 | Placement | A native desktop-only page at `/docker`, with its UI in `app/components/basyx-docker/` and a fixed navigation item. |
| S4 | v1 features | Presets *Quick start* and *Secured* with ABAC or ReBAC; the separate-service topology remains under *Advanced* for existing and expert configurations. Registration as an infrastructure; export; import. The AAS Web UI container is not offered. |

### Presets and configuration

| # | Topic | Decision |
| --- | --- | --- |
| P1 | Quick start | Postgres, configuration service (one-shot schema setup) and one AAS environment with registry integration, history and event feed, unsecured. Infrastructure template `mono-all`. |
| P2 | Separate services (Advanced) | Postgres, configuration service, one AAS environment for the three repositories, and separate AAS registry, submodel registry and discovery services sharing the database. Repositories sync their registries. Template `mono-repo`. This is not a top-level preset. |
| P3 | Secured | The *Quick start* topology (or *Full*, under *Advanced*) with Keycloak and BaSyx security on every service: OIDC trust list for the stack's realm and an access model. Template as its topology, security `delegated_user`. |
| P4 | Access model | Chosen in the *Secured* step as two cards. *Roles (ABAC)*: generated access rules, `admin` may read and write, `viewer` may read. *Sharing (ReBAC)*: ABAC plus `REBAC_ENABLED=true` on every service, group `operators` as ReBAC administrators; users own what they create and share shells with Studio's *Share* dialog. |
| P5 | Users | The realm `basyx` gets a public PKCE client `basyx-studio` and users with generated passwords: with *Roles*, `admin` and `viewer`; with *Sharing*, `admin` (group `operators`) and the users `alice` and `bob`, so sharing between two people can be tried. The instance card shows them under *Sign-in details* with reveal and copy. |
| P6 | Persistence | *Keep my data* (default): a named Postgres volume per stack that survives stop and recreate. *Start empty every time*: no volume; data ends when the stack is removed. *Assumption.* |
| P7 | AASX files | Optional in step 2: AASX files picked through the host dialog are loaded at startup (`GENERAL_AAS_PRECONFIG_PATHS`). They are copied into Studio's data folder and into the container, never mounted. *Assumption.* |
| P8 | Ports | Free ports are chosen automatically from 18100 upwards, one block per stack, published on `127.0.0.1` only. *Advanced* allows fixed ports and *Reachable from other computers* (`0.0.0.0`) with a warning. *Assumption.* |
| P9 | Advanced | Collapsed by default: topology (P1/P2), ports (P8), history and event feed, registry sync, image channel (*Tested with this Studio*, pinned digests; or *Latest snapshot*), restart after reboot. *Assumption.* |
| P10 | Restart policy | `unless-stopped`, as in the export, so a stack the user did not stop comes back with the engine. *Assumption.* |
| P11 | Names | The stack name is free text (shown in Studio); container, network and volume names are derived from a slug and the stack ID. The infrastructure gets the stack name. |

### Engine and lifecycle

| # | Topic | Decision |
| --- | --- | --- |
| E1 | Discovery | As in [ADR 0033](../adr/0033-desktop-container-capability.md): settings, `DOCKER_HOST`, Docker sockets, Podman sockets; confirmed with `/_ping` and `/version`. With several engines, the first running one is used and the settings offer the others. |
| E2 | Engine missing or stopped | Not installed: a friendly empty state with links to Docker Desktop and Podman Desktop and *Check again*. Installed but not running: "Start Docker Desktop (or Podman) and come back", with *Check again* polling every 3 s while the page is visible. |
| E3 | Start | One job: create network and volumes, pull missing images with progress per image, create containers, copy configuration files in, start in dependency order (Postgres → configuration service finished → Keycloak ready → BaSyx services), then wait for readiness. |
| E4 | Readiness | The service probes each BaSyx endpoint's `/description` and Keycloak's `/realms/basyx/.well-known/openid-configuration` from the host, independent of engine health checks, with a 5-minute limit and the failing component named. |
| E5 | Stop, start, delete | Stop and start keep containers. Delete removes containers and network and asks "Also delete the data?" (volume) and "Also remove the infrastructure from Studio?" (UX-003). |
| E6 | Reconcile | On opening the page and every 5 s while visible, the list is rebuilt from the engine's labelled objects and the stored specs: *Running*, *Starting*, *Stopped*, *Partly running*, *Error* (with the component), *Removed outside Studio* (offer *Recreate*), *Found on this computer* (labelled but not stored, offer *Remove*). |
| E7 | Logs | Per component, the last 500 lines (`studio.containers.getLogs`, demultiplexed), refreshed on demand, with copy and *Save to file*. |
| E8 | Updates | When the catalogue pins newer digests than a stack uses, the card offers *Update*, which pulls and recreates the containers and keeps the volume. |

### Integration

| # | Topic | Decision |
| --- | --- | --- |
| I1 | Infrastructure | Created after the first successful start (ADR 0020 template from P1–P3, endpoints from the ports, list source `registry` where a registry exists). It is linked to the stack; ports changed under *Advanced* update its endpoints. |
| I2 | Open in Studio | Opens the linked infrastructure as a target through the Studio router; for *Secured*, Studio's sign-in starts against the stack's Keycloak. |
| I3 | Issuer | The issuer is `http://127.0.0.1:<port>/realms/basyx`. Keycloak uses `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`; the trust list discovers keys through `http://keycloak:8080` inside the network. No hosts-file entry or host gateway is required. |
| I4 | Redirect URI | Studio's desktop callback uses a random loopback port. The realm client allows the loopback callback; if Keycloak does not accept a port-independent loopback URI (phase 0), the service sets the current URI through Keycloak's admin API on each Studio start. |

### Export and import

| # | Topic | Decision |
| --- | --- | --- |
| X1 | Export | *Export* on a card saves a ZIP through the host dialog: `docker-compose.yml`, `.env` (generated passwords), `config/` (trust list, access rules, realm), `aasx/`, `data/database.dump`, `README.md` (how to start with `docker compose up -d` or `podman compose up -d`, which URLs and users), `basyx-stack.json`. The UI warns that the file contains passwords. |
| X2 | Compose content | Generated from the catalogue: the same images (by digest), environment, ports, depends-on conditions with health checks, the named volume and bind mounts of `config/` and `aasx/` (the export runs on any machine, so mounts are fine there). |
| X3 | Spec format | `basyx-stack.json`: `format: "basyx-stack/1"`, name, preset, topology, components, persistence, access model, ports, image channel and pinned digests, AASX file names. No secrets; `.env` carries them. |
| X4 | Import | *Import* on the list accepts the ZIP or a `basyx-stack.json`. It shows the review step of the wizard prefilled; ports in use are reassigned with a note; secrets come from `.env` when present, otherwise new ones are generated. Only `basyx-stack.json` is read; hand edits to the compose file are ignored, and the review says so. |

### Look and wording

| # | Topic | Decision |
| --- | --- | --- |
| U1 | Language | No container jargon on the main path: "BaSyx instance" instead of stack, "download" instead of pull, "address" instead of endpoint; technical names appear only under *Advanced*, *Logs* and in the export. All strings in all seven locales ([ADR 0026](../adr/0026-ui-translation.md)). |
| U2 | Errors | Each known failure has a sentence and an action: port in use (*Use port … instead*), engine stopped (*Check again*), image download failed (*Try again*, with the registry named), no disk space, a component did not get ready (*Show logs*). Unknown errors show the engine's message under *Details*. |
| U3 | Components | The feature is a lazy-loaded Nuxt page using Studio's Vuetify instance, aliases and defaults. It is built only from Vuetify components and utility classes: radio choices for presets and access models, `v-expansion-panels` for *Advanced*, `v-progress-linear` per image, cards with `v-chip` status for instances. No custom CSS (AGENTS.md). |
| U4 | Accessibility | Status is never colour alone (chip text and icon); progress is announced; every action is reachable by keyboard. |

## Design

### Engine check

```text
┌ BaSyx Docker ──────────────────────────────────────────────────────────┐
│ ✓ Docker Desktop 4.47 is running                       [Settings ⚙]   │
│                                                                        │
│ (or)  ⚠ No container engine found                                      │
│       BaSyx Docker needs Docker Desktop or Podman Desktop.             │
│       [Get Docker Desktop ↗]  [Get Podman Desktop ↗]  [Check again]    │
└────────────────────────────────────────────────────────────────────────┘
```

### Instance list

```text
┌ Your BaSyx instances                          [Import]  [+ New BaSyx] ┐
│ ┌ Demo line ─────────────────────────── ● Running ─────────────── ⋮ ┐ │
│ │ Quick start · data kept · http://127.0.0.1:18100                  │ │
│ │ [Open in Studio]  [Stop]  [Logs]  [Export]                        │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ ┌ Secured test ──────────────────────── ○ Stopped ─────────────── ⋮ ┐ │
│ │ Secured · Sharing (ReBAC) · ▸ Sign-in details                     │ │
│ │ [Start]  [Logs]  [Export]                                         │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Wizard

```text
 ① What do you need?   ② Name and data   ③ Check and start
┌──────────────────┐ ┌──────────────────┐
│ ⚡ Quick start    │ │ 🔒 Secured        │
│ One server,      │ │ Sign-in with     │
│ no sign-in.      │ │ users and        │
│ Best to try.     │ │ permissions.     │
└──────────────────┘ └──────────────────┘
  (Secured)  Who may do what?  [Roles (ABAC)]  [Sharing (ReBAC)]

 ② Name [Demo line]   ◉ Keep my data  ○ Start empty every time
    AASX files to load: [+ Add files]  nameplate.aasx ✕
    ▸ Advanced

 ③ "Demo line" runs one BaSyx server on this computer at
    http://127.0.0.1:18100, keeps its data and loads 1 AASX file.
    Downloads about 180 MB the first time.             [Back] [Start]
    ── downloading aasenvironment-go ███████░░░ 70 %
    ── starting · checking ✓ ✓ ○
```

### Code structure

- `app/pages/docker.vue` and `app/components/basyx-docker/`: native page and
  `App.vue` (engine check and
  instance list), `EngineStatus.vue`, `EngineMissing.vue`, `InstanceCard.vue`,
  `NewInstanceWizard.vue`, `JobProgress.vue`, `LogsPanel.vue`,
  `SignInDetails.vue`.
- `app/composables/useDockerClient.ts`: typed adapter for the native API,
  Studio navigation, notifications, clipboard and desktop file dialogs.
- `shared/contract/containers.ts`: Zod schemas for the stack spec, engine
  info, stack status, jobs and capability parameters.
- `server/lib/containers/`: `engine.ts` (REST client, quirks),
  `discovery.ts` (engine discovery), `catalog.ts` (components, digests),
  `plan.ts` (spec → networks, volumes, containers and their environment),
  `manager.ts` (lifecycle, ordering, readiness and reconciliation), `jobs.ts`
  (one job per stack, claimed before anything awaits), `ports.ts` (port
  blocks), `aasx.ts` (stored AASX files), `security.ts` (realm, users, trust
  list and access rules), `export.ts` (ZIP, compose, README), `import.ts`
  (archive limits of DATA-006), `tar.ts`. No `nuxt/server` imports (AGENTS.md).
- `server/database/schema.ts`, migration `0005_container_stacks.sql`: stacks
  with spec, encrypted secrets and the linked infrastructure.
- `server/utils/containers.ts`: desktop-only operation dispatcher, called
  through `POST /api/studio/v1/containers/{operation}`.
- `shared/file-grant-kinds.ts`, `electron/main.ts`, `electron/preload.ts`,
  `server/api/studio/v1/desktop/file-grants.post.ts`: grant kinds
  `stack-export` (`.zip`), `stack-import` (`.zip` or `.json`), `stack-logs`
  (`.txt`) and multiple `stack-aasx` files per dialog, listed once in the SDK.

## Native transport

The native page calls `POST /api/studio/v1/containers/{operation}` with the
Studio session and CSRF token. Studio validates operation parameters and
dispatches to the desktop-only manager; hosted calls are unavailable.
Progress uses `getJob` polling rather than push events. Files are chosen with
the Electron preload bridge; export, import and log saving then receive the
single-use handle. Lifecycle calls are audited when their job ends, with its
outcome. The [endpoint overview](../api/endpoints.md) lists the operations.

Exports contain `data/database.dump`, a consistent PostgreSQL snapshot,
in addition to settings, secrets, configuration, startup AASX files and the
exact image digests. Import restores the snapshot before schema setup and
service startup. Exported Compose restores once, tracked by a named volume.
Exports are sensitive and are not a replacement for an ongoing backup policy.
Keeping data during deletion also keeps the spec and encrypted credentials;
the entry remains available for recreation. Resource names use the stable
stack ID, and older labelled database volumes are adopted on startup.

## Definition of done

Run in the packaged Electron app on macOS (Docker Desktop and Podman
Desktop), Windows (Docker Desktop and Podman Desktop) and Linux (Docker
Engine and rootless Podman).

1. **Engine.** Each engine is detected; a stopped engine and a missing one
   show the empty states of E2, and *Check again* finds a started engine.
2. **Quick start.** From an empty engine, a *Quick start* instance with one
   AASX file is created with defaults, gets ready, appears as an
   infrastructure and opens in Studio with the shells of the file.
3. **Separate services (Advanced).** All services start, registries list the shells written
   through the repositories, and Studio lists shells from the registry.
4. **Secured, ABAC.** Studio signs in as `admin` and writes, signs in as
   `viewer` and only reads.
5. **Secured, ReBAC.** `alice` creates a shell, which `bob` cannot read;
   `alice` shares it with `bob` through Studio's *Share* dialog; `bob` then
   sees it.
6. **Lifecycle.** Stop, start, update and delete (with and without data and
   infrastructure) work; data survives stop and recreate with *Keep my data*;
   the list reflects containers removed outside Studio.
7. **Errors.** A port in use, a failed download (offline) and a component
   that does not get ready each show their sentence and action (U2).
8. **Export and import.** The exported ZIP starts with `docker compose up -d`
   and with `podman compose up -d` on a machine without Studio and serves the
   same data; importing it into Studio recreates an equivalent instance.
9. **Boundaries.** The page is absent from hosted Studio navigation; objects without the Studio label
   are never listed or changed; ports are bound to `127.0.0.1` unless chosen
   otherwise.
10. **Look.** The pages hold at 1440, 768 and 375 px in light and dark, in all
    seven locales; `pnpm lint` and `pnpm i18n:check` pass.

## Phases

| Phase | Content | Exit |
| --- | --- | --- |
| 0. Measurements | Engine API differences on Docker and Podman (archive upload, pull progress, `host-gateway`, named pipes, rootless ports); BaSyx Go environment for separate services (P2); ReBAC on every service; Keycloak loopback redirect URIs (I4); image sizes and digests | Recorded results; the catalogue's environment per component |
| A. Engine and catalogue | `engine.ts`, discovery, `catalog.ts`, `plan.ts`, unit tests with a recorded API; integration test against a real engine behind `STUDIO_CONTAINER_TESTS` | *Quick start* starts from a test |
| B. Lifecycle and API | Runner, jobs, readiness, reconcile, migration, routes, contract, desktop guard, audit | DoD 1, 6 by API |
| C. Security presets | Keycloak realm, users, trust list, access rules, ReBAC, redirect URI, sign-in details | DoD 4, 5 by API |
| D. Native Studio UI | Desktop route and navigation, native API adapter, `app/components/basyx-docker` UI, file grant kinds | DoD 2, 3, 7, 10 |
| E. Integration | Infrastructure registration and *Open in Studio* | DoD 2–5 end to end |
| F. Export and import | ZIP, compose, README, spec, import review | DoD 8 |
| G. Wrap-up | Runs on the engine and OS matrix, e2e desktop test (skipped without an engine), screenshots, `openapi.yaml`, ADR 0033 to *Accepted* | DoD 9, all criteria recorded |

C and D can run in parallel after B; E needs C and D; F needs A.

## Known risks

| Risk | Mitigation |
| --- | --- |
| Podman differs in details (rootless networking, `host-gateway`, API version) | Phase 0 on every engine and OS; engine quirks in one place (`engine.ts`); CI integration test with Docker and Podman on Linux |
| `keycloak.localhost` does not resolve on some hosts, or the host gateway is unavailable | Phase 0; fall back to `localhost` with a host alias written into the containers, and say so in the instance card |
| Mutable `SNAPSHOT` images change behaviour | The catalogue pins digests (*Tested with this Studio*); *Latest snapshot* is opt-in under *Advanced* |
| The first download is large and slow | Size shown before *Start* (wizard step 3); progress per image; downloads resume on *Try again* |
| Engine access is root-equivalent | Catalogue only, labels, loopback ports, native authenticated desktop route only ([ADR 0033](../adr/0033-desktop-container-capability.md)) |
| Exports contain passwords | Warning on export; only generated, stack-specific passwords; README tells how to change them |
| Users delete data by accident | Delete asks about data separately and names the instance (UX-003); *Keep my data* is the default |

## Out of scope

The BaSyx Java server and the starter kit's Java components; the AAS Web UI
container; remote engines (SSH, TCP with TLS) and Kubernetes; MQTT; custom
images, environment variables or additional containers; reading hand-edited
compose files back; observability stack (Grafana, OpenTelemetry); container
access for third-party apps; hosted Studio.

## Verification record (2026-10-17)

The local engine is Colima on macOS. Automated engine tests exercise quick
start with AASX, stop/start, export of post-start edits, import and database
restore, rename, retained-data recreation, secured startup and separate
registries/discovery. Authentication and packaged desktop checks are recorded
with the corresponding test run; no result on Colima establishes Docker
Desktop, Windows named-pipe or rootless Podman compatibility. Those matrix
runs remain release qualification work, as does manual review of all locales.

CI runs the real-engine suite explicitly with `STUDIO_CONTAINER_TESTS=1`,
and opts the packaged desktop job into `STUDIO_CONTAINER_E2E=1`. Standalone Compose verification uses
`STUDIO_CONTAINER_COMPOSE_TESTS=1`. Local engine tests clean up only their own stack IDs.

Automated checks completed locally: 260 unit tests; eight real-engine tests
(including PKCE sign-in, ABAC roles, ReBAC sharing, registry synchronization,
post-start data export/import and independent Compose restore); Studio and
app Vue typechecks; lint; all seven app translation catalogues; bundled-app
build and unpacked macOS desktop build. Packaged desktop tests cover the
container lifecycle and native dialogs, existing app isolation, iframe
reload recovery, responsive widths and theme changes. Engine and desktop
checks use disposable profiles and remove only their own resources.
