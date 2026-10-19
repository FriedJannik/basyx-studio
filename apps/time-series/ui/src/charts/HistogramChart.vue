<template>
  <!-- The Web UI's Histogram; the view sets the bins and stacking. -->
  <div ref="container" data-test="histogram-chart" />
</template>

<script lang="ts" setup>
  import type { ChartSeries } from '../timeseries'
  import type { ThemeTokens } from '@basyx/studio-sdk'
  import ApexCharts from 'apexcharts'
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { apexLocale, histogramOptions, histogramSeries, themeOptions } from '../chartOptions'
  import { histogramData } from '../timeseries'

  const props = defineProps<{
    series: ChartSeries[]
    theme: ThemeTokens
    locale: string
    bins: number
    stacked: boolean
  }>()

  const container = ref<HTMLElement | null>(null)

  let chart: ApexCharts | null = null

  function render (): void {
    const data = histogramData(props.series, props.bins)
    if (!container.value || data.histograms.length === 0) {
      return
    }
    chart = new ApexCharts(container.value, histogramOptions({
      data,
      series: props.series,
      stacked: props.stacked,
      theme: props.theme,
      locale: props.locale,
    }))
    void chart.render()
  }

  function update (): void {
    if (!chart) {
      render()
      return
    }
    const data = histogramData(props.series, props.bins)
    if (data.histograms.length === 0) {
      return
    }
    void chart.updateSeries(histogramSeries({ data, series: props.series }), true)
    void chart.updateOptions({ xaxis: { categories: data.categories } })
  }

  onMounted(render)

  onBeforeUnmount(() => {
    chart?.destroy()
    chart = null
  })

  watch([() => props.series, () => props.bins], update)

  watch(() => props.stacked, value => {
    void chart?.updateOptions({ chart: { stacked: value } })
  })

  watch(
    () => JSON.stringify(props.theme),
    () => {
      void chart?.updateOptions(themeOptions(props.theme), false, true)
    },
  )

  watch(
    () => props.locale,
    locale => chart?.setLocale(apexLocale(locale)),
  )
</script>
