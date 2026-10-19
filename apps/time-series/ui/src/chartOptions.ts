import type { ResolvedTimeRange } from './timeRange'
import type { ChartSeries, HistogramData, LatestValue } from './timeseries'
import type { ThemeTokens } from '@basyx/studio-sdk'
import type { ApexAxisChartSeries, ApexLocale, ApexOptions } from 'apexcharts'
import de from 'apexcharts/dist/locales/de.json'
import en from 'apexcharts/dist/locales/en.json'
import es from 'apexcharts/dist/locales/es.json'
import fr from 'apexcharts/dist/locales/fr.json'
import ja from 'apexcharts/dist/locales/ja.json'
import nl from 'apexcharts/dist/locales/nl.json'
import zhCn from 'apexcharts/dist/locales/zh-cn.json'
import { toApexTimeRange } from './timeRange'
import { legendLabel, tooltipLabel } from './timeseries'

// ApexCharts options of the Time Series Data view, ported from the BaSyx
// AAS Web UI's widgets (LineChart, AreaChart, ScatterChart, Histogram,
// Gauge) and ChartHandling. The charts follow Studio's theme and locale
// instead of Vuetify's in the Web UI (ADR 0041).

export type TimeChartType = 'line' | 'area' | 'scatter'
export type Interpolation = 'smooth' | 'straight' | 'stepline'
export const INTERPOLATIONS: Interpolation[] = ['smooth', 'straight', 'stepline']

export type ChartType = TimeChartType | 'histogram' | 'gauge' | 'display'
/** The chart types in the Web UI's order. */
export const CHART_TYPES: ChartType[] = ['line', 'area', 'scatter', 'histogram', 'gauge', 'display']

export const CHART_HEIGHT = 350
export const GAUGE_HEIGHT = 280

/** Theme colours used for the series, in this order. */
const PALETTE = ['primary', 'secondary', 'success', 'info', 'warning', 'error']

const LOCALES = [de, en, es, fr, ja, nl, zhCn] as ApexLocale[]

/** ApexCharts' locale for Studio's locale (`zh-Hans` → `zh-cn`, `de-saar` → `de`). */
export function apexLocale (locale: string): string {
  if (locale.toLowerCase().startsWith('zh')) {
    return 'zh-cn'
  }
  const language = locale.split('-', 1)[0]!.toLowerCase()
  return LOCALES.some(entry => entry.name === language) ? language : 'en'
}

/** The series colours of Studio's theme. */
export function themeColors (theme: ThemeTokens): string[] {
  return PALETTE.flatMap(name => (theme.colors[name] ? [theme.colors[name]] : []))
}

/** A `#rgb` or `#rrggbb` colour with an opacity, as Vuetify draws borders (`on-surface` at 12 %). */
export function withOpacity (color: string | undefined, opacity: number): string | undefined {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color ?? '')?.[1]
  if (!hex) {
    return undefined
  }
  const full = hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex
  const [red, green, blue] = [0, 2, 4].map(index => Number.parseInt(full.slice(index, index + 2), 16))
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`
}

/** Mode, colours, text and grid colour of Studio's theme; the card shows through. */
export function themeOptions (theme: ThemeTokens): ApexOptions {
  const colors = themeColors(theme)
  const foreColor = theme.colors['on-surface']
  const borderColor = withOpacity(foreColor, 0.12)
  return {
    chart: {
      background: 'transparent',
      // ApexCharts keeps 15 px free below every chart by default.
      parentHeightOffset: 0,
      ...(foreColor ? { foreColor } : {}),
    },
    ...(colors.length > 0 ? { colors } : {}),
    ...(borderColor ? { grid: { borderColor } } : {}),
    theme: { mode: theme.dark ? 'dark' : 'light' },
  }
}

/** The surface behind the scatter markers (the Web UI's `#1E1E1E` / `#FFFFFF`). */
export function markerStroke (theme: ThemeTokens): string {
  return theme.colors.surface ?? (theme.dark ? '#1E1E1E' : '#FFFFFF')
}

function localeOptions (locale: string): NonNullable<ApexOptions['chart']> {
  return { locales: LOCALES, defaultLocale: apexLocale(locale) }
}

/** Legend and tooltips of ChartHandling: `name [unit]` and `value unit`. */
export function seriesLabels (series: ChartSeries[]): Pick<ApexOptions, 'legend' | 'tooltip'> {
  return {
    legend: {
      formatter: (seriesName, options) => legendLabel(seriesName, series[options?.seriesIndex ?? -1]?.unit ?? ''),
    },
    tooltip: {
      x: { format: 'dd MMM yyyy HH:mm:ss' },
      y: series.map(entry => ({ formatter: (value: number) => tooltipLabel(value, entry.unit) })),
    },
  }
}

