<template>
  <v-empty-state
    data-test="engine-missing"
    :headline="selected ? t('engine.stoppedTitle', { name: selected.name }) : t('engine.missingTitle')"
    icon="mdi-docker"
    :text="selected ? t('engine.stoppedText', { name: selected.name }) : t('engine.missingText')"
  >
    <template #actions>
      <div class="d-flex flex-wrap justify-center ga-2">
        <template v-if="!selected">
          <v-btn-primary append-icon="mdi-open-in-new" :text="t('engine.getDocker')" @click="open('https://www.docker.com/products/docker-desktop/')" />
          <v-btn append-icon="mdi-open-in-new" :text="t('engine.getPodman')" variant="outlined" @click="open('https://podman-desktop.io/')" />
        </template>

        <v-btn :loading="checking" prepend-icon="mdi-refresh" :text="t('engine.checkAgain')" @click="emit('check')" />
      </div>
    </template>
  </v-empty-state>
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
