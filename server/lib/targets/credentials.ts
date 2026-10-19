import type { AuthenticationState, AuthorizationStart, Connection } from '#shared/contract'
import type { StudioDeps } from '../deps'
import type { InfrastructureRecord } from '../infrastructures'
import type { OidcClientSettings, TokenSet } from '../oidc/client'
import type { AuthorizationTransaction } from '../oidc/transactions'
import { and, eq } from 'drizzle-orm'
import { targetCredentials } from '../../database/schema'
import { recordAudit } from '../audit'
import { resolveClientCertificate, resolveClientSecret } from '../infrastructures'
import { networkFailureOf } from '../network/guarded-fetch'
import { clientCredentialsTokens, completeAuthorization, exchangeToken, getOidcClient, OidcError, refreshTokens, startAuthorization, tokenAudiences } from '../oidc/client'
import { saveTransaction } from '../oidc/transactions'
import { StudioProblem } from '../problem'
import { callbackUri } from '../urls'

/** Refresh slightly before expiry so a token does not expire in flight. */
const expirySkewMs = 30_000

export interface TargetAccess {
  /** Bearer token for the downstream call; undefined for unsecured targets. */
  accessToken: string | undefined
  /** Identity the downstream service sees, for the audit trail. */
  downstreamIdentity: string | null
}

/** A bearer token for a connection (ADR 0040) and who the service sees. */
export interface ConnectionToken {
  token: string
  downstreamIdentity: string | null
  /** How a user's identity was passed: exchanged (RFC 8693) or forwarded unchanged. */
  delegation?: 'exchanged' | 'forwarded'
}

const accessTokenPurpose = 'target_credentials.access_token'
const refreshTokenPurpose = 'target_credentials.refresh_token'

function toProblem (error: unknown, mode: 'delegated' | 'service'): StudioProblem {
  if (error instanceof StudioProblem) {
    return error
  }
  const failure = networkFailureOf(error)
  if (failure?.kind === 'client_certificate_required') {
    return new StudioProblem('target_client_certificate_required', `The identity provider of this target: ${failure.message}.`, { cause: error })
  }
  if (failure?.kind === 'client_certificate_rejected') {
    return new StudioProblem('target_client_certificate_rejected', `The identity provider of this target: ${failure.message}.`, { cause: error })
  }
  if (error instanceof OidcError && error.kind === 'unreachable') {
    return new StudioProblem('target_unreachable', 'The identity provider of this target could not be reached.', { cause: error })
  }
  return mode === 'delegated'
    ? new StudioProblem('target_auth_required', 'Authorize this target again.', { cause: error })
    : new StudioProblem('target_credentials_rejected', 'The identity provider rejected Studio\'s client credentials.', { cause: error })
}

function connectionTokenProblem (error: unknown, connection: Connection, what: string): StudioProblem {
  if (error instanceof StudioProblem) {
    return error
  }
  if (error instanceof OidcError && error.kind === 'unreachable') {
    return new StudioProblem('connection_unavailable', `The identity provider of the connection ${connection.key} could not be reached.`, { cause: error })
  }
  return new StudioProblem('connection_rejected', `The identity provider of the connection ${connection.key} did not accept ${what}.`, { cause: error })
}

/**
 * Owns downstream credentials per target. Delegated user tokens are kept per
 * Studio session and target and never reused for another target; service
 * tokens of the deployment identity are cached per target in memory.
 */
export class CredentialBroker {
  readonly #serviceTokens = new Map<string, { token: string, expiresAt: number, revision: number }>()
  readonly #inflight = new Map<string, Promise<TargetAccess>>()
  /** Client-credentials tokens per connection, and exchanged tokens per session and connection, until they expire. */
  readonly #connectionTokens = new Map<string, { token: string, expiresAt: number }>()

  constructor (private readonly deps: StudioDeps) {}

  async authenticationState (record: InfrastructureRecord, sessionId: string): Promise<AuthenticationState> {
    if (record.security.mode !== 'delegated_user') {
      return 'not_required'
    }
    const credentials = await this.#storedCredentials(record.id, sessionId)
    if (!credentials) {
      return 'required'
    }
    const expired = credentials.accessTokenExpiresAt !== null && credentials.accessTokenExpiresAt.getTime() <= Date.now()
    return expired && !credentials.refreshTokenCiphertext ? 'required' : 'authenticated'
  }

