import type { ShellAvailability } from '#shared/contract'
import { shellAvailability } from '~~/server/lib/aas/availability'
import { defineStudioHandler, readValidated } from '~~/server/utils/handler'
import { openTarget } from '~~/server/utils/target'
import { shellAvailabilityRequestSchema } from '#shared/contract'

/** Whether the listed shells can be opened; the UI asks for the rows in view. A POST because the keys can be long. */
export default defineStudioHandler(async (event): Promise<ShellAvailability> => {
  const { keys } = await readValidated(event, shellAvailabilityRequestSchema)
  const { target } = await openTarget(event)
  return shellAvailability(target, keys)
})
