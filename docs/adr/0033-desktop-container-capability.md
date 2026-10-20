# 0033: Desktop container capability for local BaSyx instances

- Status: Proposed
- Date: 2026-10-17
- Deciders: BaSyx Studio maintainers
- Requirements: DEP-003, DEP-006, APP-006, APP-010, APP-014, SEC-007, SEC-009, UX-002, UX-003

## Context

Desktop users who want to try Studio need a BaSyx server first. Today they
need the BaSyx starter kit or a hand-written compose file, a terminal, and
knowledge of ports, registries and identity providers. The *BaSyx Docker* page
([plan](../development/basyx-docker-plan.md)) should start, configure, stop
and export local BaSyx Go instances on the user's Docker or Podman engine,
without the user knowing any of that.

Access to a container engine's API
is equivalent to root on Linux and to the engine's VM on macOS and Windows: an
API that accepts arbitrary images, mounts or commands would make any app that
holds it full-trust software.

Docker and Podman both serve the Docker Engine REST API on a local socket or
named pipe. A compose CLI is not reliably present: Docker Desktop ships
`docker compose`, while Podman relies on `podman compose`, which delegates to
whichever external provider is installed, with differing behaviour.

## Decision

- **Engine access in the Studio Service, desktop only.** A domain module
  `server/lib/containers/` talks to the Docker Engine REST API (versioned path,
  `undici` over the socket or named pipe). One client serves Docker and
  Podman; differences are handled as quirks of the detected engine (fully
  qualified image names, `host-gateway`, API version). The hosted runtime does not instantiate
  the container manager; API calls return `unsupported_operation`.
- **Engine discovery.** In order: an engine chosen in Studio's settings;
  `DOCKER_HOST`; the Docker Desktop and Docker Engine sockets
  (`~/.docker/run/docker.sock`, `/var/run/docker.sock`,
  `//./pipe/docker_engine`); the Podman sockets (`podman machine inspect`'s
  socket on macOS and Windows, `$XDG_RUNTIME_DIR/podman/podman.sock` and
  `/run/podman/podman.sock` on Linux). Each candidate is confirmed with
  `GET /_ping` and `GET /version`; the result names the engine, its version and
  whether it is running.
- **Declarative stacks from a fixed catalogue.** The renderer never sends images,
  commands, environment variables, mounts or capabilities. It sends a
  *stack spec* (`basyx-stack/1`, validated with Zod in `shared/contract/`):
  a preset, a topology, component switches, persistence, an access model,
  ports and an image channel. The service maps it onto a catalogue of BaSyx Go
  components (`server/lib/containers/catalog.ts`) whose images are pinned by
  digest and updated with Studio releases. Images come only from
  `docker.io/eclipsebasyx`, `docker.io/library/postgres` and
  `docker.io/keycloak/keycloak`, as in the test environment.
- **Ownership by label.** Every network, volume and container the service
  creates carries `org.eclipse.basyx.studio.stack=<stack id>`. The service
  reads, changes and removes only objects with that label; everything else on
  the engine is invisible to the page.
- **Safe defaults.** Ports are published on `127.0.0.1` only and chosen from
  free ports at creation; each stack has its own bridge network. Database and
  Keycloak passwords are generated per stack and stored with Studio's data key
  ([ADR 0002](0002-bff-and-authentication.md)); the renderer sees
  them only when the user asks to reveal sign-in details. Configuration files
  (trust list, access rules, Keycloak realm, AASX files) are copied into the
  containers with the engine's archive API, so no host folder is mounted.
- **Native Studio feature.** The UI lives in `app/components/basyx-docker/`
  behind the desktop-only `/docker` route. It uses Studio's own Vuetify theme,
  locale, navigation and hot-reload lifecycle; it is not installed, sandboxed
  or rendered in an app iframe.
- **Authenticated core API.** `POST /api/studio/v1/containers/{operation}`
  validates the existing fixed operation schemas and dispatches to the
  container manager. Calls require the Studio session and CSRF token. Long
  work (pulls, starts) runs as a job that the page polls
  ([ADR 0007](0007-http-and-realtime-transports.md)).