  /**
   * The authentication state after trying the stored credentials: an expired
   * access token is refreshed now, and a refresh the identity provider
   * rejects means `required`, so a target asks for authorization when it is
   * opened rather than on its first failing request. An unreachable identity
   * provider leaves the state as stored; the next request reports it.
   */
  async verifiedAuthenticationState (record: InfrastructureRecord, sessionId: string): Promise<AuthenticationState> {
    const state = await this.authenticationState(record, sessionId)
    if (state !== 'authenticated') {
      return state
    }
    try {
      await this.access(record, sessionId)
      return 'authenticated'
    } catch (error) {
      return error instanceof StudioProblem && error.code === 'target_auth_required' ? 'required' : 'authenticated'
    }
  }

  /** Returns the credentials for one downstream request. */
  access (record: InfrastructureRecord, sessionId: string): Promise<TargetAccess> {
    const { security } = record
    if (security.mode === 'unsecured') {
      return Promise.resolve({ accessToken: undefined, downstreamIdentity: null })
    }
    const key = security.mode === 'delegated_user' ? `${sessionId}:${record.id}` : `service:${record.id}`
    let pending = this.#inflight.get(key)
    if (!pending) {
      pending = (security.mode === 'delegated_user' ? this.#delegatedAccess(record, sessionId) : this.#serviceAccess(record))
        .finally(() => this.#inflight.delete(key))
      this.#inflight.set(key, pending)
    }
    return pending
  }

  async startAuthorization (record: InfrastructureRecord, sessionId: string, returnTo: string): Promise<AuthorizationStart> {
    if (record.security.mode !== 'delegated_user') {
      throw new StudioProblem('invalid_request', 'This target does not use per-user authorization.')
    }
    const desktop = this.deps.config.deploymentMode === 'desktop'
    const redirectUri = callbackUri(this.deps.config, desktop ? record.security.desktopLoopbackHost : undefined)
    try {
      const client = await getOidcClient(await this.#oidcSettings(record))
      const pending = await startAuthorization(client, { redirectUri, scopes: record.security.scopes })
      await saveTransaction(this.deps, pending, { purpose: 'target_authorization', sessionId, targetId: record.id, redirectUri, returnTo })
      return { authorizationUrl: pending.url, mode: desktop ? 'external' : 'navigate' }
    } catch (error) {
      throw toProblem(error, 'delegated')
    }
  }

  async completeAuthorization (record: InfrastructureRecord, transaction: AuthorizationTransaction, callbackUrl: URL, requestId: string): Promise<void> {
    if (!transaction.sessionId) {
      throw new StudioProblem('invalid_request', 'The authorization transaction has no session.')
    }
    const scopes = record.security.mode === 'delegated_user' ? record.security.scopes : []
    try {
      const client = await getOidcClient(await this.#oidcSettings(record))
      const tokens = await completeAuthorization(client, callbackUrl, {
        state: transaction.state,
        nonce: transaction.nonce,
        codeVerifier: transaction.codeVerifier,
        idTokenExpected: scopes.includes('openid'),
      })
      const subject = typeof tokens.claims?.sub === 'string' ? tokens.claims.sub : null
      await this.#store(record.id, transaction.sessionId, tokens, subject)
      await recordAudit(this.deps, { action: 'target.authorize', outcome: 'success', requestId, targetId: record.id, downstreamIdentity: subject ? `user:${subject}` : null })
    } catch (error) {
      await recordAudit(this.deps, { action: 'target.authorize', outcome: 'failure', requestId, targetId: record.id })
      throw toProblem(error, 'delegated')
    }
  }

  async revoke (targetId: string, sessionId: string): Promise<void> {
    await this.deps.db.delete(targetCredentials)
      .where(and(eq(targetCredentials.sessionId, sessionId), eq(targetCredentials.targetId, targetId)))
  }

  /** Drops credentials the target rejected, so the next request starts over. */
  async invalidate (record: InfrastructureRecord, sessionId: string): Promise<void> {
    if (record.security.mode === 'delegated_user') {
      await this.revoke(record.id, sessionId)
    } else {
      this.#serviceTokens.delete(record.id)
    }
  }

  /**
   * A bearer token for a connection whose scheme gets one from an issuer
   * (ADR 0040): the deployment's client credentials, or the signed-in user's
   * token for this infrastructure, exchanged for the connection's audience
   * or, where the connection allows it, forwarded if issued for it.
   * `fresh` skips the cache, e.g. for *Test connection*.
   */
  async connectionToken (record: InfrastructureRecord, connection: Connection, sessionId: string, clientSecret: string | undefined, fresh = false): Promise<ConnectionToken> {
    const { auth } = connection
    if (auth.scheme === 'oauth2ClientCredentials') {
      const identity = `client:${auth.clientId}`
      const key = `client:${record.id}:${record.revision}:${connection.key}`
      const token = await this.#cachedConnectionToken(key, fresh, async () => {
        try {
          const client = await getOidcClient({
            issuer: auth.issuer,
            clientId: auth.clientId,
            clientSecret,
            allowPrivateNetwork: connection.allowPrivateNetwork && this.deps.config.allowPrivateNetworkTargets,
          })
          return await clientCredentialsTokens(client, auth.scopes, auth.audience)
        } catch (error) {
          throw connectionTokenProblem(error, connection, 'its client credentials')
        }
      })
      return { token, downstreamIdentity: identity }
    }
    if (auth.scheme !== 'delegatedUser') {
      throw new Error(`The ${auth.scheme} scheme has no token from an issuer.`)
    }
    if (record.security.mode !== 'delegated_user') {
      throw new StudioProblem('connection_request_refused', `The connection ${connection.key} passes the user's identity, but users do not sign in to this infrastructure.`)
    }
    const user = await this.access(record, sessionId)
    if (!user.accessToken) {
      throw new StudioProblem('target_auth_required', 'Authorize this target to access its data.')
    }
    if (auth.forwardUserToken) {
      const audiences = tokenAudiences(user.accessToken)
      if (!audiences?.includes(auth.audience)) {
        throw new StudioProblem('connection_request_refused', `The user's token is not issued for ${auth.audience}, so Studio does not forward it to the connection ${connection.key}.`)
      }
      return { token: user.accessToken, downstreamIdentity: user.downstreamIdentity, delegation: 'forwarded' }
    }
    const key = `user:${sessionId}:${record.id}:${record.revision}:${connection.key}`
    const subjectToken = user.accessToken
    const token = await this.#cachedConnectionToken(key, fresh, async () => {
      try {
        return await exchangeToken(await getOidcClient(await this.#oidcSettings(record)), subjectToken, { audience: auth.audience, scopes: auth.scopes })
      } catch (error) {
        throw connectionTokenProblem(error, connection, 'the user\'s token in exchange')
      }
    })
    return { token, downstreamIdentity: user.downstreamIdentity, delegation: 'exchanged' }
  }

  /** Drops the cached tokens of a connection the service rejected. */
  invalidateConnection (record: InfrastructureRecord, connectionKey: string): void {
    for (const key of this.#connectionTokens.keys()) {
      if (key.endsWith(`:${record.id}:${record.revision}:${connectionKey}`)) {
        this.#connectionTokens.delete(key)
      }
    }
  }

  async #cachedConnectionToken (key: string, fresh: boolean, request: () => Promise<TokenSet>): Promise<string> {
    const cached = this.#connectionTokens.get(key)
    if (!fresh && cached && cached.expiresAt - expirySkewMs > Date.now()) {
      return cached.token
    }
    const tokens = await request()
    if (fresh) {
      return tokens.accessToken
    }
    // Without an expiry, request again after five minutes rather than caching forever.
    this.#connectionTokens.set(key, { token: tokens.accessToken, expiresAt: tokens.expiresAt?.getTime() ?? Date.now() + 5 * 60_000 })
    return tokens.accessToken
  }

  async #oidcSettings (record: InfrastructureRecord): Promise<OidcClientSettings> {
    if (record.security.mode === 'unsecured') {
      throw new Error('Unsecured targets have no OIDC client.')
    }
    return {
      issuer: record.security.issuer,
      clientId: record.security.clientId,
      clientSecret: await resolveClientSecret(this.deps, record),
      allowPrivateNetwork: record.allowPrivateNetwork && this.deps.config.allowPrivateNetworkTargets,
      clientCertificate: await resolveClientCertificate(this.deps, record),
    }
  }

