import type { ChangePage } from '#shared/contract'
import { defineStudioHandler, queryValidated } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'
import { changesQuerySchema } from '#shared/contract'

/** Recent change events of the target, newest first; optionally only about given identifiers. */
export default defineStudioHandler(async (event): Promise<ChangePage> => {
  const query = queryValidated(event, changesQuerySchema)
  const opened = await openTarget(event)
  await requireCapability(opened, 'changeFeed')
  return opened.target.changes(query)
})
