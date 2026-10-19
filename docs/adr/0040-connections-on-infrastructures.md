# 0040: Connections on infrastructures and purpose-specific capabilities

- Status: Proposed
- Date: 2026-10-19
- Deciders: BaSyx Studio maintainers
- Requirements: CON-001 to CON-007, SEC-005, SEC-007, OPS-006

## Context

AAS content refers to services that are not AAS services. The IDTA *Time
Series Data* submodel's LinkedSegment, for example, names an InfluxDB query
endpoint and a Flux query. The BaSyx AAS Web UI sends that query from the
browser with one global database token. The container entrypoint writes the
token into the JavaScript bundle, so every user can read it.

Studio has the pieces for a safer design. The Studio Service already holds
infrastructure secrets (`env:` and `file:` references when hosted, encrypted
values on desktop) and sends every outbound request through the guarded
fetch. Apps reach Studio only through capability calls (ADR 0018). What is
missing is a place to configure such a service and its credential, and a
rule for when Studio may use that credential.

[MVP-7](../development/mvp-7-plan.md) needs the same for apps that call their
own HTTP services. The core decided here must serve both.

## Decision

### Connections are part of an infrastructure

An infrastructure gets an optional list `connections` (CON-001). It is not a
new AAS endpoint type: `endpointTypes` and `templateRules` stay AAS-only.

```yaml
connections:
  - key: influx                         # unique within the infrastructure
    type: influxdb2                     # the API the service speaks
    url: http://influxdb:8086           # how the Studio Service reaches it
    aliases: [http://localhost:8086]    # how AAS content refers to it
    auth: { scheme: token, token: { ref: env:STUDIO_PLANT_INFLUX_TOKEN } }
    settings: { organization: basyx }   # per type
    allowPrivateNetwork: true
    timeoutSeconds: 15                  # optional, up to 120
```

- `type` names the API, not the transport; the URL scheme already gives that.
  It selects the **adapter** and the schema of `settings` (a Zod discriminated
  union on `type`). The first type is `influxdb2`; MVP-7 adds `http`.
- `auth` is a discriminated union on `scheme` (CON-007):

  | Scheme | Fields | Sent as |
  | --- | --- | --- |
  | `none` | | nothing |
  | `token` | `token` (secret) | `Authorization: Token …` |
  | `bearer` | `token` (secret) | `Authorization: Bearer …` |
  | `header` | `name`, `value` (secret) | `<name>: …` |
  | `basic` | `username`, `password` (secret) | `Authorization: Basic …` |
  | `oauth2ClientCredentials` | `issuer`, `clientId`, `clientSecret` (secret), `scopes`, `audience?` | `Authorization: Bearer` with a token from the issuer, cached until it expires |
  | `delegatedUser` | `audience`, `scopes`, `forwardUserToken` | `Authorization: Bearer` with the user's token, exchanged (RFC 8693) or forwarded |

  Each adapter lists the schemes it accepts; `influxdb2` accepts `token`.
- Secret fields use the infrastructure's `secretInputSchema` unchanged:
  `{ ref: env:NAME | file:/path }` everywhere, `{ value }` on desktop only,
  stored encrypted with the purpose `infrastructures.connection_secret`.
  Responses and exports carry `{ kind, ref }` summaries only. Omitting a
  secret on update keeps the stored one if the connection key and scheme
  are unchanged.
- Storage: migration `0007_infrastructure_connections` adds `connections`
  (jsonb, the summaries) and `connection_secrets_ciphertext` (one encrypted
  map from connection key to secret fields) to `infrastructures`. A change
  bumps the infrastructure's `revision`.
- Declared infrastructures (ADR 0037) accept `connections` with references
  only. Export keeps references and strips stored secrets with a comment;
  an import reports the missing secret as a problem of the entry.

### Using a connection

- Only the Studio Service uses a connection, and only through its type's
  adapter in `server/lib/connections/` or, from MVP-7, through operations
  an administrator bound to an app (CON-002). There is no generic proxy.
- A credential is used only for content read from **the same
  infrastructure** (CON-003). When AAS content names a service, its origin
  must equal the origin of the connection's `url` or of one of its
  `aliases`. The request then goes to the configured `url`, never to the
  URL in the content.
- The guarded fetch allows the `url`'s origin only, never follows
  redirects, and applies the connection's timeout (the adapter's default,
  at most 120 s) and a 20 MiB response cap. Private and loopback addresses
  need the entry's `allowPrivateNetwork` and the deployment's
  `STUDIO_PRIVATE_NETWORK_TARGETS`, as for infrastructures.
