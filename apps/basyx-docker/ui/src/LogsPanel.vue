<template>
  <v-sheet border class="pa-3" data-test="logs" rounded="lg">
    <div class="d-flex flex-wrap align-center ga-2 mb-2">
      <v-select
        v-model="component"
        density="compact"
        hide-details
        :items="components"
        :label="t('logs.component')"
        max-width="280"
        variant="outlined"
      />

      <v-spacer />
      <v-btn :loading="loading" prepend-icon="mdi-refresh" :text="t('logs.refresh')" @click="load" />

      <v-btn
        :aria-label="t('card.copy')"
        :disabled="!text"
        icon="mdi-content-copy"
        size="small"
        @click="client.ui.copyText(text)"
      />

      <v-btn :disabled="!text" prepend-icon="mdi-content-save-outline" :text="t('logs.save')" @click="save" />

      <v-btn :aria-label="t('remove.cancel')" icon="mdi-close" size="small" @click="emit('close')" />
    </div>

    <v-alert v-if="error" :text="error" type="error" />

    <div v-else-if="!text && !loading" class="text-body-2 text-medium-emphasis">{{ t('logs.empty') }}</div>

    <v-sheet
      v-else
      class="pa-2 overflow-auto text-caption text-mono text-pre"
      color="surface-light"
      max-height="360"
      rounded
    >{{ text }}</v-sheet>
  </v-sheet>
</template>

<script lang="ts" setup>
  import type { Stack, StackComponentId } from '@basyx/studio-sdk'
  import { computed, ref, watch } from 'vue'
  import { useI18n } from './i18n'
  import { problemOf, problemText, useClient } from './support'

  const props = defineProps<{ stack: Stack }>()
  const emit = defineEmits<{ close: [] }>()
  const { t } = useI18n()
  const client = useClient()

  const components = computed(() => props.stack.components.map(component => ({ value: component.id, title: t(`component.${component.id}`) })))
  // The failing part first, else the AAS server.
  const initial = props.stack.components.find(component => component.state === 'unhealthy' || (component.state === 'exited' && component.exitCode !== 0 && component.id !== 'schema'))?.id
    ?? (props.stack.components.some(component => component.id === 'environment') ? 'environment' : props.stack.components[0]?.id)
  const component = ref<StackComponentId | undefined>(initial)
  const text = ref('')
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load () {
    if (!component.value) {
      return
    }
    loading.value = true
    error.value = null
    try {
      text.value = (await client.containers.getLogs(props.stack.id, component.value, 500)).text
    } catch (error_) {
      error.value = problemText(t, problemOf(error_))
    } finally {
      loading.value = false
    }
  }

  async function save () {
    if (!component.value) {
      return
    }
    try {
      await client.containers.saveLogs(props.stack.id, component.value)
    } catch (error_) {
      error.value = problemText(t, problemOf(error_))
    }
  }

  watch(component, () => void load(), { immediate: true })
</script>
