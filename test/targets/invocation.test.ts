import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LiveAasTarget } from '~~/server/lib/targets/live-target'
import { policy, record } from '../support/live'

// Operation invocations of a live target against a stand-in submodel
// repository that answers as BaSyx Go does: `202` with the handle in
// `Location`, the status while running, then a redirect (302) to the result.

const submodelId = 'urn:studio:test:sm:invocations'
const handle = 'SMREPO-ASYNC-h+1'
const elementPath = `/submodels/${Buffer.from(submodelId).toString('base64url')}/submodel-elements/Double`
const variable = (idShort: string) => ({ value: { modelType: 'Property', idShort, valueType: 'xs:int' } })
const operation = { modelType: 'Operation', idShort: 'Double', inputVariables: [variable('Offset')], outputVariables: [variable('Result')] }

describe('LiveAasTarget operation invocations', () => {
  const requests: Array<{ method: string, path: string, body: unknown }> = []
  let statusPolls = 0
  let url = ''

  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => body += chunk.toString())
    request.on('end', () => {
      const path = decodeURIComponent(new URL(request.url!, 'http://x').pathname)
      requests.push({ method: request.method!, path, body: body ? JSON.parse(body) : undefined })
      const json = (status: number, value: unknown, headers: Record<string, string> = {}) => {
        response.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(value))
      }
      switch (`${request.method} ${path}`) {
        case `GET ${elementPath}`: {
          return json(200, operation)
        }
        case `POST ${elementPath}/invoke/$value`: {
          return json(200, { executionState: 'Completed', success: true, outputArguments: { Result: 42 } })
        }
        case `POST ${elementPath}/invoke-async/$value`: {
          return response.writeHead(202, { Location: `${elementPath}/operation-status/${encodeURIComponent(handle)}` }).end()
        }
        case `GET ${elementPath}/operation-status/${handle}`: {
          return ++statusPolls === 1
            ? json(200, { executionState: 'Running' })
            : response.writeHead(302, { Location: `${elementPath}/operation-results/${encodeURIComponent(handle)}` }).end()
        }
        case `GET ${elementPath}/operation-results/${handle}/$value`: {
          return json(200, { executionState: 'Completed', success: true, outputArguments: { Result: 8 } })
        }
        default: {
          return json(404, { messages: [{ text: `no route for ${request.method} ${path}` }] })
        }
      }
    })
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

  it('invokes synchronously without an AAS identifier', async () => {
    expect(await target().invoke(submodelId, 'Double', [{ idShort: 'Offset', value: '21' }], false)).toEqual({
      handle: null,
      state: 'completed',
      outputs: [{ idShort: 'Result', valueType: 'xs:int', value: 42 }],
      message: null,
    })
    expect(requests.at(-1)).toEqual({ method: 'POST', path: `${elementPath}/invoke/$value`, body: { inputArguments: { Offset: 21 } } })
  })

  it('returns the handle of an asynchronous invocation and reads the result after the status redirects', async () => {
    const started = await target().invoke(submodelId, 'Double', [{ idShort: 'Offset', value: '4' }], true)
    expect(started).toEqual({ handle, state: 'running', outputs: [], message: null })
    expect(requests.at(-1)?.body).toEqual({ inputArguments: { Offset: 4 }, clientTimeoutDuration: 'PT60S' })

    expect((await target().invocation(submodelId, 'Double', handle)).state).toBe('running')
    expect(await target().invocation(submodelId, 'Double', handle)).toEqual({
      handle,
      state: 'completed',
      outputs: [{ idShort: 'Result', valueType: 'xs:int', value: 8 }],
      message: null,
    })
    // The redirect is read as an answer, not followed.
    expect(requests.filter(request => request.path.includes('/operation-results/'))).toHaveLength(1)
  })
})
