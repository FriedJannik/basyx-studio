import type { EndpointType } from '#shared/contract'
import type { InfrastructureRecord } from '../infrastructures'
import type { FailureRecorder, OutboundPolicy } from '../network/guarded-fetch'
import type { TargetAccess } from './credentials'
import { Configuration } from 'basyx-typescript-sdk'
import { serviceUrl } from '#shared/contract'
import { environmentUrl } from '../infrastructures'
import { createGuardedFetch } from '../network/guarded-fetch'
import { StudioProblem } from '../problem'

/**
 * Where a request goes: a configured service type, or an explicit base URL
 * that a registry descriptor resolved to (already checked against the
 * infrastructure's base URLs).
 */
export type TargetBase = EndpointType | { url: string }

export interface TargetHttpOptions {
  record: InfrastructureRecord
  access: TargetAccess
  policy: OutboundPolicy
  requestId: string
  /** Called when the target rejects the credentials (HTTP 401). */
  onUnauthorized: () => Promise<void>
}

export interface TargetRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Query parameters; `undefined` values are left out, arrays repeat the key. */
  query?: Record<string, string | string[] | number | boolean | undefined>
  /** A JSON value, or a `FormData`/`Uint8Array` body sent as is. */
  body?: unknown
  headers?: Record<string, string>
  /** Statuses returned to the caller instead of being turned into a problem. */
  passStatuses?: number[]
}

/** Encodes an AAS identifier for a URL path (base64url without padding). */
export function encodeIdentifier (id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url')
}

/**
 * Credentialed, guarded HTTP access to one live target for one request. The
 * SDK clients get their `Configuration` here; BaSyx Go endpoints the SDK does
 * not cover use `request` (ADR 0022). Both map failures to the same problems.
 */
export class TargetHttp {
  constructor (readonly options: TargetHttpOptions) {}

  get securityMode () {
    return this.options.record.security.mode
  }

  /** The base URL of a service (or of the AAS environment itself), or `null` if the target has no such endpoint. */
  baseUrl (type: EndpointType): string | null {
    return (type === 'aasEnvironment' ? environmentUrl(this.options.record) : serviceUrl(this.options.record, type)) ?? null
  }

  /** `returnRedirects` passes redirects to the SDK unfollowed, which reports them as failed results. */
  configuration (base: TargetBase, recorder: FailureRecorder, options: { returnRedirects?: boolean } = {}): Configuration {
    return new Configuration({ basePath: this.#requireBase(base), fetchApi: this.#fetch(recorder, options.returnRedirects) })
  }

  /** Sends a request to a service endpoint; non-2xx answers become problems unless passed. */
  async request (base: TargetBase, path: string, request: TargetRequest = {}): Promise<Response> {
    const recorder: FailureRecorder = {}
    const url = new URL(`${this.#requireBase(base)}${path}`)
    for (const [name, value] of Object.entries(request.query ?? {})) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined) {
          url.searchParams.append(name, String(item))
        }
      }
    }
    const headers: Record<string, string> = { Accept: 'application/json', ...request.headers }
    let body: BodyInit | undefined
    if (request.body instanceof FormData || request.body instanceof Uint8Array) {
      body = request.body as BodyInit
    } else if (request.body !== undefined) {
      body = JSON.stringify(request.body)
      headers['Content-Type'] = 'application/json'
    }
    let response: Response
    try {
      response = await this.#fetch(recorder)(url, { method: request.method ?? 'GET', headers, body })
    } catch {
      throw await this.problem(undefined, recorder)
    }
    if (response.ok || request.passStatuses?.includes(response.status)) {
      return response
    }
    const detail = await messageOf(response)
    throw await this.problem(response.status, recorder, detail)
  }

  async json<T> (base: TargetBase, path: string, request: TargetRequest = {}): Promise<T> {
    const response = await this.request(base, path, request)
    try {
      return await response.json() as T
    } catch {
      throw new StudioProblem('target_invalid_response', 'The target did not answer with JSON.')
    }
  }

  async problem (status: number | undefined, recorder: FailureRecorder, detail?: string): Promise<StudioProblem> {
    const failure = recorder.failure
    if (failure) {
      switch (failure.kind) {
        case 'blocked': {
          return new StudioProblem('target_blocked', failure.message)
        }
        case 'too_large': {
          return new StudioProblem('target_invalid_response', failure.message)
        }
        case 'timeout': {
          return new StudioProblem('target_unreachable', `The target did not answer in time (${failure.message}).`)
        }
        case 'client_certificate_required': {
          return new StudioProblem('target_client_certificate_required', failure.message)
        }
        case 'client_certificate_rejected': {
          return new StudioProblem('target_client_certificate_rejected', failure.message)
        }
        default: {
          return new StudioProblem('target_unreachable', failure.message)
        }
      }
    }
    const mode = this.securityMode
    switch (status) {
      case 401: {
        await this.options.onUnauthorized()
        if (mode === 'deployment_client_credentials') {
          return new StudioProblem('target_credentials_rejected')
        }
        return new StudioProblem('target_auth_required', mode === 'unsecured'
          ? 'The target requires authentication, but it is configured as unsecured.'
          : 'The target rejected the authorization. Authorize this target again.')
      }
      case 403: {
        return new StudioProblem('target_forbidden')
      }
      case 412: {
        return new StudioProblem('revision_conflict')
      }
      case 428: {
        return new StudioProblem('target_request_rejected', 'The target requires a revision (If-Match) for this write.')
      }
      case 404: {
        return new StudioProblem('target_resource_not_found', detail)
      }
      case 400:
      case 422: {
        return new StudioProblem('target_request_rejected', detail)
      }
      case 501: {
        return new StudioProblem('unsupported_operation', detail ?? 'The target does not implement this operation.')
      }
      case undefined:
      case 0: {
        return new StudioProblem('target_unreachable')
      }
      default: {
        if (status >= 500) {
          return new StudioProblem('target_error', `The target answered with HTTP ${status}.`)
        }
        // The SDK reports undeserializable payloads with its own code.
        return new StudioProblem('target_invalid_response', `Unexpected answer (HTTP ${status}).`)
      }
    }
  }

  #requireBase (base: TargetBase): string {
    if (typeof base === 'object') {
      return base.url
    }
    const url = this.baseUrl(base)
    if (!url) {
      throw new StudioProblem('unsupported_operation', `The target has no ${base} endpoint.`)
    }
    return url
  }

  #fetch (recorder: FailureRecorder, returnRedirects = false): typeof fetch {
    const headers: Record<string, string> = { 'X-Request-ID': this.options.requestId }
    if (this.options.access.accessToken) {
      headers.Authorization = `Bearer ${this.options.access.accessToken}`
    }
    return createGuardedFetch(this.options.policy, { recorder, headers, returnRedirects })
  }
}

/** The first message text of a BaSyx error body or SDK error result (`messages[].text`), if any. */
export function messageText (body: unknown): string | undefined {
  const messages = (body as { messages?: unknown } | null | undefined)?.messages
  const text = Array.isArray(messages)
    ? (messages as Array<{ text?: unknown }>).find(message => typeof message?.text === 'string')?.text as string | undefined
    : undefined
  // Keep server messages short; they may echo request data.
  return text ? text.slice(0, 300) : undefined
}

async function messageOf (response: Response): Promise<string | undefined> {
  try {
    return messageText(await response.json())
  } catch {
    return undefined
  }
}