export function apexSeries (series: ChartSeries[]): ApexAxisChartSeries {
  return series.map(entry => ({ name: entry.name, data: entry.points.map(([time, value]) => [time, value] as [number, number]) }))
}

export interface TimeChartInput {
  type: TimeChartType
  series: ChartSeries[]
  range: ResolvedTimeRange | null
  theme: ThemeTokens
  locale: string
  curve: Interpolation
  /** Zoom and pan of the user, so a refresh keeps the viewport (Web UI). */
  events: NonNullable<NonNullable<ApexOptions['chart']>['events']>
}

/** Line, area and scatter chart: the options of the Web UI's LineChart, AreaChart and ScatterChart. */
export function timeChartOptions (input: TimeChartInput): ApexOptions {
  const theme = themeOptions(input.theme)
  const labels = seriesLabels(input.series)
  return {
    ...theme,
    chart: {
      ...theme.chart,
      ...localeOptions(input.locale),
      id: input.type,
      type: input.type,
      height: CHART_HEIGHT,
      events: input.events,
      selection: { enabled: true, type: 'x' },
      toolbar: {
        show: true,
        autoSelected: 'zoom',
        // The sandboxed frame cannot download files.
        tools: { download: false, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true },
      },
      zoom: { enabled: true, type: 'x', autoScaleYaxis: true, allowMouseWheelZoom: false },
    },
    legend: labels.legend,
    dataLabels: { enabled: false },
    xaxis: {
      type: 'datetime',
      ...toApexTimeRange(input.range),
      tickAmount: 10,
      labels: {
        datetimeFormatter: { year: 'yyyy', month: 'MMM \'yy', day: 'dd MMM', hour: 'HH:mm' },
        datetimeUTC: false,
      },
      tickPlacement: 'on',
    },
    yaxis: { decimalsInFloat: 2 },
    ...(input.type === 'scatter'
      ? { markers: { size: 4, strokeColors: markerStroke(input.theme) } }
      : { stroke: { curve: input.curve, width: 3 } }),
    grid: { ...theme.grid, xaxis: { lines: { show: false } } },
    tooltip: labels.tooltip,
    series: apexSeries(input.series),
  }
}

export interface HistogramInput {
  data: HistogramData
  series: ChartSeries[]
  stacked: boolean
  theme: ThemeTokens
  locale: string
}

export function histogramSeries (input: Pick<HistogramInput, 'data' | 'series'>): ApexAxisChartSeries {
  return input.data.histograms.map((histogram, index) => ({ name: input.series[index]?.name ?? '', data: histogram }))
}

/** The Web UI's Histogram: a bar per bin, optionally stacked. */
export function histogramOptions (input: HistogramInput): ApexOptions {
  const theme = themeOptions(input.theme)
  return {
    ...theme,
    chart: {
      ...theme.chart,
      ...localeOptions(input.locale),
      id: 'histogram',
      type: 'bar',
      height: CHART_HEIGHT,
      stacked: input.stacked,
      toolbar: { tools: { download: false } },
      zoom: { enabled: false },
    },
    plotOptions: { bar: { borderRadius: 4, horizontal: false, dataLabels: { position: 'top' } } },
    legend: { show: false },
    dataLabels: { enabled: true, offsetX: -6 },
    xaxis: { categories: input.data.categories },
    series: histogramSeries(input),
  }
}

/** The theme of a gauge; its track has the colour of Studio's borders. */
export function gaugeTheme (theme: ThemeTokens): ApexOptions {
  const track = withOpacity(theme.colors['on-surface'], 0.12)
  return { ...themeOptions(theme), plotOptions: { radialBar: { track: track ? { background: track } : {} } } }
}

/** The Web UI's Gauge: a radial bar per series with its latest value. */
export function gaugeOptions (item: LatestValue, theme: ThemeTokens, index: number): ApexOptions {
  const themed = gaugeTheme(theme)
  return {
    ...themed,
    chart: { ...themed.chart, id: `gauge-${index}`, type: 'radialBar', height: GAUGE_HEIGHT },
    plotOptions: {
      radialBar: {
        ...themed.plotOptions?.radialBar,
        startAngle: -140,
        endAngle: 140,
        hollow: { margin: 5, size: '45%', background: 'transparent' },
        dataLabels: { name: { show: false }, value: { show: false } },
      },
    },
    labels: [item.name],
    series: [item.value],
  }
}
