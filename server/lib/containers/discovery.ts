import type { EngineInfo, EngineKind } from '#shared/contract'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { EngineClient, socketPathOf } from './engine'

// Finds the Docker and Podman engines on this computer (ADR 0033): the
// engine chosen in settings, DOCKER_HOST, the Docker CLI's contexts (Docker
// Desktop, Colima, Rancher Desktop, OrbStack), then well-known sockets.

export interface EngineCandidate {
  host: string
  source: EngineInfo['source']
}

export interface DiscoveryEnvironment {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
  tmp: string
  exists: (path: string) => boolean
  readText: (path: string) => string | null
  listDirectory: (path: string) => string[]
  /** The Podman machine's API socket, from `podman machine inspect`. */
  podmanMachineSocket: () => Promise<string | null>
}

export function systemDiscoveryEnvironment (): DiscoveryEnvironment {
  return {
    platform: process.platform,
    env: process.env,
    home: homedir(),
    tmp: tmpdir(),
    exists: path => existsSync(path),
    readText: path => {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return null
      }
    },
    listDirectory: path => {
      try {
        return readdirSync(path)
      } catch {
        return []
      }
    },
    podmanMachineSocket: () => new Promise(resolve => {
      execFile('podman', ['machine', 'inspect', '--format', '{{.ConnectionInfo.PodmanSocket.Path}}'], { timeout: 5000, windowsHide: true }, (error, stdout) => {
        const path = error ? '' : stdout.trim().split('\n', 1)[0]?.trim() ?? ''
        resolve(path && path !== '<no value>' ? path : null)
      })
    }),
  }
}

const supportedHost = /^(?:unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/

function unixHost (path: string): string {
  return `unix://${path}`
}

function pipeHost (name: string): string {
  return `npipe:////./pipe/${name}`
}

/** The hosts of the Docker CLI's contexts, the current one first. */
function dockerContexts (environment: DiscoveryEnvironment): string[] {
  const dockerConfig = environment.env.DOCKER_CONFIG ?? join(environment.home, '.docker')
  let current: string | undefined
  try {
    current = (JSON.parse(environment.readText(join(dockerConfig, 'config.json')) ?? '{}') as { currentContext?: string }).currentContext
  } catch {
    // No readable Docker config: no current context.
  }
  const metaDirectory = join(dockerConfig, 'contexts', 'meta')
  const contexts: Array<{ name: string, host: string }> = []
  for (const entry of environment.listDirectory(metaDirectory)) {
    try {
      const meta = JSON.parse(environment.readText(join(metaDirectory, entry, 'meta.json')) ?? '') as { Name?: string, Endpoints?: { docker?: { Host?: string } } }
      const host = meta.Endpoints?.docker?.Host
      if (meta.Name && host) {
        contexts.push({ name: meta.Name, host })
      }
    } catch {
      // A broken context is skipped.
    }
  }
  contexts.sort((a, b) => Number(b.name === current) - Number(a.name === current) || a.name.localeCompare(b.name))
  return contexts.map(context => context.host)
}

/** Well-known sockets per platform, Docker before Podman. */
function defaultHosts (environment: DiscoveryEnvironment): string[] {
  const { home, env } = environment
  if (environment.platform === 'win32') {
    return [pipeHost('docker_engine'), pipeHost('dockerDesktopLinuxEngine'), pipeHost('podman-machine-default')]
  }
  const runtimeDirectory = env.XDG_RUNTIME_DIR
  const hosts = [
    join(home, '.docker', 'run', 'docker.sock'),
    '/var/run/docker.sock',
    join(home, '.docker', 'desktop', 'docker.sock'),
    join(home, '.colima', 'default', 'docker.sock'),
    join(home, '.rd', 'docker.sock'),
    join(home, '.orbstack', 'run', 'docker.sock'),
    ...(runtimeDirectory ? [join(runtimeDirectory, 'docker.sock'), join(runtimeDirectory, 'podman', 'podman.sock')] : []),
    '/run/podman/podman.sock',
    join(environment.tmp, 'podman', 'podman-machine-default-api.sock'),
    join(home, '.local', 'share', 'containers', 'podman', 'machine', 'podman.sock'),
  ]
  return hosts.filter(path => environment.exists(path)).map(path => unixHost(path))
}

/** Every engine candidate, in order of preference, without duplicates. */
export async function engineCandidates (environment: DiscoveryEnvironment, configured: string | null): Promise<EngineCandidate[]> {
  const candidates: EngineCandidate[] = []
  const seen = new Set<string>()
  const add = (host: string | undefined, source: EngineCandidate['source']) => {
    if (host && supportedHost.test(host) && !seen.has(host)) {
      seen.add(host)
      candidates.push({ host, source })
    }
  }
  add(configured ?? undefined, 'settings')
  add(environment.env.DOCKER_HOST, 'environment')
  for (const host of dockerContexts(environment)) {
    add(host, 'context')
  }
  for (const host of defaultHosts(environment)) {
    add(host, 'default')
  }
  if (environment.platform !== 'win32' && environment.platform !== 'linux') {
    const podman = await environment.podmanMachineSocket().catch(() => null)
    if (podman && environment.exists(podman)) {
      add(unixHost(podman), 'default')
    }
  }
  return candidates
}

/** A name people recognize, from the socket path and what the engine reports. */
export function engineName (host: string, kind: EngineKind, operatingSystem: string, name: string): string {
  if (kind === 'podman') {
    return 'Podman'
  }
  const path = host.toLowerCase()
  if (/docker desktop/i.test(operatingSystem)) {
    return 'Docker Desktop'
  }
  if (path.includes('.colima') || name === 'colima') {
    return 'Colima'
  }
  if (path.includes('/.rd/') || name.startsWith('lima-rancher-desktop')) {
    return 'Rancher Desktop'
  }
  if (path.includes('orbstack') || name === 'orbstack') {
    return 'OrbStack'
  }
  return 'Docker Engine'
}

function kindFromHost (host: string): EngineKind {
  return /podman/i.test(host) ? 'podman' : 'docker'
}

/** Asks one candidate who it is; a candidate that does not answer is reported as not running. */
export async function probeEngine (candidate: EngineCandidate): Promise<EngineInfo> {
  const client = new EngineClient(candidate.host)
  const kind = kindFromHost(candidate.host)
  try {
    const version = await client.version()
    const info = await client.info().catch(() => ({ operatingSystem: '', name: '' }))
    const actualKind: EngineKind = version.podman ? 'podman' : kind
    return {
      host: candidate.host,
      kind: actualKind,
      name: engineName(candidate.host, actualKind, info.operatingSystem, info.name),
      source: candidate.source,
      running: true,
      version: version.version,
      apiVersion: version.apiVersion,
      os: version.os,
      arch: version.arch,
      error: null,
    }
  } catch (error) {
    return {
      host: candidate.host,
      kind,
      name: engineName(candidate.host, kind, '', ''),
      source: candidate.source,
      running: false,
      version: null,
      apiVersion: null,
      os: null,
      arch: null,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await client.close()
  }
}

/** Whether a host string points at an existing socket (named pipes cannot be checked). */
export function hostExists (host: string, exists: (path: string) => boolean): boolean {
  return host.startsWith('npipe://') || exists(socketPathOf(host))
}
