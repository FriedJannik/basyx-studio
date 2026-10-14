import { getQuery } from 'nuxt/server'
import { StudioProblem } from '~~/server/lib/problem'
import { elementRoute } from '~~/server/utils/elements'
import { sendBinary } from '~~/server/utils/files'
import { defineStudioHandler } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'

/** The content of a File element; `?download` forces a download. */
export default defineStudioHandler(async (event): Promise<Uint8Array> => {
  const route = elementRoute(event)
  if (route.rest.length > 0) {
    throw new StudioProblem('unsupported_operation', 'Operation variables have no attachment.')
  }
  const opened = await openTarget(event)
  await requireCapability(opened, 'files')
  const file = await opened.target.attachment(route.submodelId, route.idShortPath)
  return sendBinary(event, file, { download: getQuery(event).download !== undefined })
})
