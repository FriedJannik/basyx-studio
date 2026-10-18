import type { ElementDetail } from '#shared/contract'
import { getRequestHeader } from 'nuxt/server'
import { StudioProblem } from '~~/server/lib/problem'
import { requireCsrf } from '~~/server/utils/auth'
import { elementRoute, toElementDetail } from '~~/server/utils/elements'
import { readFileBody } from '~~/server/utils/files'
import { defineStudioHandler } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'
import { openTarget, requireCapability, requireFileUploads } from '~~/server/utils/target'

/** Replaces the content of a File element; the body is the file. Requires `If-Match`. */
export default defineStudioHandler(async (event): Promise<ElementDetail> => {
  await requireCsrf(event)
  const route = elementRoute(event)
  if (route.rest.length > 0) {
    throw new StudioProblem('unsupported_operation', 'Operation variables have no attachment.')
  }
  const revision = getRequestHeader(event, 'if-match') ?? ''
  const file = await readFileBody(event, (await useStudio()).config.uploadMaxBytes)
  const opened = await openTarget(event)
  await requireCapability(opened, 'files')
  await requireFileUploads()
  const details = { operation: 'replaceAttachment', submodelId: route.submodelId, path: route.idShortPath, size: file.bytes.length }
  try {
    const snapshot = await opened.target.replaceAttachment(route.submodelId, route.idShortPath, file, revision)
    await opened.auditWrite('success', details)
    return toElementDetail(event, route, snapshot)
  } catch (error) {
    await opened.auditWrite('failure', { ...details, code: error instanceof StudioProblem ? error.code : 'internal_error' })
    throw error
  }
})
