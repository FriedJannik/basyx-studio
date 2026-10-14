import { setResponseStatus } from 'nuxt/server'
import { decodeKey } from '~~/server/lib/aas/keys'
import { sendBinary } from '~~/server/utils/files'
import { defineStudioHandler, routeParam } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'

/** The shell's thumbnail image; 204 when it has none. */
export default defineStudioHandler(async (event): Promise<Uint8Array | null> => {
  const shellId = decodeKey(routeParam(event, 'shellKey'), 'shell key')
  const opened = await openTarget(event)
  await requireCapability(opened, 'files')
  const thumbnail = await opened.target.thumbnail(shellId)
  if (!thumbnail) {
    setResponseStatus(event, 204)
    return null
  }
  // Thumbnails rarely change; let the browser reuse them for a while.
  const bytes = sendBinary(event, thumbnail)
  event.res.headers.set('Cache-Control', 'private, max-age=300')
  return bytes
})
