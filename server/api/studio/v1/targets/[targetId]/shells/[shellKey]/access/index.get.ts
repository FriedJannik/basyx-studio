import type { AccessDocument } from '#shared/contract'
import { decodeKey } from '~~/server/lib/aas/keys'
import { defineStudioHandler, routeParam } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'

/** Who has access to a shell (ReBAC grants), with the revision to change them. */
export default defineStudioHandler(async (event): Promise<AccessDocument> => {
  const shellId = decodeKey(routeParam(event, 'shellKey'), 'shell key')
  const opened = await openTarget(event)
  await requireCapability(opened, 'sharing')
  const document = await opened.target.access(shellId)
  if (document.revision) {
    event.res.headers.set('ETag', document.revision)
  }
  return document
})
