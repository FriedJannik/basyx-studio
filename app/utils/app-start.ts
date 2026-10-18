/**
 * Why an app frame did not connect to Studio in time:
 * - `unreachable`: the entry file cannot be loaded from this browser (DNS,
 *   network, TLS, CORS);
 * - `error`: the apps origin answered, but not with the entry file;
 * - `blocked`: the entry file loads, so the frame itself was not: a content
 *   blocker or an embedded browser refusing frames from the apps origin, or
 *   the app failed while starting. The parent cannot tell these apart, since
 *   the frame's error page and the app's document are both cross-origin.
 */
export type AppStartProblem = { kind: 'unreachable' } | { kind: 'error', status: number } | { kind: 'blocked' }

/**
 * Fetches an app's entry file from the Studio page to tell why its frame did
 * not connect. App files are served with `Access-Control-Allow-Origin: *` and
 * carry no credentials (ADR 0017), so the response is readable here.
 */
export async function diagnoseAppStart (entryUrl: string, fetcher: typeof fetch = fetch): Promise<AppStartProblem> {
  try {
    const response = await fetcher(entryUrl, {
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok ? { kind: 'blocked' } : { kind: 'error', status: response.status }
  } catch {
    return { kind: 'unreachable' }
  }
}
