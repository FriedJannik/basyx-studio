<template>
  <v-alert v-if="failed.length > 0" :title="t('sync.failedTitle', failed.length)" type="warning">
    <div class="text-body-medium mb-1">{{ t('sync.failedText') }}</div>

    <v-list>
      <v-list-item
        v-for="step in failed"
        :key="`${step.resource}:${step.id}`"
        class="px-0"
        :subtitle="step.detail"
        :title="t(`sync.resources.${step.resource}`, { id: step.id })"
      />
    </v-list>
  </v-alert>

  <div v-else-if="written > 0" class="text-body-small text-medium-emphasis">{{ t('sync.done', written) }}</div>
</template>

<script lang="ts" setup>
  import type { SyncStep } from '#shared/contract'

  // What Studio wrote to the registries and discovery after an upload or a
  // delete (MVP-4 plan, I5); failures are listed, the rest is summarized.
  const props = defineProps<{ steps: SyncStep[] }>()

  const { t } = useI18n()

  const failed = computed(() => props.steps.filter(step => step.outcome === 'failed'))
  const written = computed(() => props.steps.length - failed.value.length)
</script>
