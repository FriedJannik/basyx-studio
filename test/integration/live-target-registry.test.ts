import type { InfrastructureRecord } from '~~/server/lib/infrastructures'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { shellAvailability } from '~~/server/lib/aas/availability'
import { StudioProblem } from '~~/server/lib/problem'
import { LiveAasTarget } from '~~/server/lib/targets/live-target'
import { policy, record } from '../support/live'
import { openTargetUrl, testenvAvailable } from '../support/testenv'

// Registry-based listing and resolution against the open BaSyx Go AAS
// environment, which keeps its registries in step with its repositories.

const motorShell = 'urn:fraunhofer:iese:dte:aas:drivemotor-dm3000:001'
const motorNameplate = 'urn:fraunhofer:iese:dte:sm:nameplate:drivemotor-dm3000:001'
const foreignShell = 'urn:studio:test:aas:foreign-descriptor'
const encode = (id: string) => Buffer.from(id).toString('base64url')

function target (overrides: Partial<InfrastructureRecord>, shellContext?: string) {
  return new LiveAasTarget({
    record: { ...record(openTargetUrl, { mode: 'unsecured' }), ...overrides },
    access: { accessToken: undefined, downstreamIdentity: null },
    policy: policy(openTargetUrl),
    requestId: 'test-request',
    onUnauthorized: async () => {},
    shellContext,
  })
}

const environment = { template: 'mono-all' as const, endpoints: [{ type: 'aasEnvironment' as const, url: openTargetUrl }] }
const registryOnly = {
  template: 'full' as const,
  endpoints: [{ type: 'aasRegistry' as const, url: openTargetUrl }, { type: 'submodelRegistry' as const, url: openTargetUrl }],
}

describe.runIf(testenvAvailable)('LiveAasTarget with registries', () => {
  beforeAll(async () => {
    // A descriptor whose endpoint lies outside the infrastructure.
    const response = await fetch(`${openTargetUrl}/shell-descriptors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: foreignShell,
        idShort: 'ForeignDescriptor',
        endpoints: [{ interface: 'AAS-3.2', protocolInformation: { href: `http://foreign.example.com/shells/${encode(foreignShell)}` } }],
      }),
    })
    expect([201, 409]).toContain(response.status)
  })

  afterAll(async () => {
    await fetch(`${openTargetUrl}/shell-descriptors/${encode(foreignShell)}`, { method: 'DELETE' })
  })

  it('lists shells from the registry or the repository, as configured', async () => {
    const fromRegistry = await target({ ...environment, listSource: 'registry' }).listShells(100, undefined)
    const fromRepository = await target({ ...environment, listSource: 'repository' }).listShells(100, undefined)
    expect(fromRegistry.items.map(shell => shell.id)).toEqual(expect.arrayContaining([motorShell, foreignShell]))
    expect(fromRepository.items.map(shell => shell.id)).not.toContain(foreignShell)
    expect(fromRegistry.items.find(shell => shell.id === motorShell)).toMatchObject({ assetKind: 'Instance', thumbnail: false })
  })

  it('opens shells and submodels through their descriptors without any repository endpoint', async () => {
    const live = target(registryOnly)
    expect((await live.shell(motorShell)).idShort).toBe('IESEDriveMotorDM3000')
    expect(await live.submodelIds(motorShell)).toContain(motorNameplate)
    expect((await live.submodel(motorNameplate)).idShort).toBe('Nameplate')
  })

  it('refuses a descriptor endpoint outside the infrastructure without contacting it', async () => {
    const error = await target(registryOnly).shell(foreignShell).catch((error_: unknown) => error_)
    expect(error).toBeInstanceOf(StudioProblem)
    expect((error as StudioProblem).code).toBe('descriptor_endpoint_blocked')
  })

  it('reports which shells of a page can be opened', async () => {
    const keys = [motorShell, foreignShell, 'urn:studio:test:aas:unknown'].map(id => encode(id))
    expect((await shellAvailability(target(registryOnly), keys)).items.map(item => item.status)).toEqual(['available', 'blocked', 'not_found'])
  })

  it('reports a shell the registry does not know as not found when there is no repository', async () => {
    const error = await target(registryOnly).shell('urn:studio:test:aas:unknown').catch((error_: unknown) => error_)
    expect((error as StudioProblem).code).toBe('target_resource_not_found')
  })

  it('reaches submodels through their shell on an infrastructure with an AAS repository only', async () => {
    const identifiable = { template: 'identifiable' as const, endpoints: [{ type: 'aasRepository' as const, url: openTargetUrl }] }
    const element = await target(identifiable, motorShell).element(motorNameplate, 'ManufacturerName')
    expect(element.value.modelType).toBe('MultiLanguageProperty')
    const error = await target(identifiable).submodel(motorNameplate).catch((error_: unknown) => error_)
    expect((error as StudioProblem).code).toBe('unsupported_operation')
  })
})
