<template>
  <v-app>
    <!-- Studio's card shows the view's title; this line names the product. -->
    <v-view-card>
      <v-card-item v-if="designation">
        <v-card-subtitle>{{ designation }}</v-card-subtitle>
      </v-card-item>

      <v-progress-linear v-if="loading" />

      <v-alert v-else-if="error" class="ma-4" :text="error" type="error" />

      <v-table v-else-if="properties.length > 0" density="comfortable">
        <tbody>
          <tr v-for="row in properties" :key="row.path">
            <td class="text-medium-emphasis">{{ row.label }}</td>
            <td class="text-end font-weight-medium">{{ row.value }}</td>
          </tr>
        </tbody>
      </v-table>

      <v-card-text v-else class="text-medium-emphasis">No technical properties.</v-card-text>
    </v-view-card>
  </v-app>
</template>

<script lang="ts" setup>
  import type { Node } from '../../../shared/app'
  import type { JsonObject, StudioClient } from '@basyx/studio-sdk'
  import { StudioError } from '@basyx/studio-sdk'
  import { computed, onMounted, ref } from 'vue'
  import { child, childrenOf, humanize, loadSubmodel, textOf } from '../../../shared/app'

  const props = defineProps<{ client: StudioClient }>()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const submodel = ref<JsonObject | null>(null)
  const locale = computed(() => props.client.context.locale)

  const designation = computed(() => textOf(child(child(submodel.value ?? undefined, 'GeneralInformation'), 'ManufacturerProductDesignation'), locale.value))

  /** Property values below a node, depth first, labeled by their idShort. */
  function leaves (node: Node): Array<{ path: string, label: string, value: string }> {
    const type = node.element.modelType
    if (type === 'Property' || type === 'MultiLanguageProperty') {
      const value = textOf(node, locale.value)
      return value ? [{ path: node.path, label: humanize(String(node.element.idShort)), value }] : []
    }
    if (type === 'Range') {
      return [{ path: node.path, label: humanize(String(node.element.idShort)), value: `${node.element.min ?? '…'} – ${node.element.max ?? '…'}` }]
    }
    return childrenOf(node).flatMap(entry => leaves(entry))
  }

  /** Version 2 groups properties in `TechnicalPropertyAreas`, version 1.2 in `TechnicalProperties`. */
  const properties = computed(() => {
    const area = child(submodel.value ?? undefined, 'TechnicalPropertyAreas') ?? child(submodel.value ?? undefined, 'TechnicalProperties')
    return area ? leaves(area) : []
  })

  onMounted(async () => {
    try {
      submodel.value = await loadSubmodel(props.client)
    } catch (error_) {
      error.value = error_ instanceof StudioError ? error_.message : String(error_)
    } finally {
      loading.value = false
    }
  })
</script>
