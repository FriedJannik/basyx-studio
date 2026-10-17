# 0033: Desktop container capability for local BaSyx instances

- Status: Proposed
- Date: 2026-10-17
- Deciders: BaSyx Studio maintainers
- Requirements: DEP-003, DEP-006, APP-006, APP-010, APP-014, SEC-007, SEC-009, UX-002, UX-003

## Context

Desktop users who want to try Studio need a BaSyx server first. Today they
need the BaSyx starter kit or a hand-written compose file, a terminal, and
knowledge of ports, registries and identity providers. The *BaSyx Docker* app
([plan](../development/basyx-docker-plan.md)) should start, configure, stop
and export local BaSyx Go instances on the user's Docker or Podman engine,
without the user knowing any of that.

App code cannot do this on its own: UI apps run in a sandboxed frame
([ADR 0017](0017-app-origin-and-content-security-policy.md)), and backend apps
run in Deno without subprocess, file or socket access
([ADR 0019](0019-backend-app-runner.md)). Access to a container engine's API
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
  the container manager; capability calls return `unsupported_operation`.
- **Engine discovery.** In order: an engine chosen in the app's settings;
  `DOCKER_HOST`; the Docker Desktop and Docker Engine sockets
  (`~/.docker/run/docker.sock`, `/var/run/docker.sock`,
  `//./pipe/docker_engine`); the Podman sockets (`podman machine inspect`'s
  socket on macOS and Windows, `$XDG_RUNTIME_DIR/podman/podman.sock` and
  `/run/podman/podman.sock` on Linux). Each candidate is confirmed with
  `GET /_ping` and `GET /version`; the result names the engine, its version and
  whether it is running.
- **Declarative stacks from a fixed catalogue.** Apps never send images,
  commands, environment variables, mounts or capabilities. They send a
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
  the engine is invisible to the app.
- **Safe defaults.** Ports are published on `127.0.0.1` only and chosen from
  free ports at creation; each stack has its own bridge network. Database and
  Keycloak passwords are generated per stack and stored with Studio's data key
  ([ADR 0002](0002-bff-and-authentication.md)); the renderer and the app see
  them only when the user asks to reveal sign-in details. Configuration files
  (trust list, access rules, Keycloak realm, AASX files) are copied into the
  containers with the engine's archive API, so no host folder is mounted.
- **Permission `studio.containers`.** A new manifest permission that only
  bundled first-party apps ([ADR 0023](0023-bundled-first-party-apps.md)) may
  hold; an uploaded app requesting it is refused at installation. It grants the
  capability methods `studio.containers.*` (engines, stacks, jobs, logs,
  export, import). Methods use the existing `/app-calls` capability dispatcher, guarded by the launch secret, and long work (pulls, starts)
  runs as a job that the app polls ([ADR 0007](0007-http-and-realtime-transports.md)).
- **Files through the host.** Export and import, saving logs and choosing
  AASX files to load show native dialogs from the Electron main process and
  register file grants as in [ADR 0015](0015-desktop-native-bridge-and-file-grants.md),
  extended by kind (`stack-aasx`, `stack-export` for `.zip`, `stack-import`
  for `.zip`/`.json`, `stack-logs` for `.txt`). The app asks with
  `studio.containers.pickFiles`; Studio authorizes the call before the host
  shows a dialog, and the app receives only opaque handles, which it passes to
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
- **Host actions for the app.** The app copies sign-in details and addresses
  with `studio.ui.copyText` (new permission `studio.ui.clipboard`) and opens
  Keycloak and the instance in the browser with `studio.ui.openExternal`
  (`studio.ui.navigation`; https, or http to this computer). The host
  carries both out only right after a click or key press in the app.

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
- The app runs only on desktop. Hosted Studio does not offer it.
- Behaviour differences between Docker and Podman (rootless networking,
  `host-gateway`, named pipes on Windows) need tests on both engines on all
  three operating systems.
- Third-party apps cannot manage containers until a privileged app category
  with verified publishers exists ([ADR 0004](0004-runtime-installable-apps.md)).

## Alternatives considered

- **Shelling out to `docker compose` or `podman compose`:** depends on
  installed CLIs and their versions, needs a file on disk for every change,
  and parses human-oriented output for progress and errors.
- **Arbitrary compose files from the app:** would turn the capability into
  root access for every app that holds it.
- **A built-in Studio page instead of an app:** less plumbing, but it would
  bypass the app platform that Studio uses for its own features
  ([ADR 0023](0023-bundled-first-party-apps.md)).
- **Engine access in the Electron main process:** keeps the authority out of
  the service, but the dev server runs the service without Electron
  ([ADR 0015](0015-desktop-native-bridge-and-file-grants.md)), and domain
  logic would leave the testable `server/lib`.
- **Kubernetes (kind, k3d) or a bundled engine:** much heavier to install and
  operate than an engine the user already has.
