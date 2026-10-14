import { VAlert } from 'vuetify/components/VAlert'
import { VApp } from 'vuetify/components/VApp'
import { VAvatar } from 'vuetify/components/VAvatar'
import { VCard, VCardItem, VCardSubtitle, VCardText, VCardTitle } from 'vuetify/components/VCard'
import { VIcon } from 'vuetify/components/VIcon'
import { VList, VListItem } from 'vuetify/components/VList'
import { VProgressLinear } from 'vuetify/components/VProgressLinear'
import { mountApp } from '../../../shared/app'
import App from './App.vue'

await mountApp(App, { VAlert, VApp, VAvatar, VCard, VCardItem, VCardSubtitle, VCardText, VCardTitle, VIcon, VList, VListItem, VProgressLinear })
