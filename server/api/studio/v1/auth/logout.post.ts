import type { LogoutResult } from '#shared/contract'
import { deleteCookie } from 'nuxt/server'
import { recordAudit } from '~~/server/lib/audit'
import { endSessionUrl, getOidcClient } from '~~/server/lib/oidc/client'
import { deleteSession, sessionCookieName, sessionIdToken } from '~~/server/lib/sessions'
import { studioUrl } from '~~/server/lib/urls'
import { currentSession, requireCsrf } from '~~/server/utils/auth'
import { defineStudioHandler, requestIdOf } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'

export default defineStudioHandler(async (event): Promise<LogoutResult> => {
  const studio = await useStudio()
  const resolved = await currentSession(event)
  if (!resolved || studio.config.deploymentMode === 'desktop' || !studio.config.login) {
    return { logoutUrl: null }
  }
  await requireCsrf(event)
  const idToken = sessionIdToken(studio, resolved.session)
  // Deleting the session also deletes all target credentials of this session.
  await deleteSession(studio, resolved.session.id)
  deleteCookie(event, sessionCookieName(studio.config), { path: '/' })
  await recordAudit(studio, { action: 'studio.logout', outcome: 'success', requestId: requestIdOf(event), actorSubject: resolved.actor.subject })

  const client = await getOidcClient({ ...studio.config.login, allowPrivateNetwork: true }).catch(() => undefined)
  return { logoutUrl: client ? endSessionUrl(client, { idToken, postLogoutRedirectUri: studioUrl(studio.config) }) : null }
})
