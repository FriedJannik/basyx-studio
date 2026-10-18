/**
 * The request-aware fetch: server-side rendering forwards the browser's
 * cookies to Studio's own API. A session that this request itself just got
 * (STUDIO_AUTH_MODE=none, server/middleware/02.anonymous-session.ts) is not
 * among them yet, so its cookie header is sent explicitly.
 */
export function useStudioFetch (): ReturnType<typeof useRequestFetch> {
  const requestFetch = useRequestFetch()
  const cookie = import.meta.server ? useRequestEvent()?.context.sessionCookieHeader as string | undefined : undefined
  if (!cookie) {
    return requestFetch
  }
  return ((request: Parameters<typeof requestFetch>[0], options?: Parameters<typeof requestFetch>[1]) =>
    requestFetch(request, { ...options, headers: { ...options?.headers as Record<string, string> | undefined, cookie } })) as typeof requestFetch
}
