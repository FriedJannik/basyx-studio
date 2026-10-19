import type { TimeRangeSelection } from '../../apps/time-series/ui/src/timeRange'
import type { ChartSeries } from '../../apps/time-series/ui/src/timeseries'
import type { JsonObject, ThemeTokens, TimeSeriesResult } from '@basyx/studio-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  autoRefreshIntervalMs,
  RequestCounter,
  startAutoRefresh,
  validateAutoRefreshSelection,
} from '../../apps/time-series/ui/src/autoRefresh'
import {
  apexLocale,
  gaugeOptions,
  histogramOptions,
  seriesLabels,
  themeOptions,
  timeChartOptions,
  withOpacity,
} from '../../apps/time-series/ui/src/chartOptions'
import {
  findPreset,
  rangeFromResult,
  resolveTimeRange,
  toApexTimeRange,
  validateTimeRangeSelection,
} from '../../apps/time-series/ui/src/timeRange'
import {
  defaultSelection,
  findRecords,
  findSegments,
  formatValue,
  hasPoints,
  histogramData,
  latestValues,
  legendLabel,
  parseBins,
  prepareSeries,
  rangeAnchor,
  readParams,
  segmentKind,
  tooltipLabel,
} from '../../apps/time-series/ui/src/timeseries'

// The Time Series Data app (IDTA 02008 1.1): the logic ported from the BaSyx
// AAS Web UI's TimeSeries plugin tests, adjusted to Studio (validation codes
// instead of English sentences, a 5 s auto-refresh minimum, data read by
// Studio through `studio.timeseries.read`).

const INTERNAL = 'https://admin-shell.io/idta/TimeSeries/Segments/InternalSegment/1/1'
const LINKED = 'https://admin-shell.io/idta/TimeSeries/Segments/LinkedSegment/1/1'
const EXTERNAL = 'https://admin-shell.io/idta/TimeSeries/Segments/ExternalSegment/1/1'

const reference = (value: string) => ({ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value }] })
function smc (idShort: string, value: JsonObject[], semanticId?: string): JsonObject {
  return {
    idShort,
    modelType: 'SubmodelElementCollection',
    value,
    ...(semanticId ? { semanticId: reference(semanticId) } : {}),
  }
}
const prop = (idShort: string, extra: JsonObject = {}): JsonObject => ({ idShort, modelType: 'Property', valueType: 'xs:string', ...extra })

/** The Web UI's fixture (`timeseries-sample-data.ts`) as an AAS submodel. */
function createSubmodel (): JsonObject {
  return {
    modelType: 'Submodel',
    idShort: 'TimeSeries',
    id: 'urn:example:timeseries',
    semanticId: reference('https://admin-shell.io/idta/TimeSeries/1/1'),
    submodelElements: [
      smc('Metadata', [
        prop('Name', { value: 'Air quality' }),
        smc('Record', [
          prop('Time'),
          prop('AirQuality', { displayName: [{ language: 'en', text: 'Air quality' }, { language: 'de', text: 'Luftqualität' }] }),
          prop('rpm'),
        ]),
      ]),
      smc('segments', [
        smc('InternalSegment', [smc('Records', [])], INTERNAL),
        smc('LinkedSegment', [prop('Endpoint'), prop('Query')], LINKED),
        smc('ExternalSegment', [{ idShort: 'Data', modelType: 'File', value: '/attachment.csv' }], EXTERNAL),
        smc('Notes', []),
      ]),
    ],
  }
}

const theme: ThemeTokens = {
  dark: true,
  colors: { 'primary': '#1E88E5', 'secondary': '#26A69A', 'error': '#E53935', 'surface': '#212121', 'on-surface': '#EEEEEE' },
}

