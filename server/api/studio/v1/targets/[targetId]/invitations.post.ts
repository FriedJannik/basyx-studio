import { setResponseStatus } from 'nuxt/server'
import { z } from 'zod'
import { StudioProblem } from '~~/server/lib/problem'
import { requireCsrf } from '~~/server/utils/auth'
import { defineStudioHandler, readValidated } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'

const inputSchema = z.object({ token: z.string().min(8).max(500).regex(/^[\w.~-]+$/) })

/** Accepts a sharing invitation for the signed-in user. */
export default defineStudioHandler(async (event): Promise<null> => {
  await requireCsrf(event)
  const { token } = await readValidated(event, inputSchema)
  const opened = await openTarget(event)
  await requireCapability(opened, 'sharing')
  try {
    await opened.target.acceptInvitation(token)
    await opened.auditWrite('success', { operation: 'acceptInvitation' })
  } catch (error) {
    await opened.auditWrite('failure', { operation: 'acceptInvitation', code: error instanceof StudioProblem ? error.code : 'internal_error' })
    throw error
  }
  setResponseStatus(event, 204)
  return null
})
