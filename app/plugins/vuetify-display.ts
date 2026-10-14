// Vuetify's display breakpoints need a viewport width during server rendering.
// Browsers without the viewport client hint (Firefox, Safari, embedded
// Chromium) send none, and Vuetify then assumes a width of 0, so every page
// would render the phone layout until hydration (MVP-4 defect D1). A typical
// width of the device class is assumed instead. It travels to the client with
// the payload, so hydration starts from the same layout and Vuetify switches
// to the real width afterwards.
//
// Hotkeys have the same problem: VHotkey detects macOS from the browser, so the
// server rendered "Ctrl" where the client renders ⌘. The platform is taken
// from the request once and set as VHotkey's default on both sides.
interface DisplaySize {
  clientWidth: number
  clientHeight: number
}

const phone: DisplaySize = { clientWidth: 390, clientHeight: 844 }
const desktop: DisplaySize = { clientWidth: 1280, clientHeight: 800 }

export default defineNuxtPlugin({
  name: 'studio:vuetify-display',
  // After the client-hint plugins of vuetify-nuxt-module (24 on the server,
  // -25 on the client) and before Vuetify is created (25).
  order: 24.5,
  setup (nuxtApp) {
    if (!nuxtApp.payload.serverRendered) {
      return
    }
    const fallback = useState<DisplaySize>('studio-display-fallback', () => {
      const headers = useRequestHeaders(['sec-ch-ua-mobile', 'user-agent'])
      const mobile = headers['sec-ch-ua-mobile'] === '?1' || /mobi|android|iphone|ipod/i.test(headers['user-agent'] ?? '')
      return mobile ? phone : desktop
    })
    const platform = useState<'mac' | 'pc'>('studio-hotkey-platform', () => {
      const headers = useRequestHeaders(['sec-ch-ua-platform', 'user-agent'])
      const named = headers['sec-ch-ua-platform']?.replaceAll('"', '')
      return (named ? /^(?:macOS|iOS)$/i.test(named) : /mac os x|macintosh|iphone|ipad/i.test(headers['user-agent'] ?? '')) ? 'mac' : 'pc'
    })
    nuxtApp.hook('vuetify:before-create', ({ vuetifyOptions }) => {
      if (vuetifyOptions.ssr === true) {
        vuetifyOptions.ssr = fallback.value
      }
      vuetifyOptions.defaults = { ...vuetifyOptions.defaults, VHotkey: { ...vuetifyOptions.defaults?.VHotkey, platform: platform.value } }
    })
  },
})
