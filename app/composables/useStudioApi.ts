import type { Problem } from '#shared/contract'
import { apiBasePath, isProblem } from '#shared/contract'

/** A failed Studio API call. `problem` is null when Studio itself was unreachable. */
export class StudioApiError extends Error {
  constructor (readonly problem: Problem | null) {
    super(problem?.detail ?? problem?.title ?? 'Studio could not be reached.')
    this.name = 'StudioApiError'
  }

  get code (): Problem['code'] | 'network' {
    return this.problem?.code ?? 'network'
  }
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Response type; `blob` for file downloads. */
  responseType?: 'json' | 'blob' | 'text'
  body?: unknown
  query?: Record<string, string | string[] | number | boolean | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
}

/**
 * Client for the versioned Studio API. Uses the request-aware fetch, so
 * server-side rendering forwards the session cookie, and attaches the CSRF
 * token to state-changing requests.
 */
export function useStudioApi () {
  const requestFetch = useStudioFetch()
  const session = useSessionStore()
  const route = useRoute()

  return async function api<T> (path: string, request: ApiRequest = {}): Promise<T> {
    const method = request.method ?? 'GET'
    const headers: Record<string, string> = { ...request.headers }
    // Submodel requests name the open shell: some infrastructures (an AAS
    // repository only) serve submodels only through it.
    const shellKey = typeof route.params.shellKey === 'string' ? route.params.shellKey : null
    const query = shellKey && /^\/targets\/[^/]+\/submodels\//.test(path) && request.query?.shell === undefined
      ? { ...request.query, shell: shellKey }
      : request.query
    if (method !== 'GET' && session.csrfToken) {
      headers['X-CSRF-Token'] = session.csrfToken
    }
    try {
      return await requestFetch(`${apiBasePath}${path}`, {
        method,
        body: request.body as Record<string, unknown> | undefined,
        query,
        headers,
        signal: request.signal,
        responseType: request.responseType,
      }) as T
    } catch (error) {
      const data = (error as { data?: unknown }).data
      throw new StudioApiError(isProblem(data) ? data : null)
    }
  }
}
