<template>
  <v-slide-group mandatory :model-value="selectedKey" show-arrows @update:model-value="key => emit('select', String(key))">
    <v-slide-group-item v-for="(model, index) in models" :key="model.key" v-slot="{ isSelected, toggle }" :value="model.key">
      <v-card
        class="me-2"
        :color="isSelected ? 'primary' : undefined"
        data-test="model-switcher-item"
        :variant="isSelected ? 'tonal' : undefined"
        width="224"
        @click="toggle"
      >
        <v-card-item class="pa-2">
          <template #prepend>
            <v-sheet
              border
              class="overflow-hidden"
              height="44"
              rounded
              width="44"
            >
              <PreviewImage :client="client" :file="latestVersion(model.versions)?.preview ?? null" icon-size="22" :submodel-id="submodelId" />
            </v-sheet>
          </template>

          <v-card-title class="text-body-small font-weight-medium">{{ versionTitle(latestVersion(model.versions), model, index, locale) }}</v-card-title>
          <v-card-subtitle class="text-body-small">{{ subtitle(model) }}</v-card-subtitle>

          <template v-if="model.isPrimary && showPrimary" #append>
            <v-icon :aria-label="t('model.primary')" color="primary" icon="mdi-star" size="16" />
          </template>
        </v-card-item>
      </v-card>
    </v-slide-group-item>
  </v-slide-group>
</template>

<script lang="ts" setup>
  import type { Model3DEntry } from './models3d'
  import type { StudioClient } from '@basyx/studio-sdk'
  import { computed } from 'vue'
  import { useI18n } from './i18n'
  import { latestVersion, versionTitle } from './models3d'
  import { formatLabel, listValue } from './presentation'
  import PreviewImage from './PreviewImage.vue'

  // The models of the submodel as cards: preview, title, format and object type.
  const props = defineProps<{
    client: StudioClient
    submodelId: string
    models: Model3DEntry[]
    selectedKey: string
  }>()
  const emit = defineEmits<{ select: [key: string] }>()

  const { t, locale } = useI18n()

  /** The primary marker only tells something if not every model is primary. */
  const showPrimary = computed(() => props.models.some(model => !model.isPrimary))

  function subtitle (model: Model3DEntry): string {
    return [formatLabel(latestVersion(model.versions)), model.objectType && listValue(t, 'objectType', model.objectType)].filter(Boolean).join(' · ')
  }
</script>
