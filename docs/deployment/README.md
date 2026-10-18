# Deploying BaSyx Studio

The hosted Studio Service ships as one container image,
`eclipsebasyx/basyx-studio`, for `linux/amd64` and `linux/arm64`
([ADR 0035](../adr/0035-container-image-and-base-path.md)). It is configured
by environment variables only, so it runs the same with `docker run`, Docker
Compose and Kubernetes.

- [Quick start](#quick-start)
- [Image tags and verification](#image-tags-and-verification)
- [Configuration reference](#configuration-reference)
- [Base path and reverse proxy](#base-path-and-reverse-proxy)
- [Declared infrastructures](#declared-infrastructures)
- [Without login](#without-login)
- [Kubernetes notes](#kubernetes-notes)

## Quick start

```bash
docker run -p 127.0.0.1:3000:3000 \
  -e STUDIO_PUBLIC_URL=http://localhost:3000 \
  -e STUDIO_DATA_KEY="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')" \
  -e STUDIO_AUTH_MODE=none -e STUDIO_ANONYMOUS_ROLES=studio-admin \
  -v studio-data:/data \
  eclipsebasyx/basyx-studio:SNAPSHOT
```

This starts Studio without login on your machine, published on loopback only
because every visitor is an administrator, with an embedded database in the
`studio-data` volume. Keep the data key: it encrypts stored tokens and
secrets, and a new key cannot read them.

Two Compose examples go further:

- [`examples/deployment/quickstart`](../../examples/deployment/quickstart):
  Studio without login and a BaSyx Go AAS environment, declared as a managed
  infrastructure.
- [`examples/deployment/production-like`](../../examples/deployment/production-like):
  Studio under `/studio/` behind Caddy with a separate apps origin, Keycloak
  login, PostgreSQL, the data key as a Docker secret, a read-only root file
  system, and BaSyx Go.

## Image tags and verification

| Tag | Published | Use |
| --- | --- | --- |
| `SNAPSHOT` | every merge to `main` | trying the latest state |
| `SNAPSHOT-<yyyymmdd-hhmmss>-<sha>`, `<sha>` | every merge to `main` | pinning a snapshot |
| `<version>` (for example `0.2.0`) | every GitHub release | production |
| `latest` | every release that is not a prerelease | the newest release |

Images are signed keyless with cosign and carry SLSA provenance and an SPDX
SBOM. Releases also attach SPDX and CycloneDX files to the GitHub release.

```bash
cosign verify eclipsebasyx/basyx-studio:SNAPSHOT \
  --certificate-identity https://github.com/eclipse-basyx/basyx-studio/.github/workflows/docker-snapshot.yml@refs/heads/main \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

For a release, use `docker-release.yml@refs/tags/<tag>` as the identity.

## Configuration reference

Variables marked *file* also accept `<NAME>_FILE` with a path to a file that
holds the value (for Docker and Kubernetes secrets); set one or the other.

### Required

| Variable | Description |
| --- | --- |
| `STUDIO_PUBLIC_URL` | URL under which users reach Studio, e.g. `https://example.org/studio`. Used for redirects and Origin checks. Its path, if any, must equal the base path. |
| `STUDIO_DATA_KEY` (*file*) | 32 random bytes, base64url. Encrypts tokens and stored secrets at rest. |
| `STUDIO_OIDC_ISSUER`, `STUDIO_OIDC_CLIENT_ID` | The Studio login (OIDC authorization code with PKCE). Not needed with `STUDIO_AUTH_MODE=none`. |

### Service

| Variable | Default | Description |
| --- | --- | --- |
| `STUDIO_BASE_PATH` | `/` | Path Studio is served under, e.g. `/studio`. The image's launcher turns it into Nuxt's `NUXT_APP_BASE_URL`; set that one when running `.output/server/index.mjs` yourself. |
| `NITRO_PORT` / `PORT` | `3000` | Listening port. |
| `STUDIO_DATABASE_URL` | none | PostgreSQL for metadata, e.g. `postgres://studio:…@db:5432/studio`. Without it, Studio embeds PGlite in `STUDIO_DATA_DIR` (one replica only). |
| `STUDIO_DATA_DIR` | `/data` in the image | PGlite database and backend app files. |
| `STUDIO_SESSION_TTL_HOURS` | `12` | Lifetime of a Studio session. |
| `STUDIO_UPLOAD_MAX_BYTES` | 100 MiB | Largest AASX, JSON or XML file users may upload. |
| `STUDIO_PRIVATE_NETWORK_TARGETS` | `deny` | `allow` lets infrastructures on private or loopback addresses be used (each also needs `allowPrivateNetwork`). Needed for services on the same Compose or cluster network. |

### Login

| Variable | Default | Description |
| --- | --- | --- |
| `STUDIO_AUTH_MODE` | `oidc` | `none` turns the login off ([below](#without-login)). |
| `STUDIO_ANONYMOUS_ROLES` | none | Roles of the anonymous user (comma-separated) with `STUDIO_AUTH_MODE=none`. |
| `STUDIO_OIDC_CLIENT_SECRET` (*file*) | none | Secret of a confidential client. |
| `STUDIO_OIDC_SCOPES` | `openid profile email` | Scopes requested at login. |
| `STUDIO_OIDC_ROLES_CLAIM` | `roles` | Claim with the user's roles; a JSON pointer such as `/realm_access/roles` for nested claims. |
| `STUDIO_ADMIN_ROLE` | `studio-admin` | Role that may manage infrastructures and apps. |

Register `<public URL>/api/studio/v1/auth/callback` as redirect URI and
`<public URL>/` as post-logout redirect URI at the IdP.

### Infrastructures

| Variable | Default | Description |
| --- | --- | --- |
| `STUDIO_INFRASTRUCTURES_FILE` | none | YAML file with declared infrastructures ([below](#declared-infrastructures)). |
| `STUDIO_INFRASTRUCTURES` | none | The same YAML inline, e.g. from Helm values. |
| `STUDIO_INFRASTRUCTURES_EDITABLE` | `true` | `false` keeps administrators from adding, changing, removing or importing infrastructures. |

### Apps

| Variable | Default | Description |
| --- | --- | --- |
| `STUDIO_APPS_URL` | none | Separate origin app files are served from, e.g. `https://apps.example.org`, routed to the same service. Without it, apps are off. |
| `STUDIO_APPS_ALLOW_UNSIGNED` | `false` | Developer-mode installs of unsigned packages. |
| `STUDIO_APPS_ALLOW_INSTALL` | `true` | `false` keeps administrators from installing or removing apps; bundled apps stay. |

### Branding, legal links and switches

| Variable | Default | Description |
| --- | --- | --- |
| `STUDIO_PRODUCT_NAME` | `BaSyx Studio` | Window title and app bar. |
| `STUDIO_LOGO`, `STUDIO_LOGO_LIGHT`, `STUDIO_LOGO_DARK` | BaSyx logo | An `http(s)` URL, or an absolute path to a mounted SVG, PNG, WebP or JPEG file that Studio serves at `<base>/branding/logo-light` and `-dark`. |
| `STUDIO_PRIMARY_COLOR`, `…_LIGHT`, `…_DARK` | BaSyx blue | Default accent as `#RRGGBB` for users who keep the default; Studio picks a readable shade per theme. |
| `STUDIO_COPYRIGHT_NAME` | none | Shown in Settings → About. |
| `STUDIO_LEGAL_NOTICE_URL`, `STUDIO_PRIVACY_POLICY_URL` | none | Links on the sign-in page and in Settings → About. |
| `STUDIO_READ_ONLY` | `false` | `true` refuses every change to any target and hides editing. |
| `STUDIO_ALLOW_UPLOADS` | `true` | `false` turns off file uploads to targets. |

Switches only narrow what roles allow; they never grant anything.

## Base path and reverse proxy

With `STUDIO_BASE_PATH=/studio`, pages, assets, the API, the OIDC callback,
health probes and app files are all served under `/studio/`. The proxy
forwards the path unchanged, without stripping the prefix:

```caddyfile
http://example.org {
	handle /studio* {
		reverse_proxy studio:3000
	}
}
```

The proxy must keep the original `Host` header. On the apps origin it must
not add `X-Frame-Options` or a `Content-Security-Policy`, and must keep the
CORS headers Studio sets ([deployment variants](../architecture/deployment-variants.md#apps-origin-and-backend-runtime-mvp-3)).
Two Studios under different paths of one origin keep separate session
cookies.

## Declared infrastructures

Infrastructures in `STUDIO_INFRASTRUCTURES_FILE` or `STUDIO_INFRASTRUCTURES`
are applied at every start: created, updated in place, and removed when they
leave the file. They are read-only in Studio
([ADR 0037](../adr/0037-declared-infrastructures-export-and-import.md)).
Each entry has the fields of the infrastructure API plus a stable `key`:

```yaml
version: 1
infrastructures:
  - key: factory-a
    name: Factory A
    template: full
    endpoints:
      - { type: aasRegistry, url: https://basyx.example.org/aas-registry }
      - { type: submodelRegistry, url: https://basyx.example.org/sm-registry }
      - { type: aasDiscovery, url: https://basyx.example.org/discovery }
      - { type: aasRepository, url: https://basyx.example.org/aas-repo }
      - { type: submodelRepository, url: https://basyx.example.org/sm-repo }
    listSource: registry
    security:
      mode: deployment_client_credentials
      issuer: https://id.example.org/realms/basyx
      clientId: studio
      scopes: [openid]
      clientSecret: { ref: env:FACTORY_A_CLIENT_SECRET }
    allowPrivateNetwork: false
```

- `template`: `full`, `mono-all`, `mono-repo` or `identifiable`; it decides
  which endpoint types are allowed and required.
- `security.mode`: `unsecured`, `deployment_client_credentials` or
  `delegated_user` (the signed-in user's token).
- Secrets are references only: `{ ref: env:NAME }` or
  `{ ref: file:/run/secrets/name }`; client certificates as
  `{ ref: file:/path.p12, passphraseRef: env:NAME }`.
- An invalid entry stops the start with a message naming the entry and
  field, and nothing is changed.

Administrators export infrastructures in this format (Infrastructures →
*Export all* or *Copy as YAML*) and import them by pasting or dropping a file.
Secrets stored in a Studio are left out of exports.

## Without login

`STUDIO_AUTH_MODE=none` is for demos, closed networks and deployments behind
an authenticating proxy ([ADR 0036](../adr/0036-anonymous-mode.md)). Every
browser gets its own session as the shared user `anonymous` with
`STUDIO_ANONYMOUS_ROLES`; with `studio-admin` among them, every visitor
manages infrastructures and apps. Studio logs a warning at startup.

## Kubernetes notes

For a Helm chart (planned in `eclipse-basyx/charts`):

- Probes: liveness `GET <base>health/live`, readiness `GET <base>health/ready`
  on port 3000. The image's `HEALTHCHECK` uses the readiness probe.
- Security context: `runAsUser: 1000`, `runAsGroup: 1000`, `fsGroup: 1000`,
  `readOnlyRootFilesystem: true` with an `emptyDir` on `/tmp` and a volume on
  `/data`.
- Replicas: one with PGlite (a `ReadWriteOnce` volume on `/data`). Use
  `STUDIO_DATABASE_URL` for PostgreSQL; more than one replica is not yet
  supported.
- Secrets: `STUDIO_DATA_KEY_FILE` and `STUDIO_OIDC_CLIENT_SECRET_FILE` from a
  `Secret`; secrets referenced by declared infrastructures as `env:` or
  `file:`.
- Infrastructures: `STUDIO_INFRASTRUCTURES_FILE` from a `ConfigMap`, or
  `STUDIO_INFRASTRUCTURES` from values.
- Ingress: the Studio host (path `STUDIO_BASE_PATH`) and, with apps, the apps
  host, both to the same service.
- Shutdown: Studio stops on `SIGTERM`; startup with an invalid configuration
  exits with code 1.
