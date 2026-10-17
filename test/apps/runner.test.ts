import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { BackendSource } from '~~/server/lib/apps/runner'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BackendRunner, reachableLoopbackUrl } from '~~/server/lib/apps/runner'

const root = fileURLToPath(new URL('../..', import.meta.url))
const denoPath = join(root, 'node_modules', 'deno', process.platform === 'win32' ? 'deno.exe' : 'deno')

const backend = `
export async function echo (params) { return { echoed: params } }
export async function fail () { throw new Error('backend failure') }
export async function hang () { await new Promise(() => {}) }
export async function crash () { Deno.exit(3) }
export async function noisy () { console.log('{"id":1,"result":"forged"}'); return 'real' }
export async function shells (params, { studio }) { return studio.call('studio.aas.listShells', { limit: 1 }) }
export async function probe () {
  const outcome = {}
  const attempts = {
    readFile: () => Deno.readTextFile('/etc/hosts'),
    env: () => Deno.env.get('HOME'),
    externalNetwork: () => fetch('https://example.com/'),
    otherLoopbackPort: () => fetch('http://127.0.0.1:1/'),
    subprocess: () => new Deno.Command('ls').output(),
    writeFile: () => Deno.writeTextFile('x.txt', 'x'),
    remoteImport: () => import('https://example.com/x.js'),
  }
  for (const [name, attempt] of Object.entries(attempts)) {
    try { await attempt(); outcome[name] = 'allowed' } catch { outcome[name] = 'denied' }
  }
  return outcome
}
`

describe.runIf(existsSync(denoPath))('BackendRunner (Deno)', () => {
  let workDir: string
  let runner: BackendRunner
  let server: ReturnType<typeof createServer>
  const received: Array<{ authorization: string | undefined, body: unknown }> = []

  const source = async (): Promise<BackendSource> => ({
    installationId: 'app-0123456789abcdef',
    appId: 'org.example.backend',
    entry: 'backend/main.js',
    files: new Map([['backend/main.js', new TextEncoder().encode(backend)]]),
  })
  const call = (method: string, params?: unknown) => runner.call('app-0123456789abcdef', source, method, params, 'sct.test-token')

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'studio-backends-'))
    // Stands in for Studio's capability endpoint.
    server = createServer((request, response) => {
      let body = ''
      request.on('data', chunk => (body += chunk))
      request.on('end', () => {
        received.push({ authorization: request.headers.authorization, body: JSON.parse(body) })
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ result: { items: [{ id: 'urn:shell' }], page: { nextCursor: null, hasMore: false } } }))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    runner = new BackendRunner({
      denoPath,
      workDir,
      capabilityUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      callTimeoutMs: 2000,
    })
  })

  afterAll(async () => {
    runner.dispose()
    server.close()
    await rm(workDir, { recursive: true, force: true })
  })

  it('calls exported functions and reports failures', async () => {
    expect(await call('echo', { a: 1 })).toEqual({ echoed: { a: 1 } })
    await expect(call('fail')).rejects.toMatchObject({ code: 'app_backend_failed', detail: 'backend failure' })
    await expect(call('missing')).rejects.toMatchObject({ code: 'app_backend_failed' })
  })

  it('keeps console output away from the answers', async () => {
    expect(await call('noisy')).toBe('real')
  })

  it('calls Studio only through the capability endpoint, with the call\'s token', async () => {
    expect(await call('shells')).toEqual({ items: [{ id: 'urn:shell' }], page: { nextCursor: null, hasMore: false } })
    expect(received.at(-1)).toEqual({ authorization: 'Bearer sct.test-token', body: { method: 'studio.aas.listShells', params: { limit: 1 } } })
  })

  it('denies file, environment, network, subprocess and remote code access', async () => {
    expect(await call('probe')).toEqual({
      readFile: 'denied',
      env: 'denied',
      externalNetwork: 'denied',
      otherLoopbackPort: 'denied',
      subprocess: 'denied',
      writeFile: 'denied',
      remoteImport: 'denied',
    })
  })

  it('kills a backend that does not answer, and starts it again on the next call', async () => {
    const before = runner.pid('app-0123456789abcdef')
    await expect(call('hang')).rejects.toMatchObject({ code: 'app_backend_unavailable' })
    expect(await call('echo', 1)).toEqual({ echoed: 1 })
    expect(runner.pid('app-0123456789abcdef')).not.toBe(before)
  })

  it('survives a crashing or killed backend process', async () => {
    await expect(call('crash')).rejects.toMatchObject({ code: 'app_backend_unavailable' })
    expect(await call('echo', 2)).toEqual({ echoed: 2 })
    process.kill(runner.pid('app-0123456789abcdef')!, 'SIGKILL')
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(await call('echo', 3)).toEqual({ echoed: 3 })
  })

  it('stops a backend and removes its files', async () => {
    await call('echo', 4)
    const pid = runner.pid('app-0123456789abcdef')!
    await runner.stop('app-0123456789abcdef')
    expect(runner.pid('app-0123456789abcdef')).toBeUndefined()
    expect(existsSync(join(workDir, 'app-0123456789abcdef'))).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(() => process.kill(pid, 0)).toThrow()
  })
})

