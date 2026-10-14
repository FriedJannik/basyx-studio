import type { EffectiveRights } from '#shared/contract'
import { allRights } from '~~/server/lib/aas/basyx-go'
import { decodeKey } from '~~/server/lib/aas/keys'
import { defineStudioHandler, routeParam } from '~~/server/utils/handler'
import { openTarget } from '~~/server/utils/target'

/**
 * The signed-in user's rights on a shell, so the UI hides actions that would
 * be refused. Without sharing the target decides per request; every action
 * is offered (D15).
 */
export default defineStudioHandler(async (event): Promise<EffectiveRights> => {
  const shellId = decodeKey(routeParam(event, 'shellKey'), 'shell key')
  const opened = await openTarget(event)
  return opened.target.capabilities.sharing ? opened.target.effectiveRights(shellId) : allRights
})
