// Shared by the container's launcher and health check: the base path the
// Studio Service is served under, from STUDIO_BASE_PATH or NUXT_APP_BASE_URL.

const segment = /^[\w.~-]+$/

/**
 * Normalizes a base path to `/` or `/a/b/`: `studio`, `/studio` and
 * `/studio/` are the same. Throws for anything that is not a plain path.
 */
export function normalizeBasePath (value) {
  const segments = (value ?? '').split('/').filter(Boolean)
  for (const part of segments) {
    if (!segment.test(part) || part === '.' || part === '..') {
      throw new Error(`STUDIO_BASE_PATH must be a plain URL path such as /studio, got "${value}".`)
    }
  }
  return segments.length > 0 ? `/${segments.join('/')}/` : '/'
}

/** The effective base path; STUDIO_BASE_PATH wins over NUXT_APP_BASE_URL. */
export function basePathOf (env) {
  return normalizeBasePath(env.STUDIO_BASE_PATH || env.NUXT_APP_BASE_URL || '/')
}