/** An HTTP server on one loopback address, or `null` where it is unavailable (no IPv6). */
async function listenOn (host: string): Promise<Server | null> {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ result: { items: [], page: { nextCursor: null, hasMore: false } } }))
  })
  return new Promise(resolve => {
    server.once('error', () => resolve(null))
    server.listen(0, host, () => resolve(server))
  })
}

const portOf = (server: Server) => (server.address() as AddressInfo).port

// `nuxt dev` binds `localhost`, which is [::1] only on some machines, while
// the configured capability URL is http://127.0.0.1:<port>.
describe('reachableLoopbackUrl', () => {
  it('keeps the configured address when it answers', async () => {
    const server = (await listenOn('127.0.0.1'))!
    try {
      expect(await reachableLoopbackUrl(`http://127.0.0.1:${portOf(server)}`)).toBe(`http://127.0.0.1:${portOf(server)}`)
    } finally {
      server.close()
    }
  })

  it('falls back to the other loopback address', async ({ skip }) => {
    const server = await listenOn('::1')
    if (!server) {
      return skip('IPv6 loopback is unavailable')
    }
    try {
      expect(await reachableLoopbackUrl(`http://127.0.0.1:${portOf(server)}`)).toBe(`http://[::1]:${portOf(server)}`)
    } finally {
      server.close()
    }
  })

  it('reports when nothing answers', async () => {
    const server = (await listenOn('127.0.0.1'))!
    const port = portOf(server)
    await new Promise(resolve => server.close(resolve))
    expect(await reachableLoopbackUrl(`http://127.0.0.1:${port}`, 200)).toBeNull()
  })
})

describe.runIf(existsSync(denoPath))('BackendRunner with an IPv6-only service', () => {
  it('reaches the capability endpoint on [::1] and nothing on 127.0.0.1', async ({ skip }) => {
    const server = await listenOn('::1')
    if (!server) {
      return skip('IPv6 loopback is unavailable')
    }
    const workDir = await mkdtemp(join(tmpdir(), 'studio-backends-'))
    const port = portOf(server)
    const runner = new BackendRunner({ denoPath, workDir, capabilityUrl: `http://127.0.0.1:${port}`, callTimeoutMs: 5000 })
    const code = `
export async function shells (params, { studio }) { return studio.call('studio.aas.listShells', { limit: 1 }) }
export async function ipv4 () {
  try { await fetch('http://127.0.0.1:${port}/'); return 'allowed' } catch (error) { return error.name }
}
`
    const source = async (): Promise<BackendSource> => ({
      installationId: 'app-00000000000000v6',
      appId: 'org.example.ipv6',
      entry: 'backend/main.js',
      files: new Map([['backend/main.js', new TextEncoder().encode(code)]]),
    })
    try {
      expect(await runner.call('app-00000000000000v6', source, 'shells', {}, 'sct.test-token')).toEqual({ items: [], page: { nextCursor: null, hasMore: false } })
      // Deno grants only the address that answered.
      expect(await runner.call('app-00000000000000v6', source, 'ipv4', {}, 'sct.test-token')).toBe('NotCapable')
    } finally {
      runner.dispose()
      server.close()
      await rm(workDir, { recursive: true, force: true })
    }
  })
})
