import { apiBasePath } from '#shared/contract'

/**
 * Paths of this Studio deployment as the browser sees them, under its base
 * path (`app.baseURL`, STUDIO_BASE_PATH). For plain `href` and `src`
 * attributes and `window.location`; `$fetch`, `useRequestFetch` and the
 * router add the base path themselves.
 */
export function useStudioUrl () {
  const base = useRuntimeConfig().app.baseURL.replace(/\/+$/, '')
  return {
    /** A Studio page, such as `/targets/x`. */
    page: (path: string) => `${base}${path}`,
    /** A Studio API resource, such as `/targets/x/shells/y/thumbnail`. */
    api: (path: string) => `${base}${apiBasePath}${path}`,
  }
}
