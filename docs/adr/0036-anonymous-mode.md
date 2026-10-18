# 0036: Hosted Studio without login (anonymous mode)

- Status: Accepted
- Date: 2026-10-18
- Deciders: BaSyx Studio maintainers
- Requirements: DEP-005, SEC-001
- Amends: [ADR 0002](0002-bff-and-authentication.md)

## Context

ADR 0002 makes an OIDC login mandatory for hosted Studio. A demo, a closed
lab network or a deployment behind an authenticating proxy has no IdP for
Studio, and `docker run` should work without one. The BaSyx AAS Web UI runs
without login unless Keycloak is configured.

## Decision

- `STUDIO_AUTH_MODE=none` (default `oidc`) turns the Studio login off. The
  `STUDIO_OIDC_*` settings are then not required and are ignored with a
  warning.
- Every browser still gets its own **session**, created by server middleware
  on its first page or API request, as the shared user `anonymous`. CSRF
  tokens and per-session target credentials (`delegated_user`) work as with a
  login, and preferences are shared by all anonymous visitors.
- `STUDIO_ANONYMOUS_ROLES` sets the roles of that user; adding the
  administrator role (`STUDIO_ADMIN_ROLE`) lets visitors manage
  infrastructures and apps. Authorization code is the same as for OIDC users.
- The server render's own API calls send the session cookie created during the
  same request (`useStudioFetch`), so one page load creates one session.
- Startup logs that the deployment has no login, and warns when visitors are
  administrators on a non-loopback public URL.

## Consequences

- A single container starts with only a data key and a public URL.
- Anyone who reaches the deployment acts as `anonymous`; audit records name
  that user, not a person. Protection must come from the network or a proxy.
- Requests without cookies (scripts, probes on page URLs) each create a
  session; expired sessions are deleted hourly as before.

## Alternatives considered

- **One shared session for everyone:** one CSRF token for all visitors and
  shared downstream tokens defeat the per-user credential broker.
- **Trusting a proxy's identity header:** useful, but a separate decision
  about which headers to trust; anonymous mode does not exclude it later.
- **Keep the login mandatory:** every quick start would need a Keycloak.
