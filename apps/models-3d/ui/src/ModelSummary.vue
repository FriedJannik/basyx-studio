<template>
  <div class="d-flex flex-column ga-4" data-test="model-summary">
    <div v-if="lod">
      <div class="d-flex align-center mb-1 text-body-small text-medium-emphasis">
        <v-icon class="me-2" icon="mdi-layers-triple-outline" size="16" />
        {{ t('summary.levelOfDetail') }}
      </div>

      <div class="text-body-medium">{{ lod }}</div>

      <div v-if="model.simplification?.reducedElements.length" class="d-flex flex-wrap align-center ga-1 mt-2">
        <span class="text-body-small text-medium-emphasis">{{ t('summary.reduced') }}</span>

        <v-chip
          v-for="element in model.simplification.reducedElements"
          :key="element"
          size="x-small"
          :text="listValue(t, 'reducedElements', element)"
        />
      </div>
    </div>

    <div v-if="model.positivePurposes.length > 0 || model.negativePurposes.length > 0">
      <div class="d-flex align-center mb-1 text-body-small text-medium-emphasis">
        <v-icon class="me-2" icon="mdi-bullseye-arrow" size="16" />
        {{ t('summary.intendedUse') }}
      </div>

      <div class="d-flex flex-wrap ga-1">
        <v-chip
          v-for="purpose in model.positivePurposes"
          :key="`pos-${purpose}`"
          color="success"
          prepend-icon="mdi-check"
          size="x-small"
          :text="listValue(t, 'purpose', purpose)"
        />

        <v-chip
          v-for="purpose in model.negativePurposes"
          :key="`neg-${purpose}`"
          color="error"
          prepend-icon="mdi-close"
          size="x-small"
          :text="listValue(t, 'purpose', purpose)"
        />
      </div>
    </div>

    <DefinitionList v-if="facts.length > 0" :rows="facts" />
  </div>
</template>

<script lang="ts" setup>
  import type { Model3DEntry } from './models3d'
  import { computed } from 'vue'
  import DefinitionList from './DefinitionList.vue'
  import { useI18n } from './i18n'
  import { levelOfDetail, listValue, modelFacts } from './presentation'

  // Next to the viewer: level of detail, intended use and the key facts.
  const props = defineProps<{ model: Model3DEntry }>()

  const { t } = useI18n()

  const lod = computed(() => levelOfDetail(t, props.model))
  const facts = computed(() => modelFacts(t, props.model))
</script>