  async #storedCredentials (targetId: string, sessionId: string) {
    const [row] = await this.deps.db.select().from(targetCredentials).where(and(eq(targetCredentials.sessionId, sessionId), eq(targetCredentials.targetId, targetId)))
    return row
  }

  async #serviceAccess (record: InfrastructureRecord): Promise<TargetAccess> {
    if (record.security.mode !== 'deployment_client_credentials') {
      throw new Error('Not a client-credentials target.')
    }
    const identity = `client:${record.security.clientId}`
    const cached = this.#serviceTokens.get(record.id)
    if (cached && cached.revision === record.revision && cached.expiresAt - expirySkewMs > Date.now()) {
      return { accessToken: cached.token, downstreamIdentity: identity }
    }
    try {
      const client = await getOidcClient(await this.#oidcSettings(record))
      const tokens = await clientCredentialsTokens(client, record.security.scopes)
      this.#serviceTokens.set(record.id, {
        token: tokens.accessToken,
        // Without an expiry, re-request after five minutes rather than caching forever.
        expiresAt: tokens.expiresAt?.getTime() ?? Date.now() + 5 * 60_000,
        revision: record.revision,
      })
      return { accessToken: tokens.accessToken, downstreamIdentity: identity }
    } catch (error) {
      throw toProblem(error, 'service')
    }
  }

  async #delegatedAccess (record: InfrastructureRecord, sessionId: string): Promise<TargetAccess> {
    const credentials = await this.#storedCredentials(record.id, sessionId)
    if (!credentials) {
      throw new StudioProblem('target_auth_required', 'Authorize this target to access its data.')
    }
    const identity = credentials.subject ? `user:${credentials.subject}` : null
    const expiresAt = credentials.accessTokenExpiresAt?.getTime()
    if (expiresAt === undefined || expiresAt - expirySkewMs > Date.now()) {
      return { accessToken: this.deps.cipher.decrypt(credentials.accessTokenCiphertext, accessTokenPurpose), downstreamIdentity: identity }
    }
    if (!credentials.refreshTokenCiphertext) {
      await this.revoke(record.id, sessionId)
      throw new StudioProblem('target_auth_required', 'The authorization for this target expired.')
    }
    try {
      const client = await getOidcClient(await this.#oidcSettings(record))
      const tokens = await refreshTokens(client, this.deps.cipher.decrypt(credentials.refreshTokenCiphertext, refreshTokenPurpose))
      await this.#store(record.id, sessionId, tokens, credentials.subject, credentials.refreshTokenCiphertext)
      return { accessToken: tokens.accessToken, downstreamIdentity: identity }
    } catch (error) {
      if (error instanceof OidcError && error.kind !== 'unreachable') {
        await this.revoke(record.id, sessionId)
      }
      throw toProblem(error, 'delegated')
    }
  }

  async #store (targetId: string, sessionId: string, tokens: TokenSet, subject: string | null, previousRefreshCiphertext: string | null = null): Promise<void> {
    const values = {
      accessTokenCiphertext: this.deps.cipher.encrypt(tokens.accessToken, accessTokenPurpose),
      // Keep the previous refresh token if the IdP does not rotate it.
      refreshTokenCiphertext: tokens.refreshToken ? this.deps.cipher.encrypt(tokens.refreshToken, refreshTokenPurpose) : previousRefreshCiphertext,
      accessTokenExpiresAt: tokens.expiresAt ?? null,
      subject,
      updatedAt: new Date(),
    }
    await this.deps.db.insert(targetCredentials)
      .values({ sessionId, targetId, ...values })
      .onConflictDoUpdate({ target: [targetCredentials.sessionId, targetCredentials.targetId], set: values })
  }
}
