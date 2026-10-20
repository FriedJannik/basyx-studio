import type { z } from 'zod'
import type { ContainerMethodName } from '~~/server/lib/apps/calls'
import { StudioProblem } from '~~/server/lib/problem'
import { requireActor, requireCsrf } from '~~/server/utils/auth'
import { performContainerMethod } from '~~/server/utils/containers'
import { defineStudioHandler, readValidated, requestIdOf, routeParam } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'
import { appMethodParamsSchemas } from '#shared/contract'

/**
 * Native Studio endpoint for the desktop-only container feature. The operation
 * names deliberately retain the existing typed contract while the UI no
 * longer needs an app installation, capability token or iframe bridge.
 */
export default defineStudioHandler(async (event): Promise<unknown> => {
  const operation = routeParam(event, 'operation')
  const method = `studio.containers.${operation}`
  const schema = (appMethodParamsSchemas as Record<string, z.ZodType>)[method]
  if (!schema || !method.startsWith('studio.containers.')) {
    throw new StudioProblem('not_found', 'The container operation does not exist.')
  }

  const actor = await requireActor(event)
  await requireCsrf(event)
  const params = await readValidated(event, schema)
  return await performContainerMethod(await useStudio(), actor, method as ContainerMethodName, params, requestIdOf(event))
})