describe('time ranges (Web UI timeRange.test.ts)', () => {
  const stop = new Date('2026-05-13T19:16:00.000Z')

  it.each([
    ['milliseconds', 500, 500],
    ['seconds', 2, 2000],
    ['minutes', 3, 180_000],
    ['hours', 4, 14_400_000],
    ['days', 2, 172_800_000],
    ['weeks', 2, 1_209_600_000],
  ] as const)('resolves %s relative ranges', (unit, value, durationMs) => {
    const range = resolveTimeRange({ mode: 'relative', value, unit }, stop)

    expect(range.stop).toBe(stop.toISOString())
    expect(range.durationMs).toBe(durationMs)
  })

  it('subtracts months using calendar boundaries', () => {
    const range = resolveTimeRange({ mode: 'relative', value: 1, unit: 'months' }, new Date(2024, 2, 31, 12))
    const start = new Date(range.start)

    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2024, 1, 29])
  })

  it('subtracts years using calendar boundaries', () => {
    const range = resolveTimeRange({ mode: 'relative', value: 1, unit: 'years' }, new Date(2024, 1, 29, 12))
    const start = new Date(range.start)

    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2023, 1, 28])
  })

  it('interprets absolute datetime inputs in the local timezone and serializes UTC', () => {
    const selection: TimeRangeSelection = { mode: 'absolute', start: '2026-05-13T18:00', stop: '2026-05-13T20:00' }

    const range = resolveTimeRange(selection)

    expect(range.start).toBe(new Date(selection.start).toISOString())
    expect(range.stop).toBe(new Date(selection.stop).toISOString())
    expect(range.durationMs).toBe(7_200_000)
  })

  it.each([
    [{ mode: 'relative', value: 0, unit: 'minutes' }, 'rangePositive'],
    [{ mode: 'relative', value: 1.5, unit: 'months' }, 'rangeWhole'],
    [{ mode: 'relative', value: 1, unit: 'fortnights' }, 'rangeUnit'],
    [{ mode: 'relative', value: Number.MAX_VALUE, unit: 'milliseconds' }, 'rangeSupported'],
    [{ mode: 'absolute', start: '', stop: '' }, 'rangeBothDates'],
    [{ mode: 'absolute', start: '2026-02-30T12:00', stop: '2026-03-01T12:00' }, 'rangeValidDates'],
    [{ mode: 'absolute', start: '2026-05-14T00:00', stop: '2026-05-13T00:00' }, 'rangeOrder'],
    [{ mode: 'unexpected', start: '2026-05-13T00:00', stop: '2026-05-14T00:00' }, 'rangeMode'],
    [null, 'rangeInvalid'],
  ] as const)('validates invalid selection %#', (selection, code) => {
    expect(validateTimeRangeSelection(selection)).toBe(code)
    expect(() => resolveTimeRange(selection as unknown as TimeRangeSelection, stop)).toThrow(code)
  })

  it('rejects local date-times that do not exist during a DST transition', () => {
    const originalTimezone = process.env.TZ
    process.env.TZ = 'Europe/Berlin'
    try {
      const selection: TimeRangeSelection = { mode: 'absolute', start: '2026-03-29T02:30', stop: '2026-03-29T04:00' }

      expect(validateTimeRangeSelection(selection)).toBe('rangeValidDates')
      expect(() => resolveTimeRange(selection)).toThrow('rangeValidDates')
    } finally {
      if (originalTimezone === undefined) {
        delete process.env.TZ
      } else {
        process.env.TZ = originalTimezone
      }
    }
  })

  it('converts relative and absolute ranges to ApexCharts options', () => {
    const relative = resolveTimeRange({ mode: 'relative', value: 5, unit: 'minutes' }, stop)
    const absolute = resolveTimeRange({ mode: 'absolute', start: '2026-05-13T18:00:00.000Z', stop: '2026-05-13T19:00:00.000Z' })

    expect(toApexTimeRange(relative)).toEqual({ range: undefined, min: relative.startMs, max: relative.stopMs })
    expect(toApexTimeRange(absolute)).toEqual({ range: undefined, min: absolute.startMs, max: absolute.stopMs })
    expect(toApexTimeRange(null)).toEqual({ range: 60_000 })
  })

  it('finds the preset of a selection', () => {
    expect(findPreset({ mode: 'relative', value: 15, unit: 'minutes' })).toBe('15m')
    expect(findPreset({ mode: 'relative', value: 1, unit: 'years' })).toBe('1y')
    expect(findPreset({ mode: 'relative', value: 2, unit: 'minutes' })).toBe('custom')
    expect(findPreset({ mode: 'absolute', start: '', stop: '' })).toBe('custom')
  })

  it('takes the range Studio answered with', () => {
    expect(rangeFromResult({ start: '2026-05-13T19:15:00.000Z', stop: '2026-05-13T19:16:00.000Z' }, 'relative')).toEqual({
      mode: 'relative',
      start: '2026-05-13T19:15:00.000Z',
      stop: '2026-05-13T19:16:00.000Z',
      startMs: Date.parse('2026-05-13T19:15:00.000Z'),
      stopMs: Date.parse('2026-05-13T19:16:00.000Z'),
      durationMs: 60_000,
    })
    expect(rangeFromResult({ start: 'x', stop: '2026-05-13T19:16:00.000Z' }, 'absolute')).toBeNull()
  })
})

