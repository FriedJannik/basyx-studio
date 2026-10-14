import type { Preferences, RecentShell } from '#shared/contract'
import { useQuery, useQueryCache } from '@pinia/colada'
import { defaultPreferences } from '#shared/contract'

const recentLimit = 8

/**
 * The signed-in user's preferences, stored by Studio (plan D6). Changes are
 * shown at once and saved in the background; a failed save restores the
 * stored state.
 */
export function usePreferences () {
  const api = useStudioApi()
  const session = useSessionStore()
  const queryCache = useQueryCache()
  const key = ['me', 'preferences']

  const query = useQuery({
    key,
    query: ({ signal }) => api<Preferences>('/me/preferences', { signal }),
    enabled: () => session.session !== null,
    staleTime: 60_000,
  })
  const preferences = computed(() => query.data.value ?? defaultPreferences)

  async function update (change: (current: Preferences) => Preferences) {
    const previous = preferences.value
    const next = change(structuredClone(toRaw(previous)))
    queryCache.setQueryData(key, next)
    try {
      queryCache.setQueryData(key, await api<Preferences>('/me/preferences', { method: 'PUT', body: next }))
    } catch {
      queryCache.setQueryData(key, previous)
    }
  }

  function recent (targetId: string): RecentShell[] {
    return preferences.value.recent[targetId] ?? []
  }

  /** Remembers an opened shell; does nothing if it is already the most recent one under that title. */
  function rememberShell (targetId: string, shellKey: string, title: string) {
    const latest = recent(targetId)[0]
    if (latest?.key === shellKey && latest.title === title) {
      return
    }
    return update(current => {
      current.recent[targetId] = [{ key: shellKey, title }, ...(current.recent[targetId] ?? []).filter(entry => entry.key !== shellKey)].slice(0, recentLimit)
      return current
    })
  }

  return { preferences, query, update, recent, rememberShell }
}
