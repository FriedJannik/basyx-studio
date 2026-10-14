<template>
  <v-card class="mx-auto" max-width="560">
    <v-card-item prepend-icon="mdi-account-key-outline">
      <v-card-title>{{ t('target.authorizeTitle', { name: target.name }) }}</v-card-title>
    </v-card-item>

    <v-card-text>
      <p class="my-0">{{ t('target.authorizeText') }}</p>
      <ProblemAlert v-if="error" class="mt-4" :error="error" />

      <v-alert v-if="waiting" class="mt-4" type="info">
        {{ t('target.waitingForBrowser') }}
      </v-alert>
    </v-card-text>

    <v-card-actions class="px-4 pb-4">
      <v-btn-primary
        :loading="starting || waiting"
        prepend-icon="mdi-login"
        :text="t('target.authorize')"
        @click="authorize"
      />

      <v-btn v-if="waiting" :text="t('target.cancel')" @click="stopWaiting" />
    </v-card-actions>
  </v-card>
</template>

<script lang="ts" setup>
  import type { AuthorizationStart, Target } from '#shared/contract'

  const props = defineProps<{ target: Target }>()
  const emit = defineEmits<{ authorized: [] }>()

  const { t } = useI18n()
  const route = useRoute()
  const api = useStudioApi()

  const starting = ref(false)
  const waiting = ref(false)
  const error = ref<unknown>(null)
  let poll: ReturnType<typeof setInterval> | undefined
  let deadline = 0

  function stopWaiting () {
    clearInterval(poll)
    poll = undefined
    waiting.value = false
  }

  // Desktop: the IdP login runs in the system browser and calls back to the
  // local service; this page polls until the target is authorized.
  function waitForExternalCompletion () {
    waiting.value = true
    deadline = Date.now() + 5 * 60_000
    poll = setInterval(async () => {
      if (Date.now() > deadline) {
        stopWaiting()
        return
      }
      const target = await api<Target>(`/targets/${props.target.id}`).catch(() => null)
      if (target?.authenticationState === 'authenticated') {
        stopWaiting()
        emit('authorized')
      }
    }, 2000)
  }

  async function authorize () {
    starting.value = true
    error.value = null
    try {
      const start = await api<AuthorizationStart>(`/targets/${props.target.id}/authorization`, {
        method: 'POST',
        body: { returnTo: route.fullPath.replace(/[?&]authError=[^&]*/, '') },
      })
      if (start.mode === 'external') {
        window.open(start.authorizationUrl, '_blank', 'noopener')
        waitForExternalCompletion()
      } else {
        window.location.assign(start.authorizationUrl)
      }
    } catch (error_) {
      error.value = error_
    } finally {
      starting.value = false
    }
  }

  onBeforeUnmount(stopWaiting)
</script>
