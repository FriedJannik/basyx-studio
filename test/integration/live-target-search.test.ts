import type { InfrastructureRecord } from '~~/server/lib/infrastructures'
import { beforeAll, describe, expect, it } from 'vitest'
import { StudioProblem } from '~~/server/lib/problem'
import { LiveAasTarget } from '~~/server/lib/targets/live-target'
import { policy, record } from '../support/live'
import { openTargetUrl, testenvAvailable } from '../support/testenv'

// The shell and element search (MVP-4 plan, S2) against the open BaSyx Go AAS
// environment, which announces the query profiles of all its services.

const motorShell = 'urn:fraunhofer:iese:dte:aas:drivemotor-dm3000:001'
const motorNameplate = 'urn:fraunhofer:iese:dte:sm:nameplate:drivemotor-dm3000:001'
const encode = (id: string) => Buffer.from(id).toString('base64url')

let profiles: string[] = []

function target (listSource: InfrastructureRecord['listSource'], announced = true) {
  return new LiveAasTarget({
    record: {
      ...record(openTargetUrl, { mode: 'unsecured' }),
      template: 'mono-all',
      endpoints: [{ type: 'aasEnvironment', url: openTargetUrl }],
      listSource,
      serviceProfiles: { aasEnvironment: announced ? profiles : [] },
    },
    access: { accessToken: undefined, downstreamIdentity: null },
    policy: policy(openTargetUrl),
    requestId: 'test-request',
    onUnauthorized: async () => {},
  })
}

async function problemOf (promise: Promise<unknown>): Promise<StudioProblem> {
  const error = await promise.catch((error_: unknown) => error_)
  expect(error).toBeInstanceOf(StudioProblem)
  return error as StudioProblem
}

describe.runIf(testenvAvailable)('LiveAasTarget search', () => {
  beforeAll(async () => {
    profiles = (await (await fetch(`${openTargetUrl}/description`)).json() as { profiles: string[] }).profiles
  })

  it.each(['registry', 'repository'] as const)('finds shells case-insensitively through the %s', async listSource => {
    const page = await target(listSource).searchShells({ expression: 'dm3000' }, 20, undefined)
    expect(page.endpoint).toBe(listSource)
    expect(page.items.map(shell => shell.id)).toContain(motorShell)
  })

  it.each(['registry', 'repository'] as const)('applies field filters and exclusions through the %s', async listSource => {
    const live = target(listSource)
    // The test data holds instances only.
    const instances = await live.searchShells({ expression: 'dm3000 assetKind=Instance' }, 100, undefined)
    expect(instances.items.map(shell => shell.id)).toContain(motorShell)
    expect((await live.searchShells({ expression: 'assetKind=Type' }, 100, undefined)).items).toEqual([])
    const others = await live.searchShells({ expression: `-id:${motorShell}` }, 100, undefined)
    expect(others.items.map(shell => shell.id)).not.toContain(motorShell)
  })

  it('lists all shells for an empty search', async () => {
    const page = await target('repository').searchShells({ expression: '  ' }, 100, undefined)
    expect(page.items.map(shell => shell.id)).toContain(motorShell)
  })

  it('runs a valid raw query and refuses $select and foreign roots with findings', async () => {
    const live = target('repository')
    const page = await live.searchShells({ query: { $condition: { $eq: [{ $field: '$aas#id' }, { $strVal: motorShell }] } } }, 10, undefined)
    expect(page.items.map(shell => shell.id)).toEqual([motorShell])

    const select = await problemOf(live.searchShells({ query: { $select: 'id', $condition: { $boolean: true } } }, 10, undefined))
    expect(select.code).toBe('query_invalid')
    const foreign = await problemOf(live.searchShells({ query: { $condition: { $eq: [{ $field: '$aasdesc#id' }, { $strVal: motorShell }] } } }, 10, undefined))
    expect(foreign.code).toBe('query_invalid')
    expect(JSON.stringify(foreign.violations)).toContain('$aasdesc#id')
  })

  it('finds submodel elements by idShort with the shell that references them', async () => {
    const hits = await target('repository').searchElements('manufacturername', 6)
    expect(hits).toContainEqual(expect.objectContaining({
      submodelKey: encode(motorNameplate),
      shellKey: encode(motorShell),
      label: 'ManufacturerName',
    }))
  })

  it('refuses to search where no query profile is announced', async () => {
    const live = target('repository', false)
    expect((await problemOf(live.searchShells({ expression: 'dm3000' }, 10, undefined))).code).toBe('query_unsupported')
    expect((await problemOf(live.searchElements('dm3000', 10))).code).toBe('query_unsupported')
  })
})
