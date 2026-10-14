import type { ShellSummary, UploadResult } from '#shared/contract'
import type { UploadFormat } from '~~/server/lib/workspaces/package'
import { setResponseStatus } from 'nuxt/server'
import { toShellSummary } from '~~/server/lib/aas/shells'
import { StudioProblem } from '~~/server/lib/problem'
import { requireCsrf } from '~~/server/utils/auth'
import { readFileBody } from '~~/server/utils/files'
import { defineStudioHandler } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'
import { openTarget, requireCapability } from '~~/server/utils/target'

/** Media types BaSyx Go accepts on `/upload`, per checked format. */
const uploadTypes: Record<UploadFormat, string> = {
  aasx: 'application/aasx+xml',
  json: 'application/json',
  xml: 'application/xml',
}

function formatOf (fileName: string | null, contentType: string): UploadFormat | null {
  const extension = fileName?.split('.').pop()?.toLowerCase()
  if (extension === 'aasx' || contentType.includes('aasx') || contentType.includes('package')) {
    return 'aasx'
  }
  if (extension === 'json' || contentType.endsWith('json')) {
    return 'json'
  }
  if (extension === 'xml' || contentType.endsWith('xml')) {
    return 'xml'
  }
  return null
}

/**
 * Adds the content of an AASX, JSON or XML file to the target. The file is
 * checked in the Workspace Worker first (D16), so the target only receives
 * well-formed AAS content within the size limit.
 */
export default defineStudioHandler(async (event): Promise<UploadResult> => {
  await requireCsrf(event)
  const studio = await useStudio()
  const file = await readFileBody(event, studio.config.uploadMaxBytes)
  const format = formatOf(file.fileName, file.contentType)
  if (!format) {
    throw new StudioProblem('invalid_request', 'Upload an .aasx, .json or .xml file.')
  }
  if (!studio.inspector) {
    throw new StudioProblem('unsupported_operation', 'Uploads need the Workspace Worker, which is not available.')
  }
  const opened = await openTarget(event)
  await requireCapability(opened, 'upload')
  const inspected = await studio.inspector.request({ op: 'inspect', bytes: file.bytes, format })
  const details = { operation: 'upload', format, size: file.bytes.length, shells: inspected.shellIds.length }
  try {
    await opened.target.upload({ ...file, contentType: uploadTypes[format] })
    await opened.auditWrite('success', details)
  } catch (error) {
    await opened.auditWrite('failure', { ...details, code: error instanceof StudioProblem ? error.code : 'internal_error' })
    throw error
  }
  const shells = await Promise.allSettled(inspected.shellIds.map(id => opened.target.shell(id)))
  // Descriptors and asset links where Studio keeps the registries and discovery in step (I5).
  const sync = await opened.target.registerShells(inspected.shellIds, await opened.syncPlan())
  if (sync.some(step => step.outcome === 'failed')) {
    await opened.auditWrite('failure', { ...details, operation: 'sync', failed: sync.filter(step => step.outcome === 'failed').length })
  }
  setResponseStatus(event, 201)
  return {
    shells: shells.filter(result => result.status === 'fulfilled').map(result => toShellSummary(result.value)) satisfies ShellSummary[],
    sync,
  }
})
