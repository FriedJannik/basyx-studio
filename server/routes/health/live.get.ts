import { defineEventHandler } from 'nuxt/server'

/**
 * Liveness probe: the process answers HTTP. It does not wait for the Studio
 * runtime, so a long migration never gets the container restarted.
 */
export default defineEventHandler(event => {
  event.res.headers.set('Cache-Control', 'no-store')
  return { status: 'ok' }
})
