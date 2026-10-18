<template>
  <v-app>
    <!-- Studio's card shows the view's title; this line names the calculation methods. -->
    <v-view-card>
      <v-card-item v-if="methods">
        <v-card-subtitle>{{ methods }}</v-card-subtitle>
      </v-card-item>

      <v-progress-linear v-if="loading" />

      <v-alert v-else-if="error" class="ma-4" :text="error" type="error" />

      <template v-else-if="phases.length > 0">
        <v-card-text>
          <div class="text-display-small font-weight-medium" data-test="total">
            {{ format(total) }} <span class="text-title-medium text-medium-emphasis">kg CO₂e</span>
          </div>

          <div class="text-body-medium text-medium-emphasis">{{ reference }}</div>
        </v-card-text>

        <v-list class="px-2" density="compact">
          <v-list-item
            v-for="phase in phases"
            :key="phase.path"
            prepend-icon="mdi-recycle"
            :subtitle="phase.label"
            :title="`${format(phase.value)} kg CO₂e`"
          />
        </v-list>
      </template>

      <v-card-text v-else class="text-medium-emphasis">No carbon footprint values.</v-card-text>
    </v-view-card>
  </v-app>
</template>

<script lang="ts" setup>
  import type { Node } from '../../../shared/app'
  import type { JsonObject, StudioClient } from '@basyx/studio-sdk'
  import { StudioError } from '@basyx/studio-sdk'
  import { computed, onMounted, ref } from 'vue'
  import { child, childrenOf, loadSubmodel, textOf } from '../../../shared/app'

  const props = defineProps<{ client: StudioClient }>()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const submodel = ref<JsonObject | null>(null)
  const locale = computed(() => props.client.context.locale)

  /** Footprints of version 1.0 (`ProductCarbonFootprints` list) and 0.9 (`ProductCarbonFootprint` collections). */
  const footprints = computed<Node[]>(() => {
    if (!submodel.value) {
      return []
    }
    const list = child(submodel.value, 'ProductCarbonFootprints')
    return list ? childrenOf(list) : childrenOf(submodel.value).filter(node => /^productcarbonfootprint/i.test(String(node.element.idShort)))
  })

  function values (node: Node, idShort: string): string[] {
    const entry = child(node, idShort)
    if (!entry) {
      return []
    }
    const items = childrenOf(entry)
    return items.length > 0 ? items.map(item => textOf(item, locale.value)) : [textOf(entry, locale.value)]
  }

  const phases = computed(() => footprints.value.map(node => {
    const value = Number(textOf(child(node, 'PcfCO2eq') ?? child(node, 'PCFCO2eq'), locale.value))
    const phase = [...values(node, 'LifeCyclePhases'), ...values(node, 'PCFLifeCyclePhase')].filter(Boolean).join(', ')
    return { path: node.path, value: Number.isFinite(value) ? value : 0, label: phase ? `Life cycle phase ${phase}` : 'Life cycle phase not stated' }
  }))

  const total = computed(() => phases.value.reduce((sum, phase) => sum + phase.value, 0))

  const methods = computed(() => [...new Set(footprints.value.flatMap(node => [
    ...values(node, 'PcfCalculationMethods'),
    ...values(node, 'PCFCalculationMethod'),
  ]).filter(Boolean))].join(', '))

  const reference = computed(() => {
    const first = footprints.value[0]
    if (!first) {
      return ''
    }
    const quantity = textOf(child(first, 'QuantityOfMeasureForCalculation') ?? child(first, 'PCFQuantityOfMeasureForCalculation'), locale.value)
    const unit = textOf(child(first, 'ReferenceImpactUnitForCalculation') ?? child(first, 'PCFReferenceValueForCalculation'), locale.value)
    return quantity || unit ? `per ${[quantity, unit].filter(Boolean).join(' ')} · sum of ${phases.value.length} phases` : ''
  })

  const format = (value: number) => value.toLocaleString(locale.value, { maximumFractionDigits: 2 })

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
