import type { Preferences } from '#shared/contract'
import { readBody } from 'nuxt/server'
import { savePreferences } from '~~/server/lib/preferences'
import { StudioProblem } from '~~/server/lib/problem'
import { requireActor, requireCsrf } from '~~/server/utils/auth'
import { defineStudioHandler } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'

/** Replaces the signed-in user's preferences (validated in `savePreferences`). */
export default defineStudioHandler(async (event): Promise<Preferences> => {
  const actor = await requireActor(event)
  await requireCsrf(event)
  const body = await readBody(event).catch(() => {
    throw new StudioProblem('invalid_request', 'The request body is not valid JSON.')
  })
  return savePreferences(await useStudio(), actor.subject, body)
})
