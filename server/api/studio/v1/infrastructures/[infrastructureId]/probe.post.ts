import type { ProbeResult } from '#shared/contract'
import { reprobeInfrastructure } from '~~/server/lib/infrastructures'
import { requireAdmin, requireCsrf } from '~~/server/utils/auth'
import { defineStudioHandler, routeParam } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'

export default defineStudioHandler(async (event): Promise<ProbeResult> => {
  await requireAdmin(event)
  await requireCsrf(event)
  const studio = await useStudio()
  // A probe is the admin's way to make Studio look at the server again: the
  // profiles it reports replace the stored ones.
  return reprobeInfrastructure(studio, routeParam(event, 'infrastructureId'))
})
