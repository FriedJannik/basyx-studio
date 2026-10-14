import type { AccessDocument } from '#shared/contract'
import { getRequestHeader } from 'nuxt/server'
import { decodeKey } from '~~/server/lib/aas/keys'
import { StudioProblem } from '~~/server/lib/problem'
import { requireCsrf } from '~~/server/utils/auth'
import { defineStudioHandler, readValidated, routeParam } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'
import { accessGrantsInputSchema } from '#shared/contract'

/** Replaces the grants of a shell; `If-Match` must carry the revision that was read. */
export default defineStudioHandler(async (event): Promise<AccessDocument> => {
  await requireCsrf(event)
  const shellId = decodeKey(routeParam(event, 'shellKey'), 'shell key')
  const revision = getRequestHeader(event, 'if-match')
  if (!revision) {
    throw new StudioProblem('precondition_required')
  }
  const { grants } = await readValidated(event, accessGrantsInputSchema)
  const opened = await openTarget(event)
  await requireCapability(opened, 'sharing')
  const details = { operation: 'setAccess', shellId, grants: grants.length }
  try {
    const document = await opened.target.setAccess(shellId, grants, revision)
    await opened.auditWrite('success', details)
    return document
  } catch (error) {
    await opened.auditWrite('failure', { ...details, code: error instanceof StudioProblem ? error.code : 'internal_error' })
    throw error
  }
})
