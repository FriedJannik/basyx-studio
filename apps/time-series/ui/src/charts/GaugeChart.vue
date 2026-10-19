<template>
  <!-- The Web UI's Gauge: one radial bar per value with its latest point. -->
  <v-row justify="center">
    <v-col
      v-for="(item, index) in items"
      :key="item.key"
      cols="12"
      md="6"
      xl="4"
    >
      <div
        :aria-label="accessibleLabel(item)"
        class="text-center"
        data-test="gauge"
        role="group"
      >
        <div :ref="element => setChartElement(element, index)" />
        <div class="text-title-medium">{{ item.name }}</div>

        <div class="text-headline-small text-primary">{{ tooltipLabel(item.value, item.unit) }}</div>
      </div>
    </v-col>
  </v-row>
</template>

<script lang="ts" setup>
  import type { ChartSeries, LatestValue } from '../timeseries'
  import type { ThemeTokens } from '@basyx/studio-sdk'
  import type { ComponentPublicInstance } from 'vue'
  import ApexCharts from 'apexcharts'
  import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
  import { gaugeOptions, gaugeTheme } from '../chartOptions'
  import { latestValues, tooltipLabel } from '../timeseries'

  const props = defineProps<{
    series: ChartSeries[]
    theme: ThemeTokens
  }>()

  const items = computed(() => latestValues(props.series))

  const chartElements: Array<HTMLElement | null> = []
  const charts: ApexCharts[] = []

  function setChartElement (element: Element | ComponentPublicInstance | null, index: number): void {
    chartElements[index] = element instanceof HTMLElement ? element : null
  }

  function destroyCharts (): void {
    for (const chart of charts.splice(0)) {
      chart.destroy()
    }
  }

  function renderCharts (): void {
    destroyCharts()
    for (const [index, item] of items.value.entries()) {
      const element = chartElements[index]
      if (element) {
        const chart = new ApexCharts(element, gaugeOptions(item, props.theme, index))
        charts.push(chart)
        void chart.render()
      }
    }
  }

  function accessibleLabel (item: LatestValue): string {
    return `${item.name}: ${tooltipLabel(item.value, item.unit)}`
  }

  onMounted(renderCharts)

  onBeforeUnmount(destroyCharts)

  watch(items, async () => {
    await nextTick()
    renderCharts()
  })

  watch(
    () => JSON.stringify(props.theme),
    () => {
      for (const chart of charts) {
        void chart.updateOptions(gaugeTheme(props.theme), false, true)
      }
    },
  )
</script>
