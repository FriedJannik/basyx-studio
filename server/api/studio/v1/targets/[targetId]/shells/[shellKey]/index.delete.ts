import type { DeleteResult } from '#shared/contract'
import { decodeKey } from '~~/server/lib/aas/keys'
import { StudioProblem } from '~~/server/lib/problem'
import { requireCsrf } from '~~/server/utils/auth'
import { defineStudioHandler, routeParam } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'

/**
 * Deletes a shell, and its descriptor and asset links where Studio keeps the
 * registries and discovery in step (MVP-4 plan, I5). Its submodels stay in
 * the submodel repository.
 */
export default defineStudioHandler(async (event): Promise<DeleteResult> => {
  await requireCsrf(event)
  const shellId = decodeKey(routeParam(event, 'shellKey'), 'shell key')
  const opened = await openTarget(event)
  await requireCapability(opened, 'deleteShells')
  const plan = await opened.syncPlan()
  try {
    await opened.target.deleteShell(shellId)
    await opened.auditWrite('success', { operation: 'deleteShell', shellId })
  } catch (error) {
    await opened.auditWrite('failure', { operation: 'deleteShell', shellId, code: error instanceof StudioProblem ? error.code : 'internal_error' })
    throw error
  }
  const sync = await opened.target.unregisterShell(shellId, plan)
  if (sync.some(step => step.outcome === 'failed')) {
    await opened.auditWrite('failure', { operation: 'sync', shellId, failed: sync.filter(step => step.outcome === 'failed').length })
  }
  return { sync }
})
