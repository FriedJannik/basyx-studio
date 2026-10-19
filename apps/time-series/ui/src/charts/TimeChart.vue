<template>
  <!-- The Web UI's LineChart, AreaChart and ScatterChart in one component.
       The view sets the interpolation of line and area charts. -->
  <div ref="container" data-test="time-chart" />
</template>

<script lang="ts" setup>
  import type { Interpolation, TimeChartType } from '../chartOptions'
  import type { ResolvedTimeRange } from '../timeRange'
  import type { ChartSeries } from '../timeseries'
  import type { ThemeTokens } from '@basyx/studio-sdk'
  import type { ApexOptions } from 'apexcharts'
  import ApexCharts from 'apexcharts'
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { apexLocale, apexSeries, markerStroke, seriesLabels, themeOptions, timeChartOptions } from '../chartOptions'
  import { toApexTimeRange } from '../timeRange'

  const props = defineProps<{
    type: TimeChartType
    series: ChartSeries[]
    range: ResolvedTimeRange | null
    theme: ThemeTokens
    locale: string
    /** Changes when a different time range is committed: the viewport is reset (Web UI). */
    viewportResetKey: string
    /** Line and area charts. */
    curve: Interpolation
  }>()

  const container = ref<HTMLElement | null>(null)

  let chart: ApexCharts | null = null
  let isViewportZoomed = false
  let lastViewportResetKey = props.viewportResetKey

  function render (): void {
    if (!container.value) {
      return
    }
    chart = new ApexCharts(container.value, timeChartOptions({
      type: props.type,
      series: props.series,
      range: props.range,
      theme: props.theme,
      locale: props.locale,
      curve: props.curve,
      events: {
        beforeResetZoom: () => {
          isViewportZoomed = false
          queueMicrotask(() => chart?.updateOptions({ xaxis: toApexTimeRange(props.range) }))
        },
        scrolled: () => {
          isViewportZoomed = true
        },
        zoomed: () => {
          isViewportZoomed = true
        },
      },
    }))
    void chart.render()
  }

  onMounted(render)

  onBeforeUnmount(() => {
    chart?.destroy()
    chart = null
  })

  // New data replaces the series; ApexCharts then restores the stored axis
  // bounds, so a zoomed or panned viewport is put back afterwards.
  watch(
    () => props.series,
    async series => {
      if (!chart) {
        render()
        return
      }
      const current = chart
      const { minX, maxX } = current.getState()
      const viewport = isViewportZoomed ? { minX, maxX } : null
      await current.updateSeries(apexSeries(series), !viewport)
      if (viewport && chart === current) {
        current.zoomX(viewport.minX, viewport.maxX)
      }
      void current.updateOptions(seriesLabels(series))
    },
  )

  // A refresh keeps the user's zoom; a newly committed range resets it (Web UI).
  watch(
    [() => props.range, () => props.viewportResetKey],
    ([range]) => {
      if (!chart) {
        return
      }
      const xaxis = toApexTimeRange(range)
      const shouldResetViewport = props.viewportResetKey !== lastViewportResetKey
      lastViewportResetKey = props.viewportResetKey
      if (shouldResetViewport || !isViewportZoomed) {
        isViewportZoomed = false
        chart.resetSeries(false, true)
        void chart.updateOptions({ xaxis })
      }
    },
  )

  watch(
    () => JSON.stringify(props.theme),
    () => {
      const options: ApexOptions = themeOptions(props.theme)
      if (props.type === 'scatter') {
        options.markers = { strokeColors: markerStroke(props.theme) }
      }
      void chart?.updateOptions(options, false, true)
    },
  )

  watch(
    () => props.locale,
    locale => chart?.setLocale(apexLocale(locale)),
  )

  watch(() => props.curve, value => {
    void chart?.updateOptions({ stroke: { curve: value } })
  })
</script>
