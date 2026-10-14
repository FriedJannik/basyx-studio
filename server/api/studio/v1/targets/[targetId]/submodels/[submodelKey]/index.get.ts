import type { SubmodelDetail } from '#shared/contract'
import { decodeKey } from '~~/server/lib/aas/keys'
import { toAasXml } from '~~/server/lib/aas/xml'
import { sendBinary } from '~~/server/utils/files'
import { defineStudioHandler, queryValidated, routeParam } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'
import { submodelQuerySchema } from '#shared/contract'

/**
 * A submodel's metadata, or the whole submodel as JSON or AAS XML, now or
 * (with `at`) as it was at a point in time.
 */
export default defineStudioHandler(async (event): Promise<SubmodelDetail | Uint8Array> => {
  const key = routeParam(event, 'submodelKey')
  const submodelId = decodeKey(key, 'submodel key')
  const { at, content, format } = queryValidated(event, submodelQuerySchema)
  const opened = await openTarget(event)
  if (at) {
    await requireCapability(opened, 'history')
  }
  if (content === 'metadata' && format === 'json' && !at) {
    return { key, submodel: await opened.target.submodelMetadata(submodelId) }
  }
  const submodel = at
    ? await opened.target.submodelAt(submodelId, new Date(at).toISOString())
    : await opened.target.submodel(submodelId)
  if (format === 'xml') {
    const name = String(submodel.idShort ?? 'submodel').replaceAll(/[^\w-]/g, '_')
    return sendBinary(event, { bytes: new TextEncoder().encode(toAasXml(submodel, 'submodel')), contentType: 'application/xml', fileName: `${name}.xml` })
  }
  return { key, submodel }
})
