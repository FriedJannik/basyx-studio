import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadStudioConfig } from '~~/server/lib/config'
import { liveCapabilities, restrictCapabilities } from '~~/server/lib/targets/capabilities'

const env = {
  STUDIO_PUBLIC_URL: 'https://studio.example.org',
  STUDIO_DATA_KEY: randomBytes(32).toString('base64url'),
  STUDIO_OIDC_ISSUER: 'https://idp.example.org/realms/x',
  STUDIO_OIDC_CLIENT_ID: 'studio',
}

describe('deployment settings', () => {
  it('defaults to BaSyx Studio with everything allowed', () => {
    expect(loadStudioConfig(env, 'hosted').deployment).toEqual({
      productName: 'BaSyx Studio',
      logo: { light: null, dark: null },
      accent: null,
      legal: { copyrightName: null, legalNoticeUrl: null, privacyPolicyUrl: null },
      readOnly: false,
      uploads: true,
      appInstalls: true,
    })
  })

  it('reads branding, legal links and switches', () => {
    const directory = mkdtempSync(join(tmpdir(), 'studio-logo-'))
    const file = join(directory, 'logo.svg')
    writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const deployment = loadStudioConfig({
      ...env,
      STUDIO_PRODUCT_NAME: 'Factory Studio',
      STUDIO_LOGO: file,
      STUDIO_LOGO_DARK: 'https://cdn.example.org/logo-dark.png',
      STUDIO_PRIMARY_COLOR: '#aa3300',
      STUDIO_PRIMARY_COLOR_DARK: '#ff8844',
      STUDIO_COPYRIGHT_NAME: 'Example GmbH',
      STUDIO_LEGAL_NOTICE_URL: 'https://example.org/imprint',
      STUDIO_READ_ONLY: 'true',
      STUDIO_ALLOW_UPLOADS: 'false',
      STUDIO_APPS_ALLOW_INSTALL: 'false',
    }, 'hosted').deployment
    expect(deployment).toMatchObject({
      productName: 'Factory Studio',
      logo: { light: { file, contentType: 'image/svg+xml' }, dark: { url: 'https://cdn.example.org/logo-dark.png' } },
      accent: { light: '#AA3300', dark: '#FF8844' },
      legal: { copyrightName: 'Example GmbH', legalNoticeUrl: 'https://example.org/imprint', privacyPolicyUrl: null },
      readOnly: true,
      uploads: false,
      appInstalls: false,
    })
  })

  it('rejects logos it cannot serve and colours that are not #RRGGBB', () => {
    expect(() => loadStudioConfig({ ...env, STUDIO_LOGO: 'logo.svg' }, 'hosted')).toThrow(/absolute path/)
    expect(() => loadStudioConfig({ ...env, STUDIO_LOGO: '/missing/logo.svg' }, 'hosted')).toThrow(/does not exist/)
    expect(() => loadStudioConfig({ ...env, STUDIO_LOGO: '/etc/hosts' }, 'hosted')).toThrow(/SVG, PNG, WebP or JPEG/)
    expect(() => loadStudioConfig({ ...env, STUDIO_PRIMARY_COLOR: 'red' }, 'hosted')).toThrow(/STUDIO_PRIMARY_COLOR/)
  })
})

describe('capability restrictions', () => {
  const capabilities = liveCapabilities({
    endpoints: [{ type: 'aasEnvironment', url: 'https://basyx.example.org' }],
    template: 'mono-all',
    serviceProfiles: {},
    security: { mode: 'unsecured' },
    listSource: 'repository',
  })

  it('leaves capabilities as they are by default', () => {
    expect(restrictCapabilities(capabilities, { readOnly: false, uploads: true })).toEqual(capabilities)
  })

  it('takes every write away when read-only, and only uploads when uploads are off', () => {
    const readOnly = restrictCapabilities(capabilities, { readOnly: true, uploads: true })
    expect(readOnly).toMatchObject({ write: false, writeStructure: false, createResources: false, deleteShells: false, upload: false, operations: false, sharing: false, export: true, files: true })
    expect(restrictCapabilities(capabilities, { readOnly: false, uploads: false })).toEqual({ ...capabilities, upload: false })
  })
})
