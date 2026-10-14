import { decodeKey } from '~~/server/lib/aas/keys'
import { sendBinary } from '~~/server/utils/files'
import { defineStudioHandler, queryValidated, routeParam } from '~~/server/utils/handler'
import { openTarget, requireCapability } from '~~/server/utils/target'
import { exportQuerySchema } from '#shared/contract'

/** Downloads a shell with its submodels and concept descriptions as AASX, JSON or XML. */
export default defineStudioHandler(async (event): Promise<Uint8Array> => {
  const shellId = decodeKey(routeParam(event, 'shellKey'), 'shell key')
  const { format } = queryValidated(event, exportQuerySchema)
  const opened = await openTarget(event)
  await requireCapability(opened, 'export')
  const shell = await opened.target.shell(shellId)
  const name = String(shell.idShort ?? 'shell').replaceAll(/[^\w-]/g, '_')
  const file = await opened.target.exportShell(shellId, format)
  return sendBinary(event, { ...file, fileName: `${name}.${format}` }, { download: true })
})
