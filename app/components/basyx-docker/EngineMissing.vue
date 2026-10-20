<template>
  <v-card class="pa-4 mx-auto w-100" data-test="engine-missing" max-width="720">
    <div class="d-flex flex-column align-center text-center ga-3">
      <v-icon color="medium-emphasis" icon="mdi-docker" size="40" />

      <div>
        <div class="text-title-medium font-weight-medium">
          {{ selected ? t('engine.stoppedTitle', { name: selected.name }) : t('engine.missingTitle') }}
        </div>

        <div class="text-body-medium text-medium-emphasis mt-1">
          {{ selected ? t('engine.stoppedText', { name: selected.name }) : t('engine.missingText') }}
        </div>
      </div>

      <div class="d-flex flex-wrap justify-center ga-2">
        <template v-if="!selected">
          <v-btn-primary append-icon="mdi-open-in-new" :text="t('engine.getDocker')" @click="open('https://www.docker.com/products/docker-desktop/')" />
          <v-btn-secondary append-icon="mdi-open-in-new" :text="t('engine.getPodman')" @click="open('https://podman-desktop.io/')" />
        </template>

        <v-btn :loading="checking" prepend-icon="mdi-refresh" :text="t('engine.checkAgain')" @click="emit('check')" />
      </div>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
  import type { Engines } from '@basyx/studio-sdk'
  import { computed } from 'vue'
  import { useI18n } from './i18n'
  import { useClient } from './support'

  const props = defineProps<{ engines: Engines, checking: boolean }>()
  const emit = defineEmits<{ check: [] }>()
  const { t } = useI18n()
  const client = useClient()

  /** An engine that exists but does not run. */
  const selected = computed(() => props.engines.selected ?? props.engines.candidates[0] ?? null)

  function open (url: string) {
    void client.ui.openExternal(url)
  }
</script>
