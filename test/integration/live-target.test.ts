import type { OutboundPolicy } from '~~/server/lib/network/guarded-fetch'
import { describe, expect, it, vi } from 'vitest'
import { LiveAasTarget } from '~~/server/lib/targets/live-target'
import { delegated, policy, record } from '../support/live'
import { openTargetUrl, securedTargetUrl, testenvAvailable, testUserAccessToken } from '../support/testenv'

describe.runIf(testenvAvailable)('LiveAasTarget against the test environment', () => {
  const open = (overrides: Partial<OutboundPolicy> = {}) => new LiveAasTarget({
    record: record(openTargetUrl, { mode: 'unsecured' }),
    access: { accessToken: undefined, downstreamIdentity: null },
    policy: policy(openTargetUrl, overrides),
    requestId: 'test-request',
    onUnauthorized: async () => {},
  })

  async function secured (username: string | undefined, onUnauthorized = async () => {}) {
    return new LiveAasTarget({
      record: record(securedTargetUrl, delegated),
      access: { accessToken: username ? await testUserAccessToken(username) : undefined, downstreamIdentity: null },
      policy: policy(securedTargetUrl),
      requestId: 'test-request',
      onUnauthorized,
    })
  }

  it('pages through all shells with the cursor', async () => {
    const target = open()
    let cursor: string | undefined
    const ids: string[] = []
    for (let page = 0; page < 10; page++) {
      const result = await target.listShells(25, cursor)
      ids.push(...result.items.map(shell => shell.id))
      cursor = result.page.nextCursor ?? undefined
      if (!cursor) {
        break
      }
    }
    // Other test files may add shells meanwhile; the fixtures' 62 are all there, once.
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter(id => id.startsWith('urn:studio:test:aas:paging:'))).toHaveLength(60)
    expect(ids.length).toBeGreaterThanOrEqual(62)
  })

  it('reads nested elements and lists of lists as JSON', async () => {
    const target = open()
    expect((await target.element('urn:studio:test:sm:edge-cases', 'Level1.Level2.Items[1].Details.Deepest')).value)
      .toMatchObject({ modelType: 'Property', value: 'deepest value of item 1' })
    expect((await target.element('urn:studio:test:sm:edge-cases', 'NestedLists[1][0]')).value)
      .toMatchObject({ modelType: 'Property', value: 'c' })
  })

  it('resolves submodel references including the dangling one', async () => {
    const target = open()
    const ids = await target.submodelIds('urn:studio:test:aas:edge-cases')
    expect(ids).toEqual(['urn:studio:test:sm:edge-cases', 'urn:studio:test:sm:large', 'urn:studio:test:sm:missing'])
    await expect(target.submodelMetadata('urn:studio:test:sm:missing')).rejects.toMatchObject({ code: 'target_resource_not_found' })
    expect(await target.submodelMetadata('urn:studio:test:sm:edge-cases')).toMatchObject({ idShort: 'EdgeCases' })
  })

  it('maps downstream authorization failures', async () => {
    await expect((await secured(undefined)).listShells(10, undefined)).rejects.toMatchObject({ code: 'target_forbidden' })
    await expect((await secured('bob')).listShells(10, undefined)).rejects.toMatchObject({ code: 'target_forbidden' })
    const carol = await secured('carol')
    expect((await carol.listShells(10, undefined)).items.map(shell => shell.idShort)).toEqual(['SecuredPublicShell'])
    await expect(carol.submodelMetadata('urn:studio:test:secured:sm:restricted-costs')).rejects.toMatchObject({ code: 'target_forbidden' })
  })

  it('treats a token for another audience as rejected and invalidates it', async () => {
    const onUnauthorized = vi.fn(async () => {})
    const target = new LiveAasTarget({
      record: record(securedTargetUrl, delegated),
      access: { accessToken: await testUserAccessToken('alice', 'openid'), downstreamIdentity: null },
      policy: policy(securedTargetUrl),
      requestId: 'test-request',
      onUnauthorized,
    })
    await expect(target.listShells(10, undefined)).rejects.toMatchObject({ code: 'target_auth_required' })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('blocks origins and private addresses outside the policy', async () => {
    await expect(open({ allowedOrigins: new Set(['http://localhost:9']) }).listShells(10, undefined))
      .rejects
      .toMatchObject({ code: 'target_blocked' })
    await expect(open({ allowPrivateNetwork: false }).listShells(10, undefined))
      .rejects
      .toMatchObject({ code: 'target_blocked' })
  })

  it('enforces the response size limit', async () => {
    await expect(open({ maxResponseBytes: 1000 }).submodel('urn:studio:test:sm:large'))
      .rejects
      .toMatchObject({ code: 'target_invalid_response' })
  })
})
