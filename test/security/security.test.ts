import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ConfigurationError, loadStudioConfig } from '~~/server/lib/config'
import { SecretCipher } from '~~/server/lib/crypto/cipher'
import { classifyAddress, rejectAddress, rejectUrl } from '~~/server/lib/network/address-policy'
import { readRoles } from '~~/server/lib/oidc/client'

describe('SecretCipher', () => {
  const cipher = new SecretCipher(randomBytes(32))

  it('round-trips with the same purpose', () => {
    const ciphertext = cipher.encrypt('refresh-token-value', 'target_credentials.refresh_token')
    expect(ciphertext).toMatch(/^v1\./)
    expect(ciphertext).not.toContain('refresh-token-value')
    expect(cipher.decrypt(ciphertext, 'target_credentials.refresh_token')).toBe('refresh-token-value')
  })

  it('rejects a ciphertext used for another purpose or with another key', () => {
    const ciphertext = cipher.encrypt('secret', 'infrastructures.client_secret')
    expect(() => cipher.decrypt(ciphertext, 'target_credentials.access_token')).toThrow()
    expect(() => new SecretCipher(randomBytes(32)).decrypt(ciphertext, 'infrastructures.client_secret')).toThrow()
  })
})

describe('address policy', () => {
  it.each([
    ['127.0.0.1', 'private'],
    ['::1', 'private'],
    ['10.1.2.3', 'private'],
    ['172.20.0.5', 'private'],
    ['192.168.1.10', 'private'],
    ['::ffff:192.168.1.10', 'private'],
    ['fd12:3456::1', 'private'],
    ['169.254.169.254', 'forbidden'],
    ['0.0.0.0', 'forbidden'],
    ['fe80::1', 'forbidden'],
    ['224.0.0.1', 'forbidden'],
    ['8.8.8.8', 'public'],
    ['2a00:1450:4001::200e', 'public'],
  ])('classifies %s as %s', (address, expected) => {
    expect(classifyAddress(address)).toBe(expected)
  })

  it('never allows cloud metadata endpoints, even with private networks allowed', () => {
    expect(rejectAddress('169.254.169.254', 'http:', { allowPrivateNetwork: true })).toMatch(/forbidden/)
  })

  it('allows plain HTTP only inside private networks', () => {
    expect(rejectAddress('10.0.0.5', 'http:', { allowPrivateNetwork: true })).toBeNull()
    expect(rejectAddress('10.0.0.5', 'http:', { allowPrivateNetwork: false })).toMatch(/private/)
    expect(rejectAddress('8.8.8.8', 'http:', { allowPrivateNetwork: true })).toMatch(/HTTPS/)
    expect(rejectAddress('8.8.8.8', 'https:', { allowPrivateNetwork: false })).toBeNull()
  })

  it.each(['ftp://example.com', 'https://user:pass@example.com', 'https://example.com/#x'])('rejects %s', url => {
    expect(rejectUrl(new URL(url))).not.toBeNull()
  })
})

describe('configuration', () => {
  const dataKey = randomBytes(32).toString('base64url')
  const hosted = {
    STUDIO_PUBLIC_URL: 'https://studio.example.com/',
    STUDIO_DATA_KEY: dataKey,
    STUDIO_OIDC_ISSUER: 'https://idp.example.com/realms/x',
    STUDIO_OIDC_CLIENT_ID: 'studio',
    STUDIO_DATABASE_URL: 'postgres://u:p@db:5432/studio',
  }

  it('derives hosted settings and secure cookies from the public URL', () => {
    const config = loadStudioConfig(hosted, 'hosted')
    expect(config.publicUrl).toBe('https://studio.example.com')
    expect(config.secureCookies).toBe(true)
    expect(config.database).toEqual({ kind: 'postgres', url: hosted.STUDIO_DATABASE_URL })
    expect(config.allowPrivateNetworkTargets).toBe(false)
    expect(config.login?.scopes).toContain('openid')
  })

  it('requires login and a data key for hosted deployments', () => {
    expect(() => loadStudioConfig({ ...hosted, STUDIO_OIDC_ISSUER: undefined }, 'hosted')).toThrow(ConfigurationError)
    expect(() => loadStudioConfig({ ...hosted, STUDIO_DATA_KEY: 'too-short' }, 'hosted')).toThrow(ConfigurationError)
  })

  it('always embeds PGlite on desktop and allows local targets', () => {
    const config = loadStudioConfig({ STUDIO_DATA_KEY: dataKey, STUDIO_DATABASE_URL: hosted.STUDIO_DATABASE_URL, NITRO_PORT: '49152', STUDIO_DATA_DIR: '/data' }, 'desktop')
    expect(config.database).toEqual({ kind: 'pglite', dataDir: '/data/db' })
    expect(config.publicUrl).toBe('http://127.0.0.1:49152')
    expect(config.login).toBeNull()
    expect(config.allowPrivateNetworkTargets).toBe(true)
  })
})

describe('role claims', () => {
  it('reads flat, nested and space-separated role claims', () => {
    expect(readRoles({ roles: ['a', 'b', 3] }, 'roles')).toEqual(['a', 'b'])
    expect(readRoles({ realm_access: { roles: ['admin'] } }, '/realm_access/roles')).toEqual(['admin'])
    expect(readRoles({ scp: 'read write' }, 'scp')).toEqual(['read', 'write'])
    expect(readRoles(undefined, 'roles')).toEqual([])
  })
})
