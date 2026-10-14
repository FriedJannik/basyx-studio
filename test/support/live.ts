import type { InfrastructureRecord } from '~~/server/lib/infrastructures'
import type { OutboundPolicy } from '~~/server/lib/network/guarded-fetch'
import { defaultSyncSettings } from '#shared/contract'

// Records and policies for LiveAasTarget tests against the test environment.

export function record (url: string, security: InfrastructureRecord['security']): InfrastructureRecord {
  return {
    id: 'test',
    name: 'test',
    description: null,
    template: 'full',
    endpoints: [{ type: 'aasRepository', url }, { type: 'submodelRepository', url }],
    listSource: 'repository',
    sync: { ...defaultSyncSettings },
    serviceProfiles: {},
    probedAt: null,
    security,
    secretCiphertext: null,
    allowPrivateNetwork: true,
    revision: 1,
    createdBy: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export function policy (url: string, overrides: Partial<OutboundPolicy> = {}): OutboundPolicy {
  return { allowedOrigins: new Set([new URL(url).origin]), allowPrivateNetwork: true, timeoutMs: 10_000, maxResponseBytes: 10_000_000, ...overrides }
}

export const delegated: InfrastructureRecord['security'] = {
  mode: 'delegated_user',
  issuer: 'http://keycloak.localhost:18080/realms/basyx-studio',
  clientId: 'studio-web',
  scopes: ['openid', 'basyx-api'],
  clientSecret: null,
  desktopLoopbackHost: '127.0.0.1',
}
