import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { configurationWarnings, loadStudioConfig } from '~~/server/lib/config'

const base = {
  STUDIO_PUBLIC_URL: 'https://studio.example.org',
  STUDIO_DATA_KEY: randomBytes(32).toString('base64url'),
}

describe('anonymous mode', () => {
  it('needs no login provider and gives visitors the configured roles', () => {
    const config = loadStudioConfig({ ...base, STUDIO_AUTH_MODE: 'none', STUDIO_ANONYMOUS_ROLES: 'studio-admin, viewer' }, 'hosted')
    expect(config.login).toBeNull()
    expect(config.anonymous).toEqual({ roles: ['studio-admin', 'viewer'] })
  })

  it('keeps login the default, and never applies on desktop', () => {
    expect(() => loadStudioConfig(base, 'hosted')).toThrow(/STUDIO_OIDC_ISSUER/)
    expect(loadStudioConfig({ STUDIO_DATA_KEY: base.STUDIO_DATA_KEY, STUDIO_AUTH_MODE: 'none' }, 'desktop').anonymous).toBeNull()
  })

  it('warns about ignored login settings and administrators without login', () => {
    const env = { ...base, STUDIO_AUTH_MODE: 'none', STUDIO_ANONYMOUS_ROLES: 'studio-admin', STUDIO_OIDC_ISSUER: 'https://idp.example.org' }
    const warnings = configurationWarnings(loadStudioConfig(env, 'hosted'), env)
    expect(warnings.join('\n')).toMatch(/STUDIO_OIDC_\* settings are ignored/)
    expect(warnings.join('\n')).toMatch(/every visitor may change infrastructures/)

    const local = { ...env, STUDIO_PUBLIC_URL: 'http://localhost:3000' }
    expect(configurationWarnings(loadStudioConfig(local, 'hosted'), local).join('\n')).not.toMatch(/every visitor may change/)
  })
})