- **Files through the host.** Export and import, saving logs and choosing
  AASX files to load show native dialogs from the Electron main process and
  register file grants as in [ADR 0015](0015-desktop-native-bridge-and-file-grants.md),
  extended by kind (`stack-aasx`, `stack-export` for `.zip`, `stack-import`
  for `.zip`/`.json`, `stack-logs` for `.txt`). The native page asks the
  preload bridge to show a dialog and receives only opaque handles, which it passes to
  `exportStack`, `importStack`, `saveLogs` or `createStack`.
- **State.** The Studio database stores each stack's spec, its secrets
  (encrypted) and the infrastructure created for it (migration `0005`). The
  engine is the source of truth for what runs; the service reconciles both
  and reports stacks that were changed or removed outside Studio, and labelled
  objects without a stored spec.
- **Infrastructure registration.** When a stack is healthy for the first time,
  the service creates the matching infrastructure
  ([ADR 0020](0020-infrastructure-templates-registries-and-sync.md)):
  `mono-all` or `mono-repo`, the stack's endpoints, and `unsecured` or
  `delegated_user` with the stack's Keycloak issuer and Studio client.
- **Export.** A ZIP with `docker-compose.yml`, `.env` (the generated secrets),
  the configuration files, the AASX files, a PostgreSQL database snapshot, a `README.md` with start
  instructions for Docker and Podman, and `basyx-stack.json`. The compose file
  is generated from the same catalogue, so the export starts the same images
  in the same way. Import reads the spec, generated secrets, startup AASX
  files and database snapshot; hand edits to the compose file are ignored.
  Snapshot restore runs before schema setup. Kept data retains its stored
  spec and encrypted credentials so it can be recreated from the app.
- **Audit.** Creating, changing, starting, stopping, updating, deleting,
  exporting and importing a stack are audit records with the stack ID. Jobs
  are audited when they end, with their outcome and job ID; container logs
  stay untrusted output ([ADR 0005](0005-storage-and-observability.md)).
- **Renderer actions.** The page copies sign-in details and addresses through
  the browser clipboard, opens external addresses through Electron's guarded
  window handler, and navigates to registered infrastructures with the Studio
  router. Each action starts from a click or key press.

## Consequences

- Desktop users can run BaSyx Go locally from Studio with Docker or Podman,
  without a compose CLI, and hand the setup to others as a compose project.
- The Studio Service gains the most powerful authority it has had so far.
  The catalogue, labels and loopback-only ports keep the capability narrow, but
  a compromised Studio Service could still use the engine; this is the same
  trust the user gives Docker Desktop or Podman Desktop.
- Catalogue images and their configuration become part of the Studio release:
  new BaSyx Go versions need a Studio update to be offered, and the catalogue
  needs an integration test against a real engine.
- The page and its navigation item are offered only on desktop. Hosted Studio
  does not instantiate the manager.
- Behaviour differences between Docker and Podman (rootless networking,
  `host-gateway`, named pipes on Windows) need tests on both engines on all
  three operating systems.
- Installed apps cannot manage containers.

## Alternatives considered

- **Shelling out to `docker compose` or `podman compose`:** depends on
  installed CLIs and their versions, needs a file on disk for every change,
  and parses human-oriented output for progress and errors.
- **Arbitrary compose files from the app:** would turn the capability into
  root access for every app that holds it.
- **A bundled first-party app:** preserves app-platform uniformity, but this
  feature already depends on a privileged Studio service, native file dialogs,
  core infrastructure registration and desktop-only lifecycle. The iframe,
  capability permission, separate build and startup installation add failure
  modes and prevent normal Nuxt hot reload without creating a useful security
  boundary.
- **Engine access in the Electron main process:** keeps the authority out of
  the service, but the dev server runs the service without Electron
  ([ADR 0015](0015-desktop-native-bridge-and-file-grants.md)), and domain
  logic would leave the testable `server/lib`.
- **Kubernetes (kind, k3d) or a bundled engine:** much heavier to install and
  operate than an engine the user already has.
