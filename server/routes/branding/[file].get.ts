import { readFile } from 'node:fs/promises'
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'
import { useStudio } from '~~/server/utils/studio'

/**
 * The deployment's logo files (STUDIO_LOGO, STUDIO_LOGO_LIGHT and
 * STUDIO_LOGO_DARK as mounted files). An SVG opened directly runs no script
 * on Studio's origin: the policy sandboxes it.
 */
export default defineEventHandler(async event => {
  const studio = await useStudio()
  const mode = { 'logo-light': 'light', 'logo-dark': 'dark' }[getRouterParam(event, 'file') ?? ''] as 'light' | 'dark' | undefined
  const source = mode ? studio.config.deployment.logo[mode] : null
  if (!source || !('file' in source)) {
    throw createError({ status: 404, statusText: 'Not Found' })
  }
  const headers = event.res.headers
  headers.set('Content-Type', source.contentType)
  headers.set('Content-Security-Policy', 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Cache-Control', 'public, max-age=300')
  return readFile(source.file)
})
