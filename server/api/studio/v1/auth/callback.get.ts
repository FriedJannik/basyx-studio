import type { RequestEvent } from 'nuxt/server'
import type { AuthorizationTransaction } from '~~/server/lib/oidc/transactions'
import { defineEventHandler, getQuery, sendRedirect, setCookie, setResponseStatus } from 'nuxt/server'
import { recordAudit } from '~~/server/lib/audit'
import { getInfrastructure } from '~~/server/lib/infrastructures'
import { completeAuthorization, getOidcClient, readRoles } from '~~/server/lib/oidc/client'
import { consumeTransaction } from '~~/server/lib/oidc/transactions'
import { StudioProblem } from '~~/server/lib/problem'
import { createSession, sessionCookieName, sessionCookieOptions } from '~~/server/lib/sessions'
import { studioPath } from '~~/server/lib/urls'
import { requestIdOf } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'

function withQuery (path: string, name: string, value: string): string {
  const url = new URL(path, 'https://studio.invalid')
  url.searchParams.set(name, value)
  return `${url.pathname}${url.search}`
}

/** Desktop callbacks end in the system browser; tell the user where to continue. */
function desktopPage (event: RequestEvent, title: string, message: string): string {
  event.res.headers.set('Content-Type', 'text/html; charset=utf-8')
  event.res.headers.set('Content-Security-Policy', 'default-src \'none\'; style-src \'unsafe-inline\'')
  const escape = (text: string) => text.replace(/[&<>"']/g, character => `&#${character.codePointAt(0)};`)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5}</style></head>
<body><h1>${escape(title)}</h1><p>${escape(message)}</p></body></html>`
}

async function completeLogin (event: RequestEvent, transaction: AuthorizationTransaction, callbackUrl: URL): Promise<void> {
  const studio = await useStudio()
  const login = studio.config.login
  if (!login) {
    throw new StudioProblem('invalid_request', 'This Studio deployment has no user login.')
  }
  const client = await getOidcClient({ ...login, allowPrivateNetwork: true })
  const tokens = await completeAuthorization(client, callbackUrl, {
    state: transaction.state,
    nonce: transaction.nonce,
    codeVerifier: transaction.codeVerifier,
    idTokenExpected: true,
  })
  const claims = tokens.claims ?? {}
  const subject = String(claims.sub)
  const name = [claims.name, claims.preferred_username, claims.email, subject].find(value => typeof value === 'string' && value) as string
  const { token } = await createSession(studio, {
    subject,
    displayName: name,
    roles: readRoles(claims, studio.config.rolesClaim),
    idToken: tokens.idToken,
  })
  setCookie(event, sessionCookieName(studio.config), token, sessionCookieOptions(studio.config))
  await recordAudit(studio, { action: 'studio.login', outcome: 'success', requestId: requestIdOf(event), actorSubject: subject })
}

export default defineEventHandler(async event => {
  const studio = await useStudio()
  const desktop = studio.config.deploymentMode === 'desktop'
  const query = getQuery(event)
  const state = typeof query.state === 'string' ? query.state : ''
  const transaction = state ? await consumeTransaction(studio, state) : undefined

  if (!transaction) {
    if (desktop) {
      setResponseStatus(event, 400)
      return desktopPage(event, 'Sign-in link expired', 'Start the authorization again in BaSyx Studio.')
    }
    return sendRedirect(event, withQuery(studioPath(studio.config, '/'), 'authError', 'expired'))
  }

  const failed = (reason: string) => desktop
    ? desktopPage(event, 'Authorization failed', `BaSyx Studio could not complete the authorization (${reason}). Return to Studio and try again.`)
    : sendRedirect(event, withQuery(studioPath(studio.config, transaction.returnTo), 'authError', reason))

  if (typeof query.error === 'string') {
    return failed(query.error === 'access_denied' ? 'access_denied' : 'idp_error')
  }

  // openid-client derives the token request's redirect_uri from this URL,
  // so it must be exactly the registered redirect URI plus the response.
  const callbackUrl = new URL(transaction.redirectUri)
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      callbackUrl.searchParams.set(name, value)
    }
  }

  try {
    if (transaction.purpose === 'studio_login') {
      await completeLogin(event, transaction, callbackUrl)
    } else {
      const record = await getInfrastructure(studio, transaction.targetId ?? '')
      await studio.broker.completeAuthorization(record, transaction, callbackUrl, requestIdOf(event))
    }
  } catch (error) {
    console.warn(`[studio] authorization callback ${requestIdOf(event)} failed: ${(error as Error).message}`)
    return failed('rejected')
  }

  if (desktop) {
    return desktopPage(event, 'Authorization complete', 'You can close this browser tab and return to BaSyx Studio.')
  }
  return sendRedirect(event, studioPath(studio.config, transaction.returnTo))
})
