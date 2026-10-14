import type { InfrastructureRecord } from '../infrastructures'
import type { FailureRecorder } from '../network/guarded-fetch'
import type { TargetHttp } from './http'
import type { Configuration } from 'basyx-typescript-sdk'
import { AasService, SubmodelService } from 'basyx-typescript-sdk'
import { serviceUrl } from '#shared/contract'
import { StudioProblem } from '../problem'

/**
 * Whether a URL lies under one of the base URLs: same scheme, host and port,
 * and the base path as a prefix at a segment boundary (MVP-4 plan, I4).
 * `URL` normalizes case, default ports, dot segments and IDNs on both sides;
 * URLs with credentials are never accepted.
 */
export function isUnderBase (href: string, bases: readonly string[]): boolean {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return false
  }
  if (url.username || url.password) {
    return false
  }
  return bases.some(base => {
    const prefix = new URL(base)
    const path = prefix.pathname.replace(/\/+$/, '')
    return prefix.origin === url.origin && (url.pathname === path || url.pathname.startsWith(`${path}/`))
  })
}

/** `http://host/api/shells/{id}` → `http://host/api`. */
export function repositoryBaseOf (href: string, collection: 'shells' | 'submodels'): string | null {
  const match = new RegExp(`^(.*)/${collection}/[^/]+/?$`).exec(href)
  return match?.[1] ?? null
}

/**
 * Where the shells and submodels of a live target are served. With a
 * registry, the SDK's `AasService` and `SubmodelService` resolve them through
 * their descriptors, falling back to the configured repositories; a
 * descriptor endpoint outside the infrastructure's base URLs is refused and
 * never contacted. Results are kept for the request.
 */
export class EndpointResolver {
  readonly #shells = new Map<string, Promise<string>>()
  readonly #submodels = new Map<string, Promise<string>>()
  readonly #bases: string[]

  constructor (private readonly record: InfrastructureRecord, private readonly http: TargetHttp, private readonly shellContext?: string) {
    this.#bases = record.endpoints.map(endpoint => endpoint.url)
  }

  /** The base URL of the repository that serves a shell. */
  shellBase (id: string): Promise<string> {
    let base = this.#shells.get(id)
    if (!base) {
      base = this.#resolve('aasRegistry', 'aasRepository', 'shells', (registry, repository) =>
        new AasService({ aasRegistryConfig: registry, aasRepositoryConfig: repository }).getAasEndpointById({ aasIdentifier: id }))
      this.#shells.set(id, base)
    }
    return base
  }

  /**
   * The base URL of the repository that serves a submodel. Without a
   * submodel repository or registry, submodels are reached through the
   * shell's superpath (`/shells/{id}/submodels/…`), so the request must name
   * the shell.
   */
  submodelBase (id: string): Promise<string> {
    let base = this.#submodels.get(id)
    if (!base && this.#throughShell()) {
      const shell = this.shellContext
      base = shell
        ? this.shellBase(shell).then(shellBase => `${shellBase}/shells/${Buffer.from(shell, 'utf8').toString('base64url')}`)
        : Promise.reject(new StudioProblem('unsupported_operation', 'This infrastructure serves submodels only through their shell; open the submodel from its shell.'))
      this.#submodels.set(id, base)
    }
    if (!base) {
      base = this.#resolve('submodelRegistry', 'submodelRepository', 'submodels', (registry, repository) =>
        new SubmodelService({ submodelRegistryConfig: registry, submodelRepositoryConfig: repository }).getSubmodelEndpointById({ submodelIdentifier: id }))
      this.#submodels.set(id, base)
    }
    return base
  }

  #throughShell (): boolean {
    return serviceUrl(this.record, 'submodelRepository') === undefined
      && serviceUrl(this.record, 'submodelRegistry') === undefined
      && serviceUrl(this.record, 'aasRepository') !== undefined
  }

  async #resolve (
    registry: 'aasRegistry' | 'submodelRegistry',
    repository: 'aasRepository' | 'submodelRepository',
    collection: 'shells' | 'submodels',
    /** The SDK service's lookup: the registry's descriptor endpoint, else the repository's resource URL. */
    lookup: (registry: Configuration, repository: Configuration | undefined) => Promise<{ success: true, data: string } | { success: false, error: unknown }>,
  ): Promise<string> {
    const hasRegistry = serviceUrl(this.record, registry) !== undefined
    const hasRepository = serviceUrl(this.record, repository) !== undefined
    if (!hasRegistry) {
      if (!hasRepository) {
        throw new StudioProblem('unsupported_operation', `The target has no ${repository} or ${registry}.`)
      }
      return serviceUrl(this.record, repository)!
    }
    const recorder: FailureRecorder = {}
    const result = await lookup(
      this.http.configuration(registry, recorder),
      hasRepository ? this.http.configuration(repository, recorder) : undefined,
    )
    if (!result.success) {
      if (recorder.failure) {
        throw await this.http.problem(undefined, recorder)
      }
      // The registry does not know it and there is no repository to ask.
      throw new StudioProblem('target_resource_not_found')
    }
    if (!isUnderBase(result.data, this.#bases)) {
      throw new StudioProblem('descriptor_endpoint_blocked', `${new URL(result.data).origin} is not one of this infrastructure's endpoints.`)
    }
    const base = repositoryBaseOf(result.data, collection)
    if (!base) {
      throw new StudioProblem('target_invalid_response', `The registry returned an endpoint that is not a ${collection} resource.`)
    }
    return base
  }
}
