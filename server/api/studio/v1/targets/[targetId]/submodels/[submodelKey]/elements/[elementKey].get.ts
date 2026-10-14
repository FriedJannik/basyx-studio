import type { ElementDetail } from '#shared/contract'
import type { RequestEvent } from 'nuxt/server'
import type { JsonObject } from '~~/server/lib/aas/outline'
import type { OpenedTarget } from '~~/server/utils/target'
import { ancestorsOf, parseLocator } from '~~/server/lib/aas/keys'
import { navigate } from '~~/server/lib/aas/outline'
import { toAasXml } from '~~/server/lib/aas/xml'
import { StudioProblem } from '~~/server/lib/problem'
import { elementRoute, toElementDetail } from '~~/server/utils/elements'
import { sendBinary } from '~~/server/utils/files'
import { defineStudioHandler, queryValidated } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'
import { elementQuerySchema } from '#shared/contract'

/**
 * An element with its revision, or (with `at`) as it was at a point in time,
 * as JSON or AAS XML. A historic element has no revision, so it cannot be
 * written.
 */
export default defineStudioHandler(async (event): Promise<ElementDetail | Uint8Array> => {
  const { at, format } = queryValidated(event, elementQuerySchema)
  const opened = await openTarget(event)
  const detail = await readDetail(event, opened, at)
  if (format === 'json') {
    return detail
  }
  if (Array.isArray(detail.value)) {
    throw new StudioProblem('unsupported_operation', 'Operation variable groups have no AAS serialization of their own.')
  }
  const name = detail.path.replaceAll(/[^\w-]/g, '_')
  return sendBinary(event, { bytes: new TextEncoder().encode(toAasXml(detail.value as JsonObject, 'element')), contentType: 'application/xml', fileName: `${name}.xml` })
})

async function readDetail (event: RequestEvent, opened: OpenedTarget, at: string | undefined): Promise<ElementDetail> {
  const route = elementRoute(event)
  if (!at) {
    return toElementDetail(event, route, await opened.target.element(route.submodelId, route.idShortPath))
  }
  await requireCapability(opened, 'history')
  const submodel = await opened.target.submodelAt(route.submodelId, new Date(at).toISOString())
  // The submodel's elements, addressed like the children of a collection.
  const steps = parseLocator(route.locator)
  const value = navigate({ modelType: 'SubmodelElementCollection', value: submodel.submodelElements }, steps)
  if (value === undefined) {
    throw new StudioProblem('target_resource_not_found')
  }
  return { key: route.key, path: route.locator, value, revision: null, concurrency: null, ancestors: ancestorsOf(steps) }
}
