<template>
  <v-expansion-panels v-if="groups.length > 0" data-test="technical-details" static>
    <v-expansion-panel :title="t('details.title')">
      <v-expansion-panel-text>
        <div v-for="(group, index) in groups" :key="group.key">
          <v-divider v-if="index > 0" class="my-3" />

          <div class="d-flex align-center mb-2 text-body-small text-medium-emphasis">
            <v-icon class="me-2" :icon="group.icon" size="16" />
            {{ group.title }}
          </div>

          <DefinitionList :rows="group.rows" @open="url => emit('open', url)" />
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script lang="ts" setup>
  import type { DetailGroup } from './presentation'
  import DefinitionList from './DefinitionList.vue'
  import { useI18n } from './i18n'

  // Everything else of the model and version, collapsed.
  defineProps<{ groups: DetailGroup[] }>()
  const emit = defineEmits<{ open: [url: string] }>()

  const { t } = useI18n()
</script>
