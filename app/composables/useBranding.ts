import { useTheme } from 'vuetify'
import basyxLogo from '~/assets/basyx-logo.svg'

/** The deployment's product name and logo (STUDIO_PRODUCT_NAME, STUDIO_LOGO*), else BaSyx Studio's. */
export function useBranding () {
  const session = useSessionStore()
  const theme = useTheme()
  const studioUrl = useStudioUrl()
  const { t } = useI18n()

  const name = computed(() => session.context?.product.name ?? t('app.name'))
  const logo = computed(() => {
    const branding = session.context?.branding
    const source = theme.current.value.dark ? branding?.logoDark : branding?.logoLight
    if (!source) {
      return basyxLogo
    }
    // Mounted files are served by Studio, under its base path.
    return source.startsWith('/') ? studioUrl.page(source) : source
  })
  return { name, logo }
}
