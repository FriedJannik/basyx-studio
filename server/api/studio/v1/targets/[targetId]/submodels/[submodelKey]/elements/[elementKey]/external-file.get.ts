import { recordAudit } from '~~/server/lib/audit'
import { fetchExternalFile } from '~~/server/lib/network/external-files'
import { StudioProblem } from '~~/server/lib/problem'
import { elementRoute } from '~~/server/utils/elements'
import { sendBinary } from '~~/server/utils/files'
import { defineStudioHandler, requestIdOf, routeParam } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'
import { openTarget } from '~~/server/utils/target'
import { externalFileUrl, readFileMaxBytes } from '#shared/contract'

/**
 * The file that a File or Property element names by an http(s) address at
 * another host, fetched by Studio for the browser, which may not read it
 * there (CORS). Only from origins the deployment lists (ADR 0042); the
 * address comes from the element, never from the request.
 */
export default defineStudioHandler(async (event): Promise<Uint8Array> => {
  const route = elementRoute(event)
  const opened = await openTarget(event)
  const { value: element } = await opened.target.element(route.submodelId, route.idShortPath)
  const address = route.rest.length === 0 ? externalFileUrl(element) : null
  if (!address) {
    throw new StudioProblem('unsupported_operation', 'Only File and Property elements with an http(s) address name an external file.')
  }

  const studio = await useStudio()
  const { config } = studio
  const origin = new URL(address).origin
  // The origin only: the path and query may carry tokens of the host.
  const audit = (outcome: 'success' | 'failure', details: Record<string, unknown>) => recordAudit(studio, {
    action: 'element.external_file',
    outcome,
    requestId: requestIdOf(event),
    actorSubject: opened.actor.subject,
    targetId: routeParam(event, 'targetId'),
    details: { origin, ...details },
  })
  try {
    const file = await fetchExternalFile({
      origins: config.externalFileOrigins === '*' ? '*' : new Set(config.externalFileOrigins),
      // Hosted, `*` never reaches private addresses; only origins listed by name do.
      allowPrivateNetwork: config.allowPrivateNetworkTargets && (config.deploymentMode === 'desktop' || config.externalFileOrigins !== '*'),
      timeoutMs: 30_000,
      maxBytes: readFileMaxBytes,
    }, address)
    await audit('success', { bytes: file.bytes.byteLength })
    const contentType = element.modelType === 'File' && typeof element.contentType === 'string' && element.contentType ? element.contentType : file.contentType
    return sendBinary(event, { ...file, contentType }, { download: true })
  } catch (error) {
    await audit('failure', { code: error instanceof StudioProblem ? error.code : 'internal_error' })
    throw error
  }
})
