import type { FileGrant } from '#shared/contract'
import { requireBrokerSecret, requireWorkspaces } from '~~/server/utils/desktop'
import { defineStudioHandler, readValidated } from '~~/server/utils/handler'
import { fileGrantInputSchema } from '#shared/contract'

/** Electron main process only: turns a path the user chose into a single-use handle. */
export default defineStudioHandler(async (event): Promise<FileGrant> => {
  const studio = await requireBrokerSecret(event)
  const { path, purpose, kind } = await readValidated(event, fileGrantInputSchema)
  if (kind) {
    return studio.fileGrants.grant(path, kind)
  }
  return requireWorkspaces(studio).grant(path, purpose)
}, { originCheck: false })