describe('auto refresh (Web UI autoRefresh.test.ts)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('converts supported intervals to milliseconds', () => {
    expect(autoRefreshIntervalMs({ enabled: true, value: 5, unit: 'seconds' })).toBe(5000)
    expect(autoRefreshIntervalMs({ enabled: true, value: 2, unit: 'minutes' })).toBe(120_000)
    expect(autoRefreshIntervalMs({ enabled: true, value: 1, unit: 'hours' })).toBe(3_600_000)
  })

  it('allows a disabled default without scheduling it', () => {
    expect(validateAutoRefreshSelection({ enabled: false, value: 30, unit: 'seconds' })).toBeNull()
  })

  it.each([
    [undefined, 'refreshInvalid'],
    [{ enabled: true, value: 0, unit: 'seconds' }, 'refreshPositive'],
    [{ enabled: true, value: -1, unit: 'minutes' }, 'refreshPositive'],
    [{ enabled: true, value: 500, unit: 'milliseconds' }, 'refreshInvalid'],
    [{ enabled: true, value: Number.POSITIVE_INFINITY, unit: 'hours' }, 'refreshPositive'],
  ])('rejects invalid interval %#', (selection, code) => {
    expect(validateAutoRefreshSelection(selection)).toBe(code)
  })

  it('refuses intervals below Studio\'s 5 second minimum', () => {
    expect(validateAutoRefreshSelection({ enabled: true, value: 1, unit: 'seconds' })).toBe('refreshRange')
    expect(validateAutoRefreshSelection({ enabled: true, value: 4.9, unit: 'seconds' })).toBe('refreshRange')
    expect(validateAutoRefreshSelection({ enabled: true, value: 5, unit: 'seconds' })).toBeNull()
    expect(() => autoRefreshIntervalMs({ enabled: true, value: 1, unit: 'seconds' })).toThrow(RangeError)
  })

  it('rejects intervals outside the JavaScript timer limit', () => {
    const selection = { enabled: true, value: 600, unit: 'hours' } as const
    expect(validateAutoRefreshSelection(selection)).toBe('refreshRange')
    expect(() => autoRefreshIntervalMs(selection)).toThrow(RangeError)
  })

  function visibility (initial: DocumentVisibilityState = 'visible') {
    const listeners = new Set<() => void>()
    const source = {
      visibilityState: initial,
      addEventListener: (_type: 'visibilitychange', listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: 'visibilitychange', listener: () => void) => listeners.delete(listener),
      set (state: DocumentVisibilityState) {
        source.visibilityState = state
        for (const listener of listeners) {
          listener()
        }
      },
      listeners,
    }
    return source
  }

  it('ticks every interval and stops when stopped', () => {
    vi.useFakeTimers()
    const tick = vi.fn()
    const source = visibility()
    const stop = startAutoRefresh({ intervalMs: 5000, tick, isBusy: () => false, visibility: source })

    vi.advanceTimersByTime(15_000)
    expect(tick).toHaveBeenCalledTimes(3)

    stop()
    vi.advanceTimersByTime(15_000)
    expect(tick).toHaveBeenCalledTimes(3)
    expect(source.listeners.size).toBe(0)
  })

  it('skips ticks while a fetch is running', () => {
    vi.useFakeTimers()
    const tick = vi.fn()
    let busy = false
    const stop = startAutoRefresh({ intervalMs: 5000, tick, isBusy: () => busy, visibility: visibility() })

    vi.advanceTimersByTime(5000)
    expect(tick).toHaveBeenCalledTimes(1)
    busy = true
    vi.advanceTimersByTime(15_000)
    expect(tick).toHaveBeenCalledTimes(1)
    busy = false
    vi.advanceTimersByTime(5000)
    expect(tick).toHaveBeenCalledTimes(2)
    stop()
  })

  it('pauses while the frame is hidden and refreshes when it is shown again', () => {
    vi.useFakeTimers()
    const tick = vi.fn()
    const source = visibility()
    const stop = startAutoRefresh({ intervalMs: 5000, tick, isBusy: () => false, visibility: source })

    source.set('hidden')
    vi.advanceTimersByTime(60_000)
    expect(tick).not.toHaveBeenCalled()

    source.set('visible')
    expect(tick).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(tick).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does not start while the frame is hidden', () => {
    vi.useFakeTimers()
    const tick = vi.fn()
    const source = visibility('hidden')
    const stop = startAutoRefresh({ intervalMs: 5000, tick, isBusy: () => false, visibility: source })

    vi.advanceTimersByTime(20_000)
    expect(tick).not.toHaveBeenCalled()
    source.set('visible')
    vi.advanceTimersByTime(5000)
    expect(tick).toHaveBeenCalledTimes(2)
    stop()
  })

  it('drops stale answers with the request counter', () => {
    const requests = new RequestCounter()
    const first = requests.begin()
    const second = requests.begin()

    expect(requests.isCurrent(first)).toBe(false)
    expect(requests.isCurrent(second)).toBe(true)

    requests.invalidate()
    expect(requests.isCurrent(second)).toBe(false)
  })
})

