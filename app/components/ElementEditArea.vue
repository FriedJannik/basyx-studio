<template>
  <v-card v-if="editor" border="0" color="surface-light">
    <component
      :is="editor"
      :detail="detail"
      :explicit-save="explicitSave"
      :submodel-key="submodelKey"
      :target-id="targetId"
      @changed="(value: ElementDetail) => emit('changed', value)"
    />
  </v-card>
</template>

<script lang="ts" setup>
  import type { ElementDetail } from '#shared/contract'
  import type { Component } from 'vue'
  import { ElementValueEditor } from '#components'

  // The edit area of the details drawer (MVP-4 plan, T3): one editor per
  // model type. A later editing MVP adds element types here, without changing
  // the drawer. File contents are replaced from the file view.
  const props = defineProps<{ targetId: string, submodelKey: string, detail: ElementDetail, explicitSave: boolean }>()
  const emit = defineEmits<{ changed: [detail: ElementDetail] }>()

  const editors: Partial<Record<string, Component>> = {
    Property: ElementValueEditor,
    MultiLanguageProperty: ElementValueEditor,
  }

  const editor = computed(() => editors[String((props.detail.value as { modelType?: unknown } | null)?.modelType)] ?? null)
</script>
