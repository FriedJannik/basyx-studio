import type { InvitationResult } from '#shared/contract'
import { decodeKey } from '~~/server/lib/aas/keys'
import { StudioProblem } from '~~/server/lib/problem'
import { requireCsrf } from '~~/server/utils/auth'
import { defineStudioHandler, readValidated, routeParam } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'
import { invitationInputSchema } from '#shared/contract'

/** Creates an invitation that grants a relation on the shell to whoever accepts it. */
export default defineStudioHandler(async (event): Promise<InvitationResult> => {
  await requireCsrf(event)
  const shellId = decodeKey(routeParam(event, 'shellKey'), 'shell key')
  const input = await readValidated(event, invitationInputSchema)
  const opened = await openTarget(event)
  await requireCapability(opened, 'sharing')
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
  const details = { operation: 'invite', shellId, relation: input.relation, maxUses: input.maxUses }
  try {
    const invitation = await opened.target.invite(shellId, input.relation, expiresAt, input.maxUses)
    await opened.auditWrite('success', details)
    return invitation
  } catch (error) {
    await opened.auditWrite('failure', { ...details, code: error instanceof StudioProblem ? error.code : 'internal_error' })
    throw error
  }
})
