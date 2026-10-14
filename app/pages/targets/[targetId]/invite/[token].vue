<template>
  <v-container max-width="560">
    <v-card prepend-icon="mdi-account-multiple-check-outline" :title="t('invite.title')">
      <v-card-text>
        <p class="my-0">{{ t('invite.text', { name: target.data.value?.name ?? '' }) }}</p>
        <ProblemAlert v-if="error" class="mt-4" :error="error" />
        <v-alert v-if="accepted" class="mt-4" :text="t('invite.accepted')" type="success" />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn v-if="accepted" :text="t('invite.open')" :to="`/targets/${targetId}/shells`" />

        <v-btn-primary
          v-else
          :disabled="!target.data.value || target.needsAuthorization.value"
          :loading="accepting"
          :text="t('invite.accept')"
          @click="accept"
        />
      </v-card-actions>
    </v-card>

    <TargetAuthorization
      v-if="target.data.value && target.needsAuthorization.value"
      class="mt-4"
      :target="target.data.value"
      @authorized="target.refetch()"
    />
  </v-container>
</template>

<script lang="ts" setup>
  const { t } = useI18n()
  const route = useRoute()
  const api = useStudioApi()

  const targetId = computed(() => String(route.params.targetId))
  const target = useTarget(targetId)
  const accepting = ref(false)
  const accepted = ref(false)
  const error = ref<unknown>(null)

  // The invitation is only accepted on an explicit click, never on page load.
  async function accept () {
    accepting.value = true
    error.value = null
    try {
      await api(`/targets/${targetId.value}/invitations`, { method: 'POST', body: { token: String(route.params.token) } })
      accepted.value = true
    } catch (error_) {
      error.value = error_
    } finally {
      accepting.value = false
    }
  }
</script>
