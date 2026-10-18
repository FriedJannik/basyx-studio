import type { StudioConfig } from './config'
import { apiBasePath } from '#shared/contract'

export const callbackPath = `${apiBasePath}/auth/callback`

/** A path of this Studio Service (`/targets/x`) as seen from the browser, under the base path. */
export function studioPath (config: Pick<StudioConfig, 'basePath'>, path: string): string {
  return `${config.basePath}${path.replace(/^\/+/, '')}`
}

/** The absolute URL of a Studio page or route, for redirects that leave Studio (IdP, logout). */
export function studioUrl (config: Pick<StudioConfig, 'publicUrl' | 'basePath'>, path = '/'): string {
  return new URL(studioPath(config, path), config.publicUrl).href
}

/**
 * Redirect URI for authorization responses. Hosted: under the public URL.
 * Desktop: an RFC 8252 loopback URI on the local service's port, with the
 * loopback host the IdP registration expects (`127.0.0.1` or `localhost`).
 */
export function callbackUri (config: StudioConfig, loopbackHost?: '127.0.0.1' | 'localhost'): string {
  const base = new URL(config.publicUrl)
  if (config.deploymentMode === 'desktop' && loopbackHost) {
    base.hostname = loopbackHost
  }
  return new URL(studioPath(config, callbackPath), base).href
}
