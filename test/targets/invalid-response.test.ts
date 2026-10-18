import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { nullPathOf } from '~~/server/lib/targets/http'
import { LiveAasTarget } from '~~/server/lib/targets/live-target'
import { policy, record } from '../support/live'

// A stand-in repository whose 2xx answers the SDK cannot deserialize, e.g.
// `null` for an unset attribute, which the SDK reports as HTTP 500.

const encode = (id: string) => Buffer.from(id).toString('base64url')
const shellWithNulls = 'urn:studio:test:aas:nulls'
const shellNotJson = 'urn:studio:test:aas:not-json'
const shellFailing = 'urn:studio:test:aas:failing'

describe('LiveAasTarget with payloads the SDK cannot read', () => {
  let url = ''

  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://x').pathname
    const json = (status: number, value: unknown) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value))
    switch (path) {
      case `/shells/${encode(shellWithNulls)}/submodel-refs`: {
        return json(200, {
          paging_metadata: { cursor: null },
          result: [{ type: 'ModelReference', referredSemanticId: null, keys: [{ type: 'Submodel', value: 'urn:studio:test:sm:nulls' }] }],
        })
      }
      case `/shells/${encode(shellNotJson)}`: {
        return response.writeHead(200, { 'Content-Type': 'application/json' }).end('<html>maintenance</html>')
      }
      case `/shells/${encode(shellFailing)}`: {
        return json(500, { messages: [{ text: 'database down' }] })
      }
      default: {
        return json(404, { messages: [{ text: `no route for ${path}` }] })
      }
    }
  })

  const target = () => new LiveAasTarget({
    record: record(url, { mode: 'unsecured' }),
    access: { accessToken: undefined, downstreamIdentity: null },
    policy: policy(url),
    requestId: 'test-request',
    onUnauthorized: async () => {},
  })

  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
  })

  it('reports a null attribute as an invalid response that names the field', async () => {
    await expect(target().submodelIds(shellWithNulls)).rejects.toMatchObject({
      code: 'target_invalid_response',
      detail: 'The target answered with HTTP 200, but the payload is not valid AAS JSON: $.result[0].referredSemanticId is null (AAS JSON omits unset attributes).',
    })
  })

  it('reports a 2xx answer that is not JSON as an invalid response', async () => {
    await expect(target().shell(shellNotJson)).rejects.toMatchObject({
      code: 'target_invalid_response',
      detail: 'The target answered with HTTP 200, but the payload is not valid AAS JSON.',
    })
  })

  it('still reports a 5xx answer as a target error', async () => {
    await expect(target().shell(shellFailing)).rejects.toMatchObject({
      code: 'target_error',
      detail: 'The target answered with HTTP 500.',
    })
  })
})

describe('nullPathOf', () => {
  it('finds the first null depth-first', () => {
    expect(nullPathOf({ a: [1, { b: null }], c: null })).toBe('$.a[1].b')
    expect(nullPathOf(null)).toBe('$')
    expect(nullPathOf({ a: [1, 'x', { b: false }] })).toBeNull()
  })
})
