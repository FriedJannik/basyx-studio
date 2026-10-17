import { connect } from '@basyx/studio-sdk'
import { createApp } from 'vue'
import { VAlert } from 'vuetify/components/VAlert'
import { VApp } from 'vuetify/components/VApp'
import { VAvatar } from 'vuetify/components/VAvatar'
import { VBreadcrumbs, VBreadcrumbsItem } from 'vuetify/components/VBreadcrumbs'
import { VBtn } from 'vuetify/components/VBtn'
import { VBtnToggle } from 'vuetify/components/VBtnToggle'
import { VCard, VCardActions, VCardText } from 'vuetify/components/VCard'
import { VChip } from 'vuetify/components/VChip'
import { VDialog } from 'vuetify/components/VDialog'
import { VSpacer } from 'vuetify/components/VGrid'
import { VIcon } from 'vuetify/components/VIcon'
import { VList, VListItem } from 'vuetify/components/VList'
import { VMain } from 'vuetify/components/VMain'
import { VMenu } from 'vuetify/components/VMenu'
import { VNavigationDrawer } from 'vuetify/components/VNavigationDrawer'
import { VProgressCircular } from 'vuetify/components/VProgressCircular'
import { VProgressLinear } from 'vuetify/components/VProgressLinear'
import { VSheet } from 'vuetify/components/VSheet'
import { VSparkline } from 'vuetify/components/VSparkline'
import { VTable } from 'vuetify/components/VTable'
import { VTextField } from 'vuetify/components/VTextField'
import { createAppVuetify, followStudioTheme } from '../../../shared/vuetify'
import App from './App.vue'

const client = await connect()
const vuetify = createAppVuetify({
  VAlert, VApp, VAvatar, VBreadcrumbs, VBreadcrumbsItem, VBtn, VBtnToggle, VCard, VCardActions, VCardText, VChip, VDialog,
  VIcon, VList, VListItem, VMain, VMenu, VNavigationDrawer, VProgressCircular, VProgressLinear, VSheet, VSpacer, VSparkline,
  VTable, VTextField,
})
followStudioTheme(vuetify, client)

/** The Material Design Icons character of an `mdi-…` class, for drawing icons on the canvas. */
const glyphs = new Map<string, string>()
function glyph (icon: string): string {
  let character = glyphs.get(icon)
  if (character === undefined) {
    const element = document.createElement('i')
    element.className = `mdi ${icon}`
    element.hidden = true
    document.body.append(element)
    character = getComputedStyle(element, '::before').content.replaceAll(/^["']|["']$/g, '')
    element.remove()
    glyphs.set(icon, character === 'none' ? '' : character)
  }
  return glyphs.get(icon)!
}
await document.fonts.load('24px "Material Design Icons"').catch(() => [])

createApp(App, { client, glyph }).use(vuetify).mount('#app')
