import type { IncomingHttpHeaders, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ConfigurationError, loadStudioConfig } from '~~/server/lib/config'
import { externalOriginAllowed, fetchExternalFile } from '~~/server/lib/network/external-files'
import { StudioProblem } from '~~/server/lib/problem'

// ADR 0042: Studio's server fetches files that AAS content names at other
// hosts, only from origins the deployment lists, and follows redirects only
// to such origins.

const hosted = {
  STUDIO_PUBLIC_URL: 'https://studio.example.com/',
  STUDIO_DATA_KEY: randomBytes(32).toString('base64url'),
  STUDIO_OIDC_ISSUER: 'https://idp.example.com/realms/x',
  STUDIO_OIDC_CLIENT_ID: 'studio',
}

describe('STUDIO_EXTERNAL_FILE_ORIGINS', () => {
  it('lists no origins when hosted and allows any on desktop by default', () => {
    expect(loadStudioConfig(hosted, 'hosted').externalFileOrigins).toEqual([])
    expect(loadStudioConfig({ STUDIO_DATA_KEY: hosted.STUDIO_DATA_KEY }, 'desktop').externalFileOrigins).toBe('*')
  })

  it('reads origins, with or without a trailing slash, and *', () => {
    const config = loadStudioConfig({ ...hosted, STUDIO_EXTERNAL_FILE_ORIGINS: 'https://c1.api.wago.com/, http://files.internal:8080' }, 'hosted')
    expect(config.externalFileOrigins).toEqual(['https://c1.api.wago.com', 'http://files.internal:8080'])
    expect(loadStudioConfig({ ...hosted, STUDIO_EXTERNAL_FILE_ORIGINS: '*' }, 'hosted').externalFileOrigins).toBe('*')
  })

  it.each(['https://example.com/files', 'ftp://example.com', 'example.com'])('refuses %s, which is no origin', entry => {
    expect(() => loadStudioConfig({ ...hosted, STUDIO_EXTERNAL_FILE_ORIGINS: entry }, 'hosted')).toThrow(ConfigurationError)
  })
})

describe('fetchExternalFile', () => {
  const requests: Array<{ url: string, headers: IncomingHttpHeaders }> = []
  let server: Server
  let other: Server
  let origin = ''
  let otherOrigin = ''

  const listen = (handler: Parameters<typeof createServer>[1]) => new Promise<Server>(resolve => {
    const created = createServer(handler)
    created.listen(0, '127.0.0.1', () => resolve(created))
  })
  const originOf = (listening: Server) => `http://127.0.0.1:${(listening.address() as AddressInfo).port}`

  beforeAll(async () => {
    // Path → status, headers and body; anything else is 404.
    const routes: Record<string, () => [number, Record<string, string>, string]> = {
      '/part.stp': () => [200, { 'Content-Type': 'application/octet-stream' }, 'ISO-10303-21;'],
      '/moved': () => [302, { Location: '/part.stp' }, ''],
      '/away': () => [302, { Location: `${otherOrigin}/part.stp` }, ''],
      '/loop': () => [302, { Location: '/loop' }, ''],
      '/large': () => [200, {}, 'x'.repeat(2048)],
    }
    server = await listen((request, response) => {
      requests.push({ url: request.url ?? '', headers: request.headers })
      const [status, headers, body] = routes[new URL(request.url ?? '/', origin).pathname]?.() ?? [404, {}, '']
      response.writeHead(status, headers).end(body)
    })
    origin = originOf(server)
    other = await listen((_request, response) => response.writeHead(200).end('other'))
    otherOrigin = originOf(other)
  })

  afterAll(() => {
    server.close()
    other.close()
  })

  const policy = () => ({ origins: new Set([origin]), allowPrivateNetwork: true, timeoutMs: 5000, maxBytes: 1024 })
  const problemOf = async (promise: Promise<unknown>) => {
    const error = await promise.then(() => null, (error: unknown) => error)
    expect(error).toBeInstanceOf(StudioProblem)
    return error as StudioProblem
  }

  it('fetches from a listed origin, without Origin, Referer, cookies or credentials', async () => {
    const file = await fetchExternalFile(policy(), `${origin}/part.stp`)
    expect(new TextDecoder().decode(file.bytes)).toBe('ISO-10303-21;')
    expect(file).toMatchObject({ contentType: 'application/octet-stream', fileName: 'part.stp' })
    const { headers } = requests.at(-1)!
    for (const name of ['origin', 'referer', 'cookie', 'authorization']) {
      expect(headers[name]).toBeUndefined()
    }
  })

  it('refuses an origin that is not listed, before contacting it', async () => {
    const before = requests.length
    expect((await problemOf(fetchExternalFile({ ...policy(), origins: new Set() }, `${origin}/part.stp`))).code).toBe('external_file_refused')
    expect(requests).toHaveLength(before)
    expect(externalOriginAllowed({ origins: '*' }, new URL(`${origin}/x`))).toBe(true)
  })

  it('refuses private addresses unless allowed, also with *', async () => {
    const problem = await problemOf(fetchExternalFile({ ...policy(), origins: '*', allowPrivateNetwork: false }, `${origin}/part.stp`))
    expect(problem.code).toBe('external_file_refused')
  })

  it('follows redirects within listed origins only', async () => {
    expect((await fetchExternalFile(policy(), `${origin}/moved`)).fileName).toBe('part.stp')
    expect((await problemOf(fetchExternalFile(policy(), `${origin}/away`))).code).toBe('external_file_refused')
    expect((await problemOf(fetchExternalFile(policy(), `${origin}/loop`))).detail).toMatch(/more than 3 times/)
  })

  it('reports error statuses and files above the limit as unavailable', async () => {
    const missing = await problemOf(fetchExternalFile(policy(), `${origin}/missing.stp`))
    expect(missing.code).toBe('external_file_unavailable')
    expect(missing.detail).toMatch(/HTTP 404/)
    expect((await problemOf(fetchExternalFile(policy(), `${origin}/large`))).detail).toMatch(/larger than/)
  })
})
