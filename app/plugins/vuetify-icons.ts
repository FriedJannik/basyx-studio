import { aasIconPaths } from '~/utils/icons'

// Studio's own icons as Vuetify aliases, e.g. `icon="$aas"` for shells, as in
// the BaSyx AAS Web UI. Registered before Vuetify is created.
export default defineNuxtPlugin({
  name: 'studio:vuetify-icons',
  order: 24.6,
  setup (nuxtApp) {
    nuxtApp.hook('vuetify:before-create', ({ vuetifyOptions }) => {
      vuetifyOptions.icons = {
        ...vuetifyOptions.icons,
        aliases: { ...vuetifyOptions.icons?.aliases, aas: aasIconPaths },
      }
    })
  },
})
