import { describe, expect, it } from 'vitest'
import { appContentSecurityPolicy } from '../../server/lib/apps/csp'
import { readAppPackage } from '../../server/lib/apps/package'
import { toAppInstallation } from '../../server/lib/apps/store'
import { manifestOf, zipApp } from './support'

// The Content Security Policy of app files (ADR 0017), and what a manifest's
// `sandbox` adds to it (ADR 0038).

const base = 'https://apps.studio.example/app/app-0123456789abcdef/'
function directives (policy: string) {
  return Object.fromEntries(policy.split('; ').map(directive => {
    const [name, ...values] = directive.split(' ')
    return [name, values.join(' ')]
  }))
}

describe('appContentSecurityPolicy', () => {
  it('allows only the app\'s own files, no WebAssembly and no workers by default', () => {
    const policy = directives(appContentSecurityPolicy(base, ['https://studio.example']))
    expect(policy['script-src']).toBe(base)
    expect(policy['connect-src']).toBe(base)
    expect(policy['worker-src']).toBe('\'none\'')
    expect(policy['frame-ancestors']).toBe('https://studio.example')
    expect(policy.sandbox).toBe('allow-scripts')
  })

  it('adds WebAssembly and blob: workers only as declared', () => {
    expect(directives(appContentSecurityPolicy(base, [], { webAssembly: true }))).toMatchObject({
      'script-src': `${base} 'wasm-unsafe-eval'`,
      'worker-src': '\'none\'',
    })
    expect(directives(appContentSecurityPolicy(base, [], { workers: true }))).toMatchObject({
      'script-src': base,
      'worker-src': 'blob:',
    })
    // Never JavaScript eval, never other origins.
    const both = appContentSecurityPolicy(base, [], { webAssembly: true, workers: true })
    expect(both).not.toContain('\'unsafe-eval\'')
    expect(directives(both)['connect-src']).toBe(base)
  })
})

describe('the manifest sandbox', () => {
  it('is accepted and shown with the installation', () => {
    const pkg = readAppPackage(zipApp(manifestOf({ sandbox: { webAssembly: true, workers: true } })), 'hosted')
    expect(pkg.manifest.sandbox).toEqual({ webAssembly: true, workers: true })
    const record = { id: 'app-0123456789abcdef', appId: pkg.manifest.id, version: '1.0.0', manifest: pkg.manifest, digest: 'sha256:x', unsigned: true, bundled: false, installedAt: new Date(0), installedBy: 'admin' }
    expect(toAppInstallation(record as never).sandbox).toEqual({ webAssembly: true, workers: true })
    expect(toAppInstallation({ ...record, manifest: manifestOf() } as never).sandbox).toEqual({ webAssembly: false, workers: false })
  })

  it('accepts nothing but its two switches', () => {
    expect(() => readAppPackage(zipApp(manifestOf({ sandbox: { network: true } as never })), 'hosted'))
      .toThrow(expect.objectContaining({ violations: [{ path: 'studio-app.json#sandbox', message: 'has the unknown property "network"' }] }))
  })
})