describe('segments and records', () => {
  const submodel = createSubmodel()

  it('detects the segment kind from semantic IDs', () => {
    expect(segmentKind({ semanticId: { keys: [{ value: INTERNAL }] } })).toBe('InternalSegment')
    expect(segmentKind({ semanticId: { keys: [{ value: LINKED }] } })).toBe('LinkedSegment')
    expect(segmentKind({ semanticId: { keys: [{ value: EXTERNAL }] } })).toBe('ExternalSegment')
    expect(segmentKind({ semanticId: { keys: [{ value: 'urn:other' }] } })).toBeNull()
    expect(segmentKind({})).toBeNull()
  })

  it('lists the segments of `Segments` (idShort ignoring case) that have a segment semantic ID', () => {
    expect(findSegments(submodel).map(segment => [segment.idShort, segment.kind])).toEqual([
      ['InternalSegment', 'InternalSegment'],
      ['LinkedSegment', 'LinkedSegment'],
      ['ExternalSegment', 'ExternalSegment'],
    ])
  })

  it('lists the records of `Metadata.Record`', () => {
    expect(findRecords(submodel).map(record => record.idShort)).toEqual(['Time', 'AirQuality', 'rpm'])
  })

  it('finds nothing in a submodel without segments or records', () => {
    expect(findSegments({ modelType: 'Submodel', submodelElements: [] })).toEqual([])
    expect(findRecords(null)).toEqual([])
  })

  it('preselects the first segment and a record named `time`', () => {
    expect(defaultSelection(findSegments(submodel), findRecords(submodel))).toEqual({ segment: 'InternalSegment', time: 'Time' })
    expect(defaultSelection([], findRecords(submodel)).segment).toBeNull()
    const noTime = findRecords(submodel).filter(record => record.idShort !== 'Time')
    expect(defaultSelection(findSegments(submodel), noTime).time).toBeNull()
  })
})

describe('reading through studio.timeseries.read', () => {
  const segments = findSegments(createSubmodel())
  const internal = segments.find(segment => segment.kind === 'InternalSegment')!
  const linked = segments.find(segment => segment.kind === 'LinkedSegment')!
  const external = segments.find(segment => segment.kind === 'ExternalSegment')!
  const relative: TimeRangeSelection = { mode: 'relative', value: 1, unit: 'minutes' }
  const absolute: TimeRangeSelection = { mode: 'absolute', start: '2026-05-13T18:00:00.000Z', stop: '2026-05-13T19:00:00.000Z' }

  it('anchors relative ranges of Internal and External segments at the latest point', () => {
    expect(rangeAnchor(internal.kind, relative)).toBe('latest')
    expect(rangeAnchor(external.kind, relative)).toBe('latest')
    expect(rangeAnchor(linked.kind, relative)).toBe('fixed')
    expect(rangeAnchor(internal.kind, absolute)).toBe('fixed')
    expect(rangeAnchor(external.kind, absolute)).toBe('fixed')
  })

  it('names the segment, records and the resolved range', () => {
    const now = new Date('2026-05-13T19:16:00.000Z')
    expect(readParams({ submodelId: 'urn:sm', segment: linked, time: 'Time', values: ['AirQuality', 'rpm'], selection: relative, now })).toEqual({
      submodelId: 'urn:sm',
      segment: 'LinkedSegment',
      time: 'Time',
      values: ['AirQuality', 'rpm'],
      range: { start: '2026-05-13T19:15:00.000Z', stop: '2026-05-13T19:16:00.000Z', anchor: 'fixed' },
    })
    expect(readParams({ submodelId: 'urn:sm', segment: internal, time: 'Time', values: ['rpm'], selection: relative, now, maxPoints: 100 })).toMatchObject({
      range: { anchor: 'latest' },
      maxPoints: 100,
    })
  })

  it('refuses an invalid range with its validation code', () => {
    expect(() => readParams({
      submodelId: 'urn:sm',
      segment: internal,
      time: 'Time',
      values: ['rpm'],
      selection: { mode: 'absolute', start: '', stop: '' },
      now: new Date(),
    })).toThrow('rangeBothDates')
  })
})

