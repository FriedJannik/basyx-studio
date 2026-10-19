import type { BinaryContent } from '../targets/aas-target'
import { StudioProblem } from '../problem'
import { createGuardedFetch, networkFailureOf } from './guarded-fetch'

// Files that AAS content names by an address at another host (ADR 0042).
// Studio fetches them only from origins the deployment lists, through the
// guarded fetch, without credentials, and follows redirects only to such
// origins.

export interface ExternalFilePolicy {
  /** Origins Studio may fetch from, or `*` for any. Empty: none. */
  origins: '*' | ReadonlySet<string>
  allowPrivateNetwork: boolean
  timeoutMs: number
  maxBytes: number
}

const maxRedirects = 3

/** Whether the deployment lets Studio fetch files from this address's origin. */
export function externalOriginAllowed (policy: Pick<ExternalFilePolicy, 'origins'>, url: URL): boolean {
  return policy.origins === '*' || policy.origins.has(url.origin)
}

function refused (url: URL, reason: string): StudioProblem {
  return new StudioProblem('external_file_refused', `Studio does not fetch files from ${url.origin}: ${reason}.`)
}

function unavailable (url: URL, reason: string): StudioProblem {
  return new StudioProblem('external_file_unavailable', `${url.host} ${reason}.`)
}

/**
 * Fetches the file at `address` for Studio's page. The address comes from an
 * element the user may read, never from the request. The answer carries the
 * host's media type and the file name of the address's path.
 */
export async function fetchExternalFile (policy: ExternalFilePolicy, address: string): Promise<BinaryContent> {
  let url = new URL(address)
  for (let hop = 0; ; hop++) {
    if (!externalOriginAllowed(policy, url)) {
      throw refused(url, hop === 0 ? 'the origin is not listed in STUDIO_EXTERNAL_FILE_ORIGINS' : 'a redirect led there, and the origin is not listed in STUDIO_EXTERNAL_FILE_ORIGINS')
    }
    const guarded = createGuardedFetch(
      { allowedOrigins: new Set([url.origin]), allowPrivateNetwork: policy.allowPrivateNetwork, timeoutMs: policy.timeoutMs, maxResponseBytes: policy.maxBytes },
      { returnRedirects: true },
    )
    let response: Response
    try {
      // No credentials, cookies, Origin or Referer: the host learns only Studio's address.
      response = await guarded(url, { headers: { Accept: '*/*' } })
    } catch (error) {
      const failure = networkFailureOf(error)
      if (failure?.kind === 'blocked') {
        throw refused(url, failure.message)
      }
      if (failure?.kind === 'timeout') {
        throw unavailable(url, `did not answer within ${policy.timeoutMs / 1000} s`)
      }
      if (failure?.kind === 'too_large') {
        throw unavailable(url, `serves a file larger than ${policy.maxBytes / 1024 / 1024} MiB`)
      }
      throw unavailable(url, 'could not be reached')
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      const next = location ? URL.parse(location, url) : null
      if (!next || hop >= maxRedirects) {
        throw unavailable(url, next ? `redirected more than ${maxRedirects} times` : 'redirected without a location')
      }
      url = next
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw unavailable(url, `answered with HTTP ${response.status}`)
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      throw networkFailureOf(error)?.kind === 'too_large'
        ? unavailable(url, `serves a file larger than ${policy.maxBytes / 1024 / 1024} MiB`)
        : unavailable(url, 'broke off the download')
    }
    return {
      bytes,
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      fileName: decodeURIComponent(url.pathname.split('/').pop() ?? '') || null,
    }
  }
}
