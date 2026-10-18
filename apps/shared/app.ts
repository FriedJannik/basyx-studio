import type { JsonObject, StudioClient, ThemeTokens } from '@basyx/studio-sdk'
import type { Component } from 'vue'
import { connect, fitHeight } from '@basyx/studio-sdk'
import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { VBtn } from 'vuetify/components/VBtn'
import { VCard } from 'vuetify/components/VCard'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Shared setup of the apps shipped with Studio (ADR 0023). They follow
// Studio's theme and look. A view renders flat inside the card Studio gives
// it (an Overview widget, the details drawer, the full-screen dialog), which
// already has the border, the radius and the view's title.

export * from './aas'

/** Connects to Studio, follows its theme, mounts the app and sizes the frame to it. */
export async function mountApp (app: Component, components: Record<string, Component>): Promise<void> {
  const client = await connect()
  const vuetify = createVuetify({
    components: { ...components, VBtn, VCard },
    aliases: { VBtnPrimary: VBtn, VViewCard: VCard },
    defaults: {
      // Studio's card shows through: the frame's page and the view have no background of their own.
      VApp: { class: 'bg-transparent' },
      VViewCard: { flat: true, border: false, rounded: 0, color: 'transparent' },
      VCard: { flat: true, border: true, rounded: 'lg' },
      VBtn: { rounded: 'lg', class: 'text-none', variant: 'text' },
      VBtnPrimary: { color: 'primary', variant: 'flat', rounded: 'lg', class: 'text-none' },
      VChip: { label: true, size: 'small', variant: 'tonal' },
      VList: { density: 'comfortable', bgColor: 'transparent' },
      VListItem: { rounded: 'lg' },
      VAlert: { border: 'start', variant: 'tonal' },
      VProgressLinear: { indeterminate: true, color: 'primary' },
    },
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  })
  const apply = (theme: ThemeTokens) => {
    const name = theme.dark ? 'dark' : 'light'
    Object.assign(vuetify.theme.themes.value[name]!.colors, theme.colors)
    vuetify.theme.change(name)
  }
  apply(client.context.theme)
  client.onContext(context => apply(context.theme))
  const root = document.querySelector<HTMLElement>('#app')!
  createApp(app, { client }).use(vuetify).mount(root)
  // The content, not the root: v-app is at least as tall as the frame, so a
  // frame sized to it could grow but never shrink to shorter content.
  fitHeight(client, root.querySelector<HTMLElement>('.v-application__wrap > *') ?? root)
}

/** Loads the context's submodel; the view is only shown for a submodel. */
export async function loadSubmodel (client: StudioClient): Promise<JsonObject> {
  return client.aas.getSubmodel(client.context.submodel!.id)
}
