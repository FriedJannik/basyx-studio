import type { Preferences } from '#shared/contract'
import { getPreferences } from '~~/server/lib/preferences'
import { requireActor } from '~~/server/utils/auth'
import { defineStudioHandler } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'

export default defineStudioHandler(async (event): Promise<Preferences> => {
  const actor = await requireActor(event)
  return getPreferences(await useStudio(), actor.subject)
})