- `oauth2ClientCredentials` and `delegatedUser` tokens come from the
  credential broker:
  - client-credentials tokens are cached per infrastructure revision and
    connection;
  - `delegatedUser` needs an infrastructure with `delegated_user` security.
    Studio exchanges the user's access token for this infrastructure at the
    issuer's token endpoint, as the infrastructure's OIDC client, for a token
    with the connection's `audience` (RFC 8693). The result is cached per
    session and connection until it expires;
  - with `forwardUserToken: true`, Studio forwards the user's token unchanged
    instead, but only if its `aud` claim contains the `audience`. The admin
    dialog warns that the service could replay the token against the AAS
    server.
- *Test connection* (CON-005) runs the adapter's check (for `influxdb2`,
  `GET /health` and `buckets() |> limit(n: 1)`) with the stored or entered
  credential and returns per check the status, latency and a message that
  never contains the secret.
- Every use is audited (CON-006) with user, app, infrastructure, connection
  key and operation, the downstream identity and the outcome, never with
  request or response bodies. Refusals are always audited.

### Purpose-specific capabilities

Apps never name a connection, URL or query. A capability states a purpose,
and the Studio Service picks the connection whose adapter serves it.
`studio.timeseries.read` reads a segment of an IDTA Time Series Data
submodel (CON-004):

- The app sends the submodel ID, the segment and record idShorts and a time
  range. Studio reads the submodel itself, as the user, from the frame's
  target.
- LinkedSegment: the `Endpoint` must match a connection of this
  infrastructure that serves `timeseries`. With `influxdb2`, the path must
  end in `/api/v2/query`, only `org`/`orgID` are kept, and the query must
  pass a Flux check: imports of `strings`, `math`, `date`, `array` and
  `experimental/aggregate` only, and no `to()`. The documented boundary is a
  read-only token for the needed buckets; the check is defence in depth.
  `{{y-value}}` is replaced in every occurrence, with one query per
  selected record, whose idShort must be a `Metadata.Record` of the
  submodel. `v.timeRangeStart`, `v.timeRangeStop` and `v.windowPeriod` are
  set from the range.
- ExternalSegment: a `File` with a relative path is read as an attachment,
  an absolute URL only from the infrastructure's own endpoints, a `Blob`
  from its value. Other URLs are refused.
- InternalSegment: the records of the submodel Studio already read.
- The result has the same shape for all three kinds: series of
  `[epochMs, number]` points with their unit, the resolved range and
  warnings. Studio caps the points per series and refuses ranges over five
  years.
- In v1, `authorizeAppCall` reserves the permission for bundled apps, as
  for `studio.containers`. Opening it to installed apps needs an install
  warning, because it lets an app read data that is not in the AAS.
- Desktop AASX workspaces have no infrastructure and so no connections.
  Internal segments and attachments work there; LinkedSegments are refused
  with *"No time series database is configured for this file"*.

## Consequences

- No database token reaches a browser, an app frame, a log or an export.
  An AAS author cannot make Studio send a token to another host, and an app
  cannot run its own query.
- Administrators configure a database per infrastructure instead of once per
  deployment. A deployment that used the Web UI's `INFLUXDB_TOKEN` maps it
  to one `influxdb2` connection on the infrastructure that holds the
  TimeSeries submodels.
- Each further database (InfluxDB 3, TimescaleDB, Prometheus) is an adapter
  with its own query check and parser behind the same capability.
- MVP-7 adds the `http` type, bindings of app connections to infrastructure
  connections and `studio.connections.call` on this core, without changing
  the stored format or the auth schemes.
- Every LinkedSegment read writes an audit row, auto refresh included.
  The 5 s refresh minimum in the app bounds the volume.

## Alternatives considered

- **A deployment-wide `STUDIO_INFLUXDB_TOKEN`:** simple, but the token would
  follow any AAS content to any host that names the right path, and there
  would be one database per Studio.
- **Connections as a new AAS endpoint type:** the template rules, probing
  and registry resolution assume AAS services; a database is none of these.
- **`studio.http` with declared origins (APP-008):** the app would build the
  query and the URL, so the token would go wherever the app sends it.
  MVP-7's declared operations keep the URL with the administrator instead.
- **Fetching in the app frame with a short-lived token:** the token would
  still reach the browser, and the CSP would have to open `connect-src`.
