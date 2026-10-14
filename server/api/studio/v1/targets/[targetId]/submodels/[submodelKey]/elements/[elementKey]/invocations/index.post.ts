import type { Invocation } from '#shared/contract'
import { StudioProblem } from '~~/server/lib/problem'
import { requireCsrf } from '~~/server/utils/auth'
import { elementRoute } from '~~/server/utils/elements'
import { defineStudioHandler, readValidated } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'
import { invocationInputSchema } from '#shared/contract'

/** Invokes an Operation, synchronously or asynchronously (then poll the returned handle). */
export default defineStudioHandler(async (event): Promise<Invocation> => {
  await requireCsrf(event)
  const route = elementRoute(event)
  if (route.rest.length > 0) {
    throw new StudioProblem('unsupported_operation', 'Only Operation elements can be invoked.')
  }
  const input = await readValidated(event, invocationInputSchema)
  const opened = await openTarget(event)
  await requireCapability(opened, 'operations')
  const details = { operation: 'invoke', submodelId: route.submodelId, path: route.idShortPath, async: input.async }
  try {
    const invocation = await opened.target.invoke(route.submodelId, route.idShortPath, input.arguments, input.async)
    await opened.auditWrite('success', details)
    return invocation
  } catch (error) {
    await opened.auditWrite('failure', { ...details, code: error instanceof StudioProblem ? error.code : 'internal_error' })
    throw error
  }
})
