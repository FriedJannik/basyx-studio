<template>
  <v-sheet border class="pa-3" data-test="sign-in" rounded="lg">
    <div class="d-flex align-center ga-2 mb-2">
      <div class="text-body-2 flex-grow-1">{{ t('signIn.text') }}</div>
      <v-btn :aria-label="t('remove.cancel')" icon="mdi-close" size="small" @click="emit('close')" />
    </div>

    <v-progress-linear v-if="!details && !error" />

    <v-alert v-else-if="error" :text="error" type="error" />

    <template v-else-if="details">
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t('signIn.user') }}</th>
            <th>{{ t('signIn.role') }}</th>
            <th>{{ t('signIn.password') }}</th>
            <th />
          </tr>
        </thead>

        <tbody>
          <tr v-for="user in details.users" :key="user.username">
            <td class="text-mono">{{ user.username }}</td>
            <td>{{ t(roleKeys[user.role]) }}</td>
            <td class="text-mono">{{ show ? user.password : '••••••••••••' }}</td>

            <td class="text-end">
              <v-btn :aria-label="t('card.copy')" icon="mdi-content-copy" size="small" @click="client.ui.copyText(user.password)" />
            </td>
          </tr>
        </tbody>
      </v-table>

      <v-switch
        v-model="show"
        :label="t('signIn.show')"
      />

      <v-alert v-if="sharing && stack.spec?.aasxFiles.length" class="my-2" :text="t('signIn.sharingHint')" type="info" />

      <div class="d-flex flex-wrap ga-2">
        <v-btn append-icon="mdi-open-in-new" :text="t('signIn.account')" @click="client.ui.openExternal(details.accountUrl)" />
        <v-btn append-icon="mdi-open-in-new" :text="t('signIn.console')" @click="client.ui.openExternal(details.console.url)" />
        <v-chip prepend-icon="mdi-account-cog-outline" :text="`${details.console.username} · ${show ? details.console.password : '••••••••••••'}`" />
      </div>
    </template>
  </v-sheet>
</template>

<script lang="ts" setup>
  import type { Stack, StackSignIn } from '@basyx/studio-sdk'
  import { computed, onMounted, ref } from 'vue'
  import { useI18n } from './i18n'
  import { problemOf, problemText, useClient } from './support'

  const props = defineProps<{ stack: Stack }>()
  const emit = defineEmits<{ close: [] }>()
  const { t } = useI18n()
  const client = useClient()

  const details = ref<StackSignIn | null>(null)
  const error = ref<string | null>(null)
  const show = ref(false)
  const sharing = computed(() => props.stack.spec?.security.mode === 'keycloak' && props.stack.spec.security.access === 'sharing')
  const roleKeys = { admin: 'signIn.roleAdmin', viewer: 'signIn.roleViewer', user: 'signIn.roleUser' } as const

  onMounted(async () => {
    try {
      details.value = await client.containers.getSignIn(props.stack.id)
    } catch (error_) {
      error.value = problemText(t, problemOf(error_))
    }
  })
</script>
