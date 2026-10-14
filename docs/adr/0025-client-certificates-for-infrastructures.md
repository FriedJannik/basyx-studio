# 0025: Client certificates for infrastructures

- Status: Accepted
- Date: 2026-10-14
- Deciders: BaSyx Studio maintainers
- Requirements: SEC-001, SEC-007, SEC-008

## Context

Some infrastructures require mutual TLS: their AAS services and their
identity provider reject every connection without a client certificate from
their own CA, before any HTTP request (TLS alert 116, "certificate required").
All requests to an infrastructure come from the Studio Service (Node), never
from the renderer, so Electron's `select-client-certificate` does not help.
Interactive sign-in runs in the system browser (RFC 8252), which uses the
operating system's certificate store.

## Decision

- **Per infrastructure, any access mode.** An infrastructure has an optional
  `clientCertificate`, independent of its security mode. Omitted on update, the
  stored certificate stays; `null` removes it.
- **PKCS#12.** The certificate is a `.p12`/`.pfx` bundle with its passphrase,
  modelled like client secrets: hosted deployments reference files
  (`file:/path.p12`, passphrase `env:NAME` or `file:/path`); the desktop Studio
  stores uploaded bundles encrypted with the data key (purpose
  `infrastructures.client_certificate`). Hosted Studio rejects uploads.
- **Validated on save.** The bundle must open with the passphrase, contain a
  key and a matching certificate, and be valid now; problems are violations on
  `clientCertificate`. The endpoints are then probed with the certificate.
- **Read with node-forge.** OpenSSL 3, which Node uses, rejects bundles with
  legacy encryption (RC2, as exported by LibreSSL and older tools) that CAs
  still issue. node-forge reads them and hands RSA and EC keys to Node's
  crypto; the TLS socket gets the key and chain as PEM.
- **Presented by the guarded fetch.** `createGuardedFetch` takes the
  certificate in its policy and passes it to the undici agent's `connect`
  options next to the DNS-rebinding guard, only for `https:`. Agents are
  cached per address policy, protocol and certificate identity (infrastructure
  ID and revision), so certificates are never shared and changes take effect;
  agents of changed or deleted infrastructures are closed. The OIDC client
  cache key holds the identity, never the material.
- **Typed TLS failures.** TLS alerts about the client certificate become
  `target_client_certificate_required` or `target_client_certificate_rejected`.
  undici can report such a connection as merely closed, so the guarded fetch
  then reads the alert with one more TLS handshake (no HTTP request).
- **Browser sign-in.** Documented, not implemented: users import the same
  bundle into the operating system's certificate store.

## Consequences

- Infrastructures behind mutual TLS work in every access mode, including the
  IdP of delegated and client-credentials modes.
- Decrypted keys stay in Studio Service memory for the lifetime of a revision.
- A file referenced by a hosted deployment is read once per revision; rotating
  it takes effect after saving the infrastructure again or restarting Studio.
- Keychain-only identities with non-exportable keys cannot be used.

## Alternatives considered

- **Electron `select-client-certificate`:** only covers requests from the
  renderer, which never talks to infrastructures.
- **Reading identities from the macOS Keychain in Node:** keys are often
  non-exportable, and it would not work on Windows, Linux or hosted.
- **Passing `pfx` to undici:** fails for legacy-encrypted bundles under
  OpenSSL 3 with an opaque "unsupported" error.
- **One certificate per Studio deployment:** different infrastructures trust
  different CAs, and a certificate must not leak to other infrastructures.
