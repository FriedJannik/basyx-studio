import type { TimeSeriesReadOutcome, TimeSeriesReadParams } from '../lib/timeseries/read'
import type { AppCall } from './apps'
import type { StudioRuntime } from './studio'
import { recordAudit } from '../lib/audit'
import { openConnection } from '../lib/connections/client'
import { connectionFor } from '../lib/connections/registry'
import { getInfrastructure } from '../lib/infrastructures'
import { StudioProblem } from '../lib/problem'
import { readTimeSeries } from '../lib/timeseries/read'
import { isWorkspaceId } from '../lib/workspaces/manager'
import { openTargetFor } from './target'

/**
 * Runs `studio.timeseries.read` (ADR 0040): reads the submodel from the
 * frame's target as the user and, for a LinkedSegment, queries the database
 * of a connection of the same infrastructure. Every use of a connection and
 * every refusal is audited, without the query text.
 */
export async function performTimeSeriesRead (studio: StudioRuntime, call: AppCall, params: TimeSeriesReadParams, requestId: string): Promise<unknown> {
  const { actor, installation, targetId } = call
  if (!targetId) {
    throw new StudioProblem('invalid_request', 'This app frame is not bound to a target.')
  }
  const started = performance.now()
  let outcome: TimeSeriesReadOutcome | undefined
  let connectionKey: string | null = null
  const audit = (status: 'success' | 'failure', details: Record<string, unknown>) => recordAudit(studio, {
    action: 'timeseries.read',
    outcome: status,
    requestId,
    actorSubject: actor.subject,
    targetId,
    appInstallationId: installation.id,
    downstreamIdentity: outcome?.connection?.downstreamIdentity ?? null,
    details: {
      appId: installation.appId,
      submodelId: params.submodelId,
      segment: params.segment,
      connection: connectionKey,
      durationMs: Math.round(performance.now() - started),
      ...details,
    },
  })

  try {
    const opened = await openTargetFor({
      actor,
      targetId,
      requestId,
      operation: 'studio.timeseries.read',
      read: true,
      appInstallationId: installation.id,
      shellId: call.shellId ?? undefined,
    })
    const record = isWorkspaceId(targetId) ? null : await getInfrastructure(studio, targetId)
    const { target } = opened
    outcome = await readTimeSeries(params, {
      submodel: await target.submodel(params.submodelId),
      conceptDescription: id => target.conceptDescription(id).catch(() => null),
      attachment: idShortPath => target.attachment(params.submodelId, idShortPath),
      element: async idShortPath => (await target.element(params.submodelId, idShortPath)).value,
      download: url => target.download(url),
      linked: async endpoint => {
        if (!record) {
          throw new StudioProblem('connection_not_configured', 'No time series database is configured for this file.')
        }
        const connection = connectionFor(record.connections, 'timeseries', endpoint)
        if (!connection) {
          throw new StudioProblem('connection_not_configured', `Time series database not configured for ${endpoint.origin}.`)
        }
        connectionKey = connection.key
        try {
          return await openConnection(studio, studio.broker, record, connection, actor.sessionId)
        } catch (error) {
          if (error instanceof StudioProblem && error.code === 'connection_rejected') {
            studio.broker.invalidateConnection(record, connection.key)
          }
          throw error
        }
      },
    })
    if (outcome.connection) {
      await audit('success', { kind: outcome.result.kind, type: outcome.connection.type, delegation: outcome.connection.delegation ?? null, queryDigests: outcome.queryDigests })
    }
    return outcome.result
  } catch (error) {
    await audit('failure', { code: error instanceof StudioProblem ? error.code : 'internal_error' })
    throw error
  }
}
