import { defineEventHandler, setResponseStatus } from 'nuxt/server'
import { databaseReachable } from '~~/server/lib/database/client'
import { useStudio } from '~~/server/utils/studio'

/**
 * Readiness probe: the configuration is valid, migrations are applied and
 * the database answers. Unauthenticated, so it reports no details.
 */
export default defineEventHandler(async event => {
  event.res.headers.set('Cache-Control', 'no-store')
  try {
    const studio = await useStudio()
    if (await databaseReachable(studio.db)) {
      return { status: 'ok' }
    }
  } catch {
    // Startup failures are logged where they happen.
  }
  setResponseStatus(event, 503)
  return { status: 'unavailable' }
})
