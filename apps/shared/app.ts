import type { JsonObject, StudioClient, ThemeTokens } from '@basyx/studio-sdk'
import type { Component } from 'vue'
import { connect, fitHeight } from '@basyx/studio-sdk'
import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { VBtn } from 'vuetify/components/VBtn'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Shared setup of the apps shipped with Studio (ADR 0023). They render as
// cards on a shell's overview and follow Studio's theme and look.

export * from './aas'

/** Connects to Studio, follows its theme, mounts the app and sizes the frame to it. */
export async function mountApp (app: Component, components: Record<string, Component>): Promise<void> {
  const client = await connect()
  const vuetify = createVuetify({
    components: { ...components, VBtn },
    aliases: { VBtnPrimary: VBtn },
    defaults: {
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
  fitHeight(client, root)
}

/** Loads the context's submodel; the view is only shown for a submodel. */
export async function loadSubmodel (client: StudioClient): Promise<JsonObject> {
  return client.aas.getSubmodel(client.context.submodel!.id)
}
