import type { ShellAvailability } from '#shared/contract'
import type { AasTarget } from '../targets/aas-target'
import { StudioProblem } from '../problem'
import { decodeKey } from './keys'

const concurrency = 4

const statuses: Partial<Record<StudioProblem['code'], ShellAvailability['items'][number]['status']>> = {
  target_forbidden: 'forbidden',
  target_resource_not_found: 'not_found',
  descriptor_endpoint_blocked: 'blocked',
  target_unreachable: 'unreachable',
  target_blocked: 'unreachable',
  target_error: 'unreachable',
  target_invalid_response: 'unreachable',
}

/**
 * Whether the shells of a list page can be opened: each is read once, at
 * most four at a time. A missing sign-in fails the whole request, as it would
 * fail every shell.
 */
export async function shellAvailability (target: AasTarget, keys: string[]): Promise<ShellAvailability> {
  const items: ShellAvailability['items'] = Array.from({ length: keys.length })
  let next = 0
  async function worker () {
    while (next < keys.length) {
      const index = next++
      const key = keys[index]!
      try {
        await target.shell(decodeKey(key, 'shell key'))
        items[index] = { key, status: 'available' }
      } catch (error) {
        if (!(error instanceof StudioProblem) || error.code === 'target_auth_required' || error.code === 'target_credentials_rejected') {
          throw error
        }
        items[index] = { key, status: statuses[error.code] ?? 'unreachable' }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, () => worker()))
  return { items }
}