describe('series for the charts (Web UI ChartHandling)', () => {
  const records = findRecords(createSubmodel())
  const result: TimeSeriesResult = {
    kind: 'internal',
    range: { start: '2026-05-13T19:15:00.000Z', stop: '2026-05-13T19:16:00.000Z' },
    series: [
      { key: 'AirQuality', unit: 'ppm', points: [[1000, 398.98], [2000, 264.02]] },
      { key: 'rpm', unit: null, points: [] },
    ],
    warnings: [],
  }

  it('names series by display name in the locale, else by idShort, with their units', () => {
    expect(prepareSeries(result, records, 'de')).toEqual([
      { key: 'AirQuality', name: 'Luftqualität', unit: 'ppm', points: [[1000, 398.98], [2000, 264.02]] },
      { key: 'rpm', name: 'rpm', unit: '', points: [] },
    ])
    expect(prepareSeries(result, records, 'fr')[0]!.name).toBe('Air quality')
    expect(prepareSeries(null, records, 'en')).toEqual([])
  })

  it('knows whether any series has points', () => {
    expect(hasPoints(prepareSeries(result, records, 'en'))).toBe(true)
    expect(hasPoints(prepareSeries({ ...result, series: [{ key: 'rpm', unit: null, points: [] }] }, records, 'en'))).toBe(false)
  })

  it('labels legends `name [unit]` and tooltips `value unit`', () => {
    expect(legendLabel('Temperature', '°C')).toBe('Temperature [°C]')
    expect(legendLabel('rpm', '')).toBe('rpm')
    expect(tooltipLabel(21.5, '°C')).toBe('21.50 °C')
    expect(tooltipLabel(3, '')).toBe('3.00')
    expect(formatValue('n/a')).toBe('n/a')

    const series = prepareSeries(result, records, 'en')
    const labels = seriesLabels(series)
    const formatter = labels.legend!.formatter!
    expect(formatter('Air quality', { seriesIndex: 0 } as never)).toBe('Air quality [ppm]')
    expect(formatter('rpm', { seriesIndex: 1 } as never)).toBe('rpm')
    const tooltips = labels.tooltip!.y as Array<{ formatter: (value: number) => string }>
    expect(tooltips.map(entry => entry.formatter(1))).toEqual(['1.00 ppm', '1.00'])
  })

  it('takes the latest value of each series for gauges and display fields', () => {
    expect(latestValues(prepareSeries(result, records, 'en'))).toEqual([{ key: 'AirQuality', name: 'Air quality', unit: 'ppm', value: 264.02 }])
  })
})

