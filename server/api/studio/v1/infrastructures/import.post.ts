import type { InfrastructureImportResult } from '#shared/contract'
import { importInfrastructures } from '~~/server/lib/infrastructures'
import { requireAdmin, requireCsrf } from '~~/server/utils/auth'
import { defineStudioHandler, readValidated, requestIdOf } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'
import { infrastructureImportRequestSchema } from '#shared/contract'

/** Checks (`dryRun`) or imports infrastructures given in the file format. */
export default defineStudioHandler(async (event): Promise<InfrastructureImportResult> => {
  const actor = await requireAdmin(event)
  await requireCsrf(event)
  const request = await readValidated(event, infrastructureImportRequestSchema)
  const studio = await useStudio()
  return importInfrastructures(studio, actor, request, requestIdOf(event))
})
