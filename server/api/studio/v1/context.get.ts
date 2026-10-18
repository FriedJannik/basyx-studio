import type { StudioContext } from '#shared/contract'
import type { LogoSource } from '~~/server/lib/config'
import { useRuntimeConfig } from 'nuxt/server'
import { defineStudioHandler } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'

/** A web logo as is; a mounted file as the Studio path that serves it. */
function logoUrl (source: LogoSource | null, mode: 'light' | 'dark'): string | null {
  if (!source) {
    return null
  }
  return 'url' in source ? source.url : `/branding/logo-${mode}`
}

export default defineStudioHandler(async (): Promise<StudioContext> => {
  const studio = await useStudio()
  const { version, commit, buildDate } = useRuntimeConfig().studio as { version: string, commit: string, buildDate: string }
  const { deployment } = studio.config
  return {
    apiVersion: '1',
    deploymentMode: studio.config.deploymentMode,
    loginRequired: studio.config.login !== null,
    anonymous: studio.config.anonymous !== null,
    infrastructuresEditable: studio.config.infrastructuresEditable,
    product: { name: deployment.productName, version, commit: commit || null, buildDate: buildDate || null },
    branding: {
      logoLight: logoUrl(deployment.logo.light, 'light'),
      logoDark: logoUrl(deployment.logo.dark, 'dark'),
      accentLight: deployment.accent?.light ?? null,
      accentDark: deployment.accent?.dark ?? null,
    },
    legal: deployment.legal,
    features: { readOnly: deployment.readOnly, uploads: deployment.uploads, appInstalls: deployment.appInstalls },
  }
})
