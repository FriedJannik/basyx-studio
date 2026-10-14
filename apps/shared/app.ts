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

export interface Node {
  element: JsonObject
  /** idShortPath from the submodel, e.g. `Documents[0].DigitalFiles[0]`. */
  path: string
}

function objects (value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => typeof item === 'object' && item !== null) : []
}

/** The children of a submodel or element, with their idShortPaths. */
export function childrenOf (node: Node | JsonObject): Node[] {
  const isNode = 'element' in node && 'path' in node
  const element = isNode ? (node as Node).element : node as JsonObject
  const base = isNode ? (node as Node).path : ''
  const join = (idShort: string) => (base ? `${base}.${idShort}` : idShort)
  if (element.modelType === 'SubmodelElementList') {
    return objects(element.value).map((child, index) => ({ element: child, path: `${base}[${index}]` }))
  }
  const items = element.modelType === 'Submodel'
    ? element.submodelElements
    : (element.modelType === 'Entity' ? element.statements : element.value)
  if (!['Submodel', 'SubmodelElementCollection', 'Entity'].includes(String(element.modelType))) {
    return []
  }
  return objects(items).map(child => ({ element: child, path: join(String(child.idShort)) }))
}

/** A child by idShort, ignoring case and a trailing number (`Document01` matches `Document`). */
export function child (node: Node | JsonObject | undefined, idShort: string): Node | undefined {
  if (!node) {
    return undefined
  }
  const wanted = idShort.toLowerCase()
  return childrenOf(node).find(entry => String(entry.element.idShort ?? '').toLowerCase().replace(/\d+$/, '') === wanted)
}

/** A localized AAS text for the locale, falling back to English and then the first entry. */
export function langText (value: unknown, locale: string): string {
  if (!Array.isArray(value)) {
    return typeof value === 'string' ? value : ''
  }
  const strings = value as Array<{ language: string, text: string }>
  const language = locale.split('-', 1)[0]!
  return (strings.find(entry => entry.language.startsWith(language)) ?? strings.find(entry => entry.language.startsWith('en')) ?? strings[0])?.text ?? ''
}

/** The display text of a Property, MultiLanguageProperty or File. */
export function textOf (node: Node | undefined, locale: string): string {
  return node ? langText(node.element.value, locale) : ''
}

/** `SerialNumber` → `Serial number`. */
export function humanize (idShort: string): string {
  const words = idShort.replaceAll(/([a-z\d])([A-Z])/g, '$1 $2').replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  return words.charAt(0) + words.slice(1).toLowerCase()
}

/** Loads the context's submodel; the view is only shown for a submodel. */
export async function loadSubmodel (client: StudioClient): Promise<JsonObject> {
  return client.aas.getSubmodel(client.context.submodel!.id)
}
