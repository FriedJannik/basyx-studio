// Time ranges of the Time Series Data view, ported from the BaSyx AAS Web UI
// (`TimeSeries/timeRange.ts`): Grafana-style relative ranges and absolute
// `datetime-local` ranges. Validation returns a code that the view
// translates (`validation.<code>`) instead of an English sentence. The Flux
// interpolation and the filtering by range moved to Studio, which reads the
// data (`studio.timeseries.read`).

export type RelativeTimeUnit
  = | 'milliseconds'
    | 'seconds'
    | 'minutes'
    | 'hours'
    | 'days'
    | 'weeks'
    | 'months'
    | 'years'

export type TimeRangeSelection
  = | {
    mode: 'relative'
    value: number
    unit: RelativeTimeUnit
  }
  | {
    mode: 'absolute'
    start: string
    stop: string
  }

export interface ResolvedTimeRange {
  mode: TimeRangeSelection['mode']
  start: string
  stop: string
  startMs: number
  stopMs: number
  durationMs: number
}

/** Why a selection is not a valid range; the view shows `validation.<code>`. */
export type TimeRangeError
  = | 'rangeInvalid'
    | 'rangeMode'
    | 'rangePositive'
    | 'rangeUnit'
    | 'rangeWhole'
    | 'rangeSupported'
    | 'rangeBothDates'
    | 'rangeValidDates'
    | 'rangeOrder'

export const DEFAULT_TIME_RANGE: TimeRangeSelection = {
  mode: 'relative',
  value: 1,
  unit: 'minutes',
}

const MILLISECONDS_PER_UNIT: Partial<Record<RelativeTimeUnit, number>> = {
  milliseconds: 1,
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
}

export const RELATIVE_TIME_UNITS: RelativeTimeUnit[] = [
  'milliseconds',
  'seconds',
  'minutes',
  'hours',
  'days',
  'weeks',
  'months',
  'years',
]

/** Short unit labels of the time-range button (`Last 15m`). */
export const RELATIVE_UNIT_SHORT: Record<RelativeTimeUnit, string> = {
  milliseconds: 'ms',
  seconds: 's',
  minutes: 'm',
  hours: 'h',
  days: 'd',
  weeks: 'w',
  months: 'mo',
  years: 'y',
}

export interface TimeRangePreset {
  id: string
  value?: number
  unit?: RelativeTimeUnit
}

/** The Web UI's presets; `custom` opens the range and unit inputs. */
export const TIME_RANGE_PRESETS: TimeRangePreset[] = [
  { id: '1m', value: 1, unit: 'minutes' },
  { id: '5m', value: 5, unit: 'minutes' },
  { id: '15m', value: 15, unit: 'minutes' },
  { id: '1h', value: 1, unit: 'hours' },
  { id: '6h', value: 6, unit: 'hours' },
  { id: '12h', value: 12, unit: 'hours' },
  { id: '24h', value: 24, unit: 'hours' },
  { id: '7d', value: 7, unit: 'days' },
  { id: '30d', value: 30, unit: 'days' },
  { id: '1y', value: 1, unit: 'years' },
  { id: 'custom' },
]

const LOCAL_DATE_TIME_PATTERN
  = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
const RFC_3339_PATTERN
  = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export function cloneTimeRangeSelection (selection: TimeRangeSelection): TimeRangeSelection {
  return { ...selection }
}

/** The preset a selection matches, `custom` otherwise. */
export function findPreset (selection: TimeRangeSelection): string {
  if (selection.mode === 'absolute') {
    return 'custom'
  }
  return TIME_RANGE_PRESETS.find(preset => preset.value === selection.value && preset.unit === selection.unit)?.id ?? 'custom'
}

export function validateTimeRangeSelection (selection: unknown): TimeRangeError | null {
  if (!selection || typeof selection !== 'object') {
    return 'rangeInvalid'
  }

  const candidate = selection as Record<string, unknown>
  if (candidate.mode !== 'relative' && candidate.mode !== 'absolute') {
    return 'rangeMode'
  }

  if (candidate.mode === 'relative') {
    if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value) || candidate.value <= 0) {
      return 'rangePositive'
    }

    if (typeof candidate.unit !== 'string' || !RELATIVE_TIME_UNITS.includes(candidate.unit as RelativeTimeUnit)) {
      return 'rangeUnit'
    }

    if ((candidate.unit === 'months' || candidate.unit === 'years') && !Number.isInteger(candidate.value)) {
      return 'rangeWhole'
    }

    const stop = new Date()
    const start = subtractRelativeTime(stop, candidate.value, candidate.unit as RelativeTimeUnit)
    if (!isFiniteOrderedRange(start, stop)) {
      return 'rangeSupported'
    }

    return null
  }

  if (typeof candidate.start !== 'string' || typeof candidate.stop !== 'string' || !candidate.start || !candidate.stop) {
    return 'rangeBothDates'
  }

  const startDate = parseAbsoluteDate(candidate.start)
  const stopDate = parseAbsoluteDate(candidate.stop)
  if (!startDate || !stopDate) {
    return 'rangeValidDates'
  }

  if (startDate.getTime() >= stopDate.getTime()) {
    return 'rangeOrder'
  }

  return null
}

