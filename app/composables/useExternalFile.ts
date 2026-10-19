import type { Problem } from '#shared/contract'
import { readFileMaxBytes } from '#shared/contract'
import { StudioApiError } from '~/composables/useStudioApi'

export interface ExternalFileContent {
  bytes: Uint8Array
  contentType: string
}

/** The element that names the file; Studio's server reads the address from it. */
export interface ExternalFileElement {
  targetId: string
  submodelKey: string
  elementKey: string
}

function unavailable (detail: string): StudioApiError {
  const problem: Problem = { type: 'about:blank', title: detail, status: 502, code: 'external_file_unavailable', requestId: '', retryable: true }
  return new StudioApiError(problem)
}

/**
 * Fetches the file in the browser: without credentials or referrer, so the
 * host learns nothing but the address it serves. `null` when the browser
 * may not read it (CORS) or cannot reach the host. At most
 * `readFileMaxBytes`, also when the host does not say the size up front.
 */
async function fetchInBrowser (url: string): Promise<ExternalFileContent | null> {
  const host = new URL(url).host
  let response: Response
  try {
    response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' })
  } catch {
    return null
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw unavailable(`${host} answered with HTTP ${response.status}.`)
  }
  const tooLarge = () => unavailable(`The file at ${host} is larger than ${readFileMaxBytes / 1024 / 1024} MiB.`)
  if (Number(response.headers.get('content-length')) > readFileMaxBytes) {
    await response.body.cancel()
    throw tooLarge()
  }
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    size += value.byteLength
    if (size > readFileMaxBytes) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, contentType: response.headers.get('content-type')?.split(';', 1)[0]?.trim() || 'application/octet-stream' }
}

/**
 * Reads a file that an element names at another host (ADR 0042): in the
 * browser first, so a host that allows it (CORS) serves the user directly;
 * otherwise through Studio's server, for the origins the deployment lists.
 * Fails with `external_file_unavailable` when neither may read it.
 */
export function useExternalFile () {
  const api = useStudioApi()

  return async function readExternalFile (url: string, element: ExternalFileElement): Promise<ExternalFileContent> {
    const content = await fetchInBrowser(url)
    if (content) {
      return content
    }
    const path = `/targets/${element.targetId}/submodels/${element.submodelKey}/elements/${element.elementKey}/external-file`
    try {
      const blob = await api<Blob>(path, { responseType: 'blob' })
      return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: blob.type || 'application/octet-stream' }
    } catch (error) {
      if (error instanceof StudioApiError && error.code === 'external_file_refused') {
        throw unavailable(`${new URL(url).host} could not be reached, or it does not allow Studio to read the file (CORS).`)
      }
      throw error
    }
  }
}
