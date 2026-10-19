<template>
  <!-- The Web UI's DisplayField: the latest value of each series. -->
  <v-sheet class="d-flex flex-column align-center justify-center" color="transparent" min-height="350">
    <div
      v-for="item in items"
      :key="item.key"
      class="my-3 text-center"
      data-test="display-field"
    >
      <v-card-subtitle>{{ `${item.name}:` }}</v-card-subtitle>

      <v-card-title>
        <span class="text-headline-small text-primary">{{ formatValue(item.value) }}</span>
        <span v-if="item.unit" class="ml-2 text-headline-small">{{ item.unit }}</span>
      </v-card-title>
    </div>
  </v-sheet>
</template>

<script lang="ts" setup>
  import type { ChartSeries } from '../timeseries'
  import { computed } from 'vue'
  import { formatValue, latestValues } from '../timeseries'

  const props = defineProps<{
    series: ChartSeries[]
  }>()

  const items = computed(() => latestValues(props.series))
</script>