describe('histogram binning (Web UI prepareHistogramData)', () => {
  const series = (key: string, values: number[]): ChartSeries => ({ key, name: key, unit: '', points: values.map((value, index) => [index, value]) })

  it('bins all series between the overall minimum and maximum', () => {
    const data = histogramData([series('a', [0, 1, 2, 3, 4, 10]), series('b', [5, 10])], 5)

    expect(data.categories).toEqual(['0.00 - 2.00', '2.00 - 4.00', '4.00 - 6.00', '6.00 - 8.00', '8.00 - 10.00'])
    expect(data.histograms).toEqual([
      [2, 2, 1, 0, 1],
      [0, 0, 1, 0, 1],
    ])
  })

  it('puts equal values into the first bin and handles empty data', () => {
    expect(histogramData([series('a', [3, 3, 3])], 4).histograms).toEqual([[3, 0, 0, 0]])
    expect(histogramData([series('a', [])], 4)).toEqual({ histograms: [], categories: [] })
    expect(histogramData([series('a', [1, 2])], 0)).toEqual({ histograms: [], categories: [] })
  })

  it('accepts whole bin counts from 1 to 200', () => {
    expect(parseBins('20')).toBe(20)
    expect(parseBins(1)).toBe(1)
    expect(parseBins('0')).toBeNull()
    expect(parseBins('2.5')).toBeNull()
    expect(parseBins('201')).toBeNull()
    expect(parseBins('')).toBeNull()
  })
})

describe('chart options', () => {
  const records = findRecords(createSubmodel())
  const series = prepareSeries({
    kind: 'linked',
    range: { start: '2026-05-13T19:15:00.000Z', stop: '2026-05-13T19:16:00.000Z' },
    series: [{ key: 'AirQuality', unit: 'ppm', points: [[1000, 1], [2000, 2]] }],
    warnings: [],
  }, records, 'en')
  const range = rangeFromResult({ start: '2026-05-13T19:15:00.000Z', stop: '2026-05-13T19:16:00.000Z' }, 'relative')

  it('follows Studio\'s theme', () => {
    expect(themeOptions(theme)).toEqual({
      chart: { background: 'transparent', parentHeightOffset: 0, foreColor: '#EEEEEE' },
      colors: ['#1E88E5', '#26A69A', '#E53935'],
      grid: { borderColor: 'rgba(238, 238, 238, 0.12)' },
      theme: { mode: 'dark' },
    })
    expect(withOpacity('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(withOpacity('rgb(1, 2, 3)', 0.5)).toBeUndefined()
    expect(themeOptions({ dark: false, colors: {} })).toEqual({ chart: { background: 'transparent', parentHeightOffset: 0 }, theme: { mode: 'light' } })
  })

  it('maps Studio\'s locales to ApexCharts locales', () => {
    expect(apexLocale('de')).toBe('de')
    expect(apexLocale('de-saar')).toBe('de')
    expect(apexLocale('zh-Hans')).toBe('zh-cn')
    expect(apexLocale('pt')).toBe('en')
  })

  it('builds the Web UI line chart with the selected range and interpolation', () => {
    const options = timeChartOptions({ type: 'line', series, range, theme, locale: 'ja', curve: 'stepline', events: {} })

    expect(options.chart).toMatchObject({ type: 'line', height: 350, background: 'transparent', defaultLocale: 'ja', zoom: { type: 'x', allowMouseWheelZoom: false } })
    expect(options.chart!.toolbar!.tools!.download).toBe(false)
    expect(options.xaxis).toMatchObject({ type: 'datetime', min: range!.startMs, max: range!.stopMs })
    expect(options.stroke).toEqual({ curve: 'stepline', width: 3 })
    expect(options.series).toEqual([{ name: 'Air quality', data: [[1000, 1], [2000, 2]] }])
    expect(options.theme).toEqual({ mode: 'dark' })
  })

  it('draws scatter charts with markers on the theme surface', () => {
    const options = timeChartOptions({ type: 'scatter', series, range, theme, locale: 'en', curve: 'smooth', events: {} })

    expect(options.markers).toEqual({ size: 4, strokeColors: '#212121' })
    expect(options.stroke).toBeUndefined()
  })

  it('builds histogram and gauge options', () => {
    const data = histogramData(series, 2)
    const histogram = histogramOptions({ data, series, stacked: true, theme, locale: 'en' })
    expect(histogram.chart).toMatchObject({ type: 'bar', stacked: true, height: 350 })
    expect(histogram.xaxis).toEqual({ categories: ['1.00 - 1.50', '1.50 - 2.00'] })
    expect(histogram.series).toEqual([{ name: 'Air quality', data: [1, 1] }])

    const gauge = gaugeOptions(latestValues(series)[0]!, theme, 0)
    expect(gauge.chart).toMatchObject({ id: 'gauge-0', type: 'radialBar', height: 280 })
    expect(gauge.series).toEqual([2])
    expect(gauge.labels).toEqual(['Air quality'])
  })
})
