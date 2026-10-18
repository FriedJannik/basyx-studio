import { defineEventHandler, getCookie, getRequestHeader, setCookie } from 'nuxt/server'
import { apiBasePath } from '#shared/contract'
import { createSession, findSession, sessionCookieName, sessionCookieOptions } from '../lib/sessions'
import { actorOf } from '../utils/auth'
import { useStudio } from '../utils/studio'

const appCallsPath = `${apiBasePath}/app-calls`

declare module 'nuxt/schema' {
  interface RequestEventContext {
    /** The request's cookies with a session it just got, for the server render's API calls. */
    sessionCookieHeader?: string
  }
}

/**
 * Without login (STUDIO_AUTH_MODE=none, ADR 0036), the first page or API
 * request of a browser gets a session as the `anonymous` user, so CSRF
 * tokens and per-user target credentials work as with a login. This request
 * already acts in the new session, and the server render's own API calls send
 * its cookie (app/composables/useStudioFetch.ts), so they use the same session
 * instead of creating more.
 */
export default defineEventHandler(async event => {
  const path = event.url.pathname
  if (path.startsWith('/health/') || path.startsWith('/app/') || path === appCallsPath) {
    return
  }
  const isPage = getRequestHeader(event, 'sec-fetch-dest') === 'document' || (getRequestHeader(event, 'accept') ?? '').includes('text/html')
  if (!isPage && !path.startsWith(`${apiBasePath}/`)) {
    return
  }
  const studio = await useStudio()
  const anonymous = studio.config.anonymous
  if (!anonymous) {
    return
  }
  const name = sessionCookieName(studio.config)
  const existing = getCookie(event, name)
  if (existing && await findSession(studio, existing)) {
    return
  }
  const { token, session } = await createSession(studio, { subject: 'anonymous', displayName: 'Anonymous', roles: anonymous.roles, idToken: undefined })
  setCookie(event, name, token, sessionCookieOptions(studio.config))
  event.context.studioSession = { session, actor: actorOf(session, studio.config.adminRole) }
  const cookies = (getRequestHeader(event, 'cookie') ?? '').split(';').map(part => part.trim()).filter(part => part && !part.startsWith(`${name}=`))
  event.context.sessionCookieHeader = [...cookies, `${name}=${token}`].join('; ')
})
