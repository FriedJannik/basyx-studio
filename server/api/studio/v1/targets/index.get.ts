import type { Target } from '#shared/contract'
import { listInfrastructures } from '~~/server/lib/infrastructures'
import { toWorkspaceTarget } from '~~/server/lib/workspaces/manager'
import { requireActor } from '~~/server/utils/auth'
import { defineStudioHandler } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'
import { capabilityRestrictions, toTarget } from '~~/server/utils/target'

export default defineStudioHandler(async (event): Promise<{ items: Target[] }> => {
  const actor = await requireActor(event)
  const studio = await useStudio()
  const records = await listInfrastructures(studio)
  const workspaces = studio.workspaces ? await studio.workspaces.list() : []
  return {
    items: [
      ...workspaces.map(info => toWorkspaceTarget(info)),
      ...await Promise.all(records.map(async record => toTarget(record, await studio.broker.authenticationState(record, actor.sessionId), capabilityRestrictions(studio.config)))),
    ],
  }
})
