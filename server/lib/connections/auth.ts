import type { Connection } from '#shared/contract'
import type { StudioDeps } from '../deps'
import type { InfrastructureRecord } from '../infrastructures'
import type { ConnectionToken } from '../targets/credentials'
import { resolveConnectionSecret } from './secrets'

// Credentials of a connection (ADR 0040, CON-007). Studio adds them to the
// requests its adapters send; they never leave the Studio Service otherwise.

/** Gets tokens from issuers; the credential broker. */
export interface ConnectionTokenSource {
  connectionToken: (record: InfrastructureRecord, connection: Connection, sessionId: string, clientSecret: string | undefined, fresh?: boolean) => Promise<ConnectionToken>
}

export interface ConnectionCredentials {
  headers: Record<string, string>
  /** Who the service sees, for the audit trail. */
  downstreamIdentity: string | null
  delegation?: ConnectionToken['delegation']
}

/**
 * The request headers of a scheme that sends its secret as it is. `token`
 * is for the schemes that get a bearer token from an issuer.
 */
export function authHeaders (auth: Connection['auth'], secret: string | undefined, token?: string): Record<string, string> {
  switch (auth.scheme) {
    case 'none': {
      return {}
    }
    case 'token': {
      return { Authorization: `Token ${secret}` }
    }
    case 'bearer': {
      return { Authorization: `Bearer ${secret}` }
    }
    case 'header': {
      return { [auth.name]: secret! }
    }
    case 'basic': {
      return { Authorization: `Basic ${Buffer.from(`${auth.username}:${secret}`, 'utf8').toString('base64')}` }
    }
    case 'oauth2ClientCredentials':
    case 'delegatedUser': {
      return { Authorization: `Bearer ${token}` }
    }
  }
}

/** Who a service sees for schemes without an issuer: the connection itself. */
function connectionIdentity (connection: Connection): string | null {
  return connection.auth.scheme === 'none' ? null : `connection:${connection.key}`
}

/**
 * Resolves the credentials of a connection for one use by a user's session.
 * `fresh` gets a new token from the issuer, e.g. for *Test connection*.
 */
export async function connectionCredentials (
  deps: StudioDeps,
  tokens: ConnectionTokenSource,
  record: InfrastructureRecord,
  connection: Connection,
  sessionId: string,
  fresh = false,
): Promise<ConnectionCredentials> {
  const value = await resolveConnectionSecret(deps, record, connection)
  const { scheme } = connection.auth
  if (scheme === 'oauth2ClientCredentials' || scheme === 'delegatedUser') {
    const token = await tokens.connectionToken(record, connection, sessionId, value, fresh)
    return { headers: authHeaders(connection.auth, value, token.token), downstreamIdentity: token.downstreamIdentity, delegation: token.delegation }
  }
  return { headers: authHeaders(connection.auth, value), downstreamIdentity: connectionIdentity(connection) }
}
