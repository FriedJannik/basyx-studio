import type { Invocation } from '#shared/contract'
import { StudioProblem } from '~~/server/lib/problem'
import { elementRoute } from '~~/server/utils/elements'
import { defineStudioHandler, routeParam } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'

/** The state of an asynchronous invocation, with its outputs once completed. */
export default defineStudioHandler(async (event): Promise<Invocation> => {
  const route = elementRoute(event)
  const handle = routeParam(event, 'handle')
  if (route.rest.length > 0 || !/^[\w.~-]{1,200}$/.test(handle)) {
    throw new StudioProblem('invalid_request', 'Malformed invocation handle.')
  }
  const opened = await openTarget(event)
  await requireCapability(opened, 'operations')
  return opened.target.invocation(route.submodelId, route.idShortPath, handle)
})
