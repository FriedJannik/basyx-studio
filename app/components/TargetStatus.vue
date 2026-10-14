<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-2">
      <TargetChips :target="target" />
      <WorkspaceActions v-if="target.workspace" :target="target" @error="error => (actionError = error)" />

      <v-btn
        v-if="target.authenticationState === 'authenticated'"
        prepend-icon="mdi-account-cancel-outline"
        size="small"
        :text="t('target.revoke')"
        @click="revoke"
      />
    </div>

    <ProblemAlert v-if="actionError" class="mt-4" :error="actionError" />
  </div>
</template>

<script lang="ts" setup>
  import type { Target } from '#shared/contract'

  const props = defineProps<{ target: Target }>()

  const { t } = useI18n()
  const api = useStudioApi()
  const invalidate = useInvalidate()
  const actionError = ref<unknown>(null)

  async function revoke () {
    await api(`/targets/${props.target.id}/authorization`, { method: 'DELETE' })
    // Drop everything cached for this target, then reload its state.
    await invalidate(['targets', props.target.id])
  }
</script>
