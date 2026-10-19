import type { ConnectionTestResult } from '#shared/contract'
import type { Actor, StudioDeps } from '../deps'
import type { InfrastructureRecord } from '../infrastructures'
import type { ConnectionTokenSource } from './auth'
import type { ConnectionCheck } from './registry'
import { connectionInputSchema } from '#shared/contract'
import { recordAudit } from '../audit'
import { requireChangeable } from '../infrastructures'
import { StudioProblem } from '../problem'
import { openConnection } from './client'
import { connectionAdapters } from './registry'
import { storeConnections } from './secrets'

/**
 * *Test connection* (CON-005): obtains the credentials and runs the type's
 * checks against the stored connection `key`, or against an edited one
 * whose omitted secret is the stored one. The result names each check with
 * its status and a message, never the secret.
 *
 * An edited connection may send the stored secret to a new URL, so it is
 * tested only where the infrastructure may be changed; a managed or fixed
 * one is tested as saved.
 */
export async function testConnection (
  deps: StudioDeps,
  tokens: ConnectionTokenSource,
  record: InfrastructureRecord,
  key: string,
  actor: Actor,
  requestId: string,
  edited?: unknown,
): Promise<ConnectionTestResult> {
  let tested = record
  if (edited !== undefined) {
    requireChangeable(deps, record)
    const parsed = connectionInputSchema.safeParse(edited)
    if (!parsed.success) {
      throw new StudioProblem('invalid_request', 'The connection is invalid.', {
        violations: parsed.error.issues.map(issue => ({ path: ['connection', ...issue.path].join('.'), message: issue.message })),
      })
    }
    if (parsed.data.key !== key) {
      throw new StudioProblem('invalid_request', 'The connection key does not match the route.')
    }
    if (parsed.data.allowPrivateNetwork && !deps.config.allowPrivateNetworkTargets) {
      throw new StudioProblem('endpoint_rejected', 'This Studio deployment does not allow private-network or loopback targets.')
    }
    const stored = storeConnections(deps, [parsed.data], record)
    tested = { ...record, ...stored }
  }
  const connection = tested.connections.find(candidate => candidate.key === key)
  if (!connection) {
    throw new StudioProblem('not_found', 'The infrastructure has no such connection.')
  }

  const checks: ConnectionCheck[] = []
  const started = performance.now()
  let client
  try {
    client = await openConnection(deps, tokens, tested, connection, actor.sessionId, true)
    if (connection.auth.scheme !== 'none') {
      checks.push({ check: 'token', ok: true, status: null, latencyMs: Math.round(performance.now() - started), message: null })
    }
  } catch (error) {
    checks.push({ check: 'token', ok: false, status: null, latencyMs: null, message: error instanceof Error ? error.message : 'the credentials could not be obtained' })
  }
  if (client) {
    checks.push(...await connectionAdapters[connection.type].test(client))
  }

  const result = { checkedAt: new Date().toISOString(), ok: checks.every(check => check.ok), checks }
  await recordAudit(deps, {
    action: 'connection.test',
    outcome: result.ok ? 'success' : 'failure',
    requestId,
    actorSubject: actor.subject,
    targetId: record.id,
    downstreamIdentity: client?.downstreamIdentity ?? null,
    details: { connection: key, type: connection.type, edited: edited !== undefined, failed: checks.filter(check => !check.ok).map(check => check.check) },
  })
  return result
}