/** The range of a selection; relative ranges end at `relativeStop`. Throws a `RangeError` whose message is the error code. */
export function resolveTimeRange (
  selection: TimeRangeSelection,
  relativeStop: Date = new Date(),
): ResolvedTimeRange {
  const validationError = validateTimeRangeSelection(selection)
  if (validationError) {
    throw new RangeError(validationError)
  }

  let startDate: Date
  let stopDate: Date

  if (selection.mode === 'absolute') {
    startDate = parseAbsoluteDate(selection.start)!
    stopDate = parseAbsoluteDate(selection.stop)!
  } else {
    stopDate = new Date(relativeStop)
    startDate = subtractRelativeTime(stopDate, selection.value, selection.unit)
  }

  const startMs = startDate.getTime()
  const stopMs = stopDate.getTime()
  const durationMs = stopMs - startMs

  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError('rangeSupported' satisfies TimeRangeError)
  }

  return {
    mode: selection.mode,
    start: startDate.toISOString(),
    stop: stopDate.toISOString(),
    startMs,
    stopMs,
    durationMs,
  }
}

/** The range Studio answered with (after `anchor`), in the shape of a resolved range. */
export function rangeFromResult (range: { start: string, stop: string }, mode: TimeRangeSelection['mode']): ResolvedTimeRange | null {
  const startMs = Date.parse(range.start)
  const stopMs = Date.parse(range.stop)
  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) {
    return null
  }
  return {
    mode,
    start: new Date(startMs).toISOString(),
    stop: new Date(stopMs).toISOString(),
    startMs,
    stopMs,
    durationMs: stopMs - startMs,
  }
}

export function toApexTimeRange (range: ResolvedTimeRange | null): {
  range?: number
  min?: number
  max?: number
} {
  if (!range) {
    return { range: 60_000 }
  }

  return {
    range: undefined,
    min: range.startMs,
    max: range.stopMs,
  }
}

function parseAbsoluteDate (value: string): Date | null {
  const localMatch = LOCAL_DATE_TIME_PATTERN.exec(value)
  if (localMatch) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', fractionText = '0'] = localMatch
    const year = Number(yearText)
    const month = Number(monthText) - 1
    const day = Number(dayText)
    const hour = Number(hourText)
    const minute = Number(minuteText)
    const second = Number(secondText)
    const millisecond = Number(fractionText.padEnd(3, '0'))
    const date = new Date(year, month, day, hour, minute, second, millisecond)

    if (
      date.getFullYear() !== year
      || date.getMonth() !== month
      || date.getDate() !== day
      || date.getHours() !== hour
      || date.getMinutes() !== minute
      || date.getSeconds() !== second
      || date.getMilliseconds() !== millisecond
    ) {
      return null
    }

    return date
  }

  const rfcMatch = RFC_3339_PATTERN.exec(value)
  if (!rfcMatch) {
    return null
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = rfcMatch
  if (!isValidDateTimeComponents(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondText),
  )) {
    return null
  }

  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function isValidDateTimeComponents (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  return month >= 0
    && month <= 11
    && day >= 1
    && day <= daysInMonth(year, month)
    && hour >= 0
    && hour <= 23
    && minute >= 0
    && minute <= 59
    && second >= 0
    && second <= 59
}

function isFiniteOrderedRange (start: Date, stop: Date): boolean {
  const startMs = start.getTime()
  const stopMs = stop.getTime()
  return Number.isFinite(startMs) && Number.isFinite(stopMs) && startMs < stopMs
}

function subtractRelativeTime (stop: Date, value: number, unit: RelativeTimeUnit): Date {
  const start = new Date(stop)

  if (unit === 'months') {
    const originalDay = start.getDate()
    start.setDate(1)
    start.setMonth(start.getMonth() - value)
    start.setDate(Math.min(originalDay, daysInMonth(start.getFullYear(), start.getMonth())))
    return start
  }

  if (unit === 'years') {
    const originalMonth = start.getMonth()
    const originalDay = start.getDate()
    start.setDate(1)
    start.setFullYear(start.getFullYear() - value)
    start.setMonth(originalMonth)
    start.setDate(Math.min(originalDay, daysInMonth(start.getFullYear(), originalMonth)))
    return start
  }

  const unitMilliseconds = MILLISECONDS_PER_UNIT[unit]
  if (!unitMilliseconds) {
    throw new RangeError('rangeUnit' satisfies TimeRangeError)
  }

  return new Date(stop.getTime() - value * unitMilliseconds)
}

function daysInMonth (year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}
