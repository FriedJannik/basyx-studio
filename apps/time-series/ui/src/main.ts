import { VAlert } from 'vuetify/components/VAlert'
import { VApp } from 'vuetify/components/VApp'
import { VBtn } from 'vuetify/components/VBtn'
import { VBtnGroup } from 'vuetify/components/VBtnGroup'
import { VBtnToggle } from 'vuetify/components/VBtnToggle'
import { VCard, VCardActions, VCardItem, VCardSubtitle, VCardText, VCardTitle } from 'vuetify/components/VCard'
import { VChip } from 'vuetify/components/VChip'
import { VChipGroup } from 'vuetify/components/VChipGroup'
import { VDivider } from 'vuetify/components/VDivider'
import { VEmptyState } from 'vuetify/components/VEmptyState'
import { VCol, VRow, VSpacer } from 'vuetify/components/VGrid'
import { VIcon } from 'vuetify/components/VIcon'
import { VMenu } from 'vuetify/components/VMenu'
import { VProgressLinear } from 'vuetify/components/VProgressLinear'
import { VSelect } from 'vuetify/components/VSelect'
import { VSheet } from 'vuetify/components/VSheet'
import { VSwitch } from 'vuetify/components/VSwitch'
import { VTextField } from 'vuetify/components/VTextField'
import { mountApp } from '../../../shared/app'
import App from './App.vue'

await mountApp(App, {
  VAlert,
  VApp,
  VBtn,
  VBtnGroup,
  VBtnToggle,
  VCard,
  VCardActions,
  VCardItem,
  VCardSubtitle,
  VCardText,
  VCardTitle,
  VChip,
  VChipGroup,
  VCol,
  VDivider,
  VEmptyState,
  VIcon,
  VMenu,
  VProgressLinear,
  VRow,
  VSelect,
  VSheet,
  VSpacer,
  VSwitch,
  VTextField,
})
