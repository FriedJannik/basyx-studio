import type { ConnectionTestResult } from '#shared/contract'
import { testConnection } from '~~/server/lib/connections/test'
import { getInfrastructure } from '~~/server/lib/infrastructures'
import { requireAdmin, requireCsrf } from '~~/server/utils/auth'
import { defineStudioHandler, readValidated, requestIdOf, routeParam } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'
import { connectionTestRequestSchema } from '#shared/contract'

// Test connection (CON-005, ADR 0040): the stored connection, or the edited
// one in the body, with the stored secret where the edit leaves it out.
export default defineStudioHandler(async (event): Promise<ConnectionTestResult> => {
  const actor = await requireAdmin(event)
  await requireCsrf(event)
  const body = await readValidated(event, connectionTestRequestSchema)
  const studio = await useStudio()
  const record = await getInfrastructure(studio, routeParam(event, 'infrastructureId'))
  return testConnection(studio, studio.broker, record, routeParam(event, 'connectionKey'), actor, requestIdOf(event), body.connection)
})
