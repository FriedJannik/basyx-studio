import { VAlert } from 'vuetify/components/VAlert'
import { VApp } from 'vuetify/components/VApp'
import { VCard, VCardItem, VCardSubtitle, VCardText, VCardTitle } from 'vuetify/components/VCard'
import { VList, VListItem } from 'vuetify/components/VList'
import { VProgressLinear } from 'vuetify/components/VProgressLinear'
import { mountApp } from '../../../shared/app'
import App from './App.vue'

await mountApp(App, { VAlert, VApp, VCard, VCardItem, VCardSubtitle, VCardText, VCardTitle, VList, VListItem, VProgressLinear })
