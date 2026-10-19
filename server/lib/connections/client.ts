import type { Connection } from '#shared/contract'
import type { StudioDeps } from '../deps'
import type { InfrastructureRecord } from '../infrastructures'
import type { OutboundPolicy } from '../network/guarded-fetch'
import type { ConnectionCredentials, ConnectionTokenSource } from './auth'
import { connectionTypes } from '#shared/contract'
import { createGuardedFetch, networkFailureOf } from '../network/guarded-fetch'
import { StudioProblem } from '../problem'
import { connectionCredentials } from './auth'

/** The largest answer Studio reads from a connection (CON-002, MVP-7 plan K7). */
export const connectionMaxResponseBytes = 20 * 1024 * 1024

export interface ConnectionRequest {
  method?: 'GET' | 'POST'
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: string
}

/**
 * One use of a connection by an adapter: requests go to the connection's
 * own URL with its credentials, through the guarded fetch. There is no way
 * to send them anywhere else.
 */
export interface ConnectionClient {
  connection: Connection
  timeoutMs: number
  downstreamIdentity: string | null
  delegation: ConnectionCredentials['delegation']
  /** Sends a request to `path` below the connection's URL; failures of the transport become problems. */
  request: (path: string, request?: ConnectionRequest) => Promise<Response>
  /** Reads an answer's text; an answer over the size cap becomes a problem. */
  text: (response: Response) => Promise<string>
}

/** The policy of a connection's requests: its origin only, no redirects, its timeout, 20 MiB. */
export function connectionPolicy (deps: StudioDeps, connection: Connection): OutboundPolicy {
  return {
    allowedOrigins: new Set([new URL(connection.url).origin]),
    allowPrivateNetwork: connection.allowPrivateNetwork && deps.config.allowPrivateNetworkTargets,
    timeoutMs: (connection.timeoutSeconds ?? connectionTypes[connection.type].defaultTimeoutSeconds) * 1000,
    maxResponseBytes: connectionMaxResponseBytes,
  }
}

function transportProblem (error: unknown, connection: Connection): StudioProblem {
  if (error instanceof StudioProblem) {
    return error
  }
  const failure = networkFailureOf(error)
  if (failure?.kind === 'blocked') {
    return new StudioProblem('connection_request_refused', `The connection ${connection.key}: ${failure.message}.`, { cause: error })
  }
  if (failure?.kind === 'too_large') {
    return new StudioProblem('connection_unavailable', `The connection ${connection.key} answered with more than ${connectionMaxResponseBytes / 1024 / 1024} MiB.`, { cause: error })
  }
  if (failure?.kind === 'timeout') {
    return new StudioProblem('connection_unavailable', `The connection ${connection.key} did not answer in time (${failure.message}).`, { cause: error })
  }
  return new StudioProblem('connection_unavailable', `The connection ${connection.key} could not be reached${failure ? ` (${failure.message})` : ''}.`, { cause: error })
}

/**
 * Opens a connection of an infrastructure for one use by a user's session.
 * `fresh` gets a new token from an issuer instead of a cached one.
 */
export async function openConnection (
  deps: StudioDeps,
  tokens: ConnectionTokenSource,
  record: InfrastructureRecord,
  connection: Connection,
  sessionId: string,
  fresh = false,
): Promise<ConnectionClient> {
  const credentials = await connectionCredentials(deps, tokens, record, connection, sessionId, fresh)
  const policy = connectionPolicy(deps, connection)
  const guardedFetch = createGuardedFetch(policy, { headers: credentials.headers })
  const base = connection.url.replace(/\/+$/, '')
  return {
    connection,
    timeoutMs: policy.timeoutMs,
    downstreamIdentity: credentials.downstreamIdentity,
    delegation: credentials.delegation,
    async request (path, request = {}) {
      const url = new URL(`${base}${path}`)
      for (const [name, value] of Object.entries(request.query ?? {})) {
        url.searchParams.set(name, value)
      }
      try {
        return await guardedFetch(url, { method: request.method ?? 'GET', headers: request.headers, body: request.body })
      } catch (error) {
        throw transportProblem(error, connection)
      }
    },
    async text (response) {
      try {
        return await response.text()
      } catch (error) {
        throw transportProblem(error, connection)
      }
    },
  }
}

/**
 * Turns an answer that is not 2xx into a problem: 401 and 403 mean the
 * credentials were rejected; the service's message is kept for others.
 */
export async function answerProblem (client: ConnectionClient, response: Response): Promise<StudioProblem> {
  const body = await client.text(response).catch(() => '')
  let message = body.trim()
  try {
    const parsed = JSON.parse(body) as { message?: unknown, error?: unknown }
    message = typeof parsed.message === 'string' ? parsed.message : (typeof parsed.error === 'string' ? parsed.error : message)
  } catch {
    // Not JSON: the text is the message.
  }
  const detail = message ? `: ${message.slice(0, 300)}` : ''
  const { key } = client.connection
  if (response.status === 401 || response.status === 403) {
    return new StudioProblem('connection_rejected', `The connection ${key} was refused with HTTP ${response.status}${detail}.`)
  }
  return new StudioProblem('connection_error', `The connection ${key} answered with HTTP ${response.status}${detail}.`)
}
