import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { basePathOf, normalizeBasePath } from '~~/docker/base-path.mjs'
import { ConfigurationError, loadStudioConfig } from '~~/server/lib/config'
import { sessionCookieName } from '~~/server/lib/sessions'
import { callbackUri, studioPath, studioUrl } from '~~/server/lib/urls'

const hosted = {
  STUDIO_PUBLIC_URL: 'https://example.org',
  STUDIO_DATA_KEY: randomBytes(32).toString('base64url'),
  STUDIO_OIDC_ISSUER: 'https://idp.example.org/realms/x',
  STUDIO_OIDC_CLIENT_ID: 'studio',
  STUDIO_APPS_URL: 'https://apps.example.org',
}

describe('base path', () => {
  it('normalizes the base path and serves apps and callbacks under it', () => {
    const config = loadStudioConfig(hosted, 'hosted', 'studio')
    expect(config.basePath).toBe('/studio/')
    expect(config.publicUrl).toBe('https://example.org')
    expect(config.apps.baseUrl).toBe('https://apps.example.org/studio/app/')
    expect(callbackUri(config)).toBe('https://example.org/studio/api/studio/v1/auth/callback')
    expect(studioPath(config, '/targets/x')).toBe('/studio/targets/x')
    expect(studioUrl(config)).toBe('https://example.org/studio/')
  })

  it('keeps everything at the root without a base path', () => {
    const config = loadStudioConfig(hosted, 'hosted')
    expect(config.basePath).toBe('/')
    expect(config.apps.baseUrl).toBe('https://apps.example.org/app/')
    expect(callbackUri(config)).toBe('https://example.org/api/studio/v1/auth/callback')
    expect(studioPath(config, '/')).toBe('/')
  })

  it('accepts a public URL that names the same base path and rejects a different one', () => {
    expect(loadStudioConfig({ ...hosted, STUDIO_PUBLIC_URL: 'https://example.org/a/b' }, 'hosted', '/a/b/').basePath).toBe('/a/b/')
    expect(() => loadStudioConfig({ ...hosted, STUDIO_PUBLIC_URL: 'https://example.org/other' }, 'hosted', '/studio/')).toThrow(ConfigurationError)
    expect(() => loadStudioConfig({ ...hosted, STUDIO_PUBLIC_URL: 'https://example.org/studio' }, 'hosted')).toThrow(ConfigurationError)
  })

  it('rejects paths that are not plain and any base path on desktop', () => {
    expect(() => loadStudioConfig(hosted, 'hosted', '/a/../b/')).toThrow(ConfigurationError)
    expect(() => loadStudioConfig(hosted, 'hosted', '/a b/')).toThrow(ConfigurationError)
    expect(() => loadStudioConfig({ STUDIO_DATA_KEY: hosted.STUDIO_DATA_KEY }, 'desktop', '/studio/')).toThrow(ConfigurationError)
  })

  it('gives each base path its own session cookie', () => {
    expect(sessionCookieName({ secureCookies: true, basePath: '/' })).toBe('__Host-studio_session')
    expect(sessionCookieName({ secureCookies: true, basePath: '/studio/' })).toMatch(/^__Host-studio_session_[\w-]{16}$/)
    expect(sessionCookieName({ secureCookies: false, basePath: '/studio/' })).toMatch(/^studio_session_[\w-]{16}$/)
    // Paths that a joined name would confuse.
    expect(sessionCookieName({ secureCookies: false, basePath: '/a/b/' })).not.toBe(sessionCookieName({ secureCookies: false, basePath: '/a_b/' }))
  })

  it('normalizes STUDIO_BASE_PATH in the container launcher like the service', () => {
    expect(normalizeBasePath('studio')).toBe('/studio/')
    expect(normalizeBasePath('/studio//x/')).toBe('/studio/x/')
    expect(normalizeBasePath('')).toBe('/')
    expect(() => normalizeBasePath('/a/../b')).toThrow()
    expect(basePathOf({ STUDIO_BASE_PATH: '/x', NUXT_APP_BASE_URL: '/y/' })).toBe('/x/')
    expect(basePathOf({ NUXT_APP_BASE_URL: '/y/' })).toBe('/y/')
    expect(basePathOf({})).toBe('/')
  })
})
