// Auto refresh of the Time Series Data view, ported from the BaSyx AAS Web
// UI (`TimeSeries/autoRefresh.ts`) with Studio's adjustments (time series
// plan U5): at least every 5 seconds, paused while the frame is hidden, and
// stale responses dropped with the Web UI's request counter.

export type AutoRefreshUnit = 'seconds' | 'minutes' | 'hours'

export interface AutoRefreshSelection {
  enabled: boolean
  value: number
  unit: AutoRefreshUnit
}

/** Why an interval is not valid; the view shows `validation.<code>`. */
export type AutoRefreshError = 'refreshInvalid' | 'refreshPositive' | 'refreshRange'

export const DEFAULT_AUTO_REFRESH: AutoRefreshSelection = {
  enabled: false,
  value: 30,
  unit: 'seconds',
}

export const AUTO_REFRESH_UNITS: AutoRefreshUnit[] = ['seconds', 'minutes', 'hours']

/** Short unit labels of the auto-refresh button (`30s`). */
export const AUTO_REFRESH_UNIT_SHORT: Record<AutoRefreshUnit, string> = {
  seconds: 's',
  minutes: 'm',
  hours: 'h',
}

const MILLISECONDS_PER_UNIT: Record<AutoRefreshUnit, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
}

/** Studio refreshes at most every 5 seconds (the Web UI allowed 1 second). */
export const MIN_AUTO_REFRESH_MS = 5000

const MAX_TIMER_INTERVAL_MS = 2_147_483_647

export function cloneAutoRefreshSelection (selection: AutoRefreshSelection): AutoRefreshSelection {
  return { ...selection }
}

export function validateAutoRefreshSelection (selection: unknown): AutoRefreshError | null {
  if (!isAutoRefreshSelection(selection)) {
    return 'refreshInvalid'
  }

  if (!selection.enabled) {
    return null
  }

  if (!Number.isFinite(selection.value) || selection.value <= 0) {
    return 'refreshPositive'
  }

  const intervalMs = selection.value * MILLISECONDS_PER_UNIT[selection.unit]
  if (!Number.isFinite(intervalMs) || intervalMs < MIN_AUTO_REFRESH_MS || intervalMs > MAX_TIMER_INTERVAL_MS) {
    return 'refreshRange'
  }

  return null
}

export function autoRefreshIntervalMs (selection: AutoRefreshSelection): number {
  const validationError = validateAutoRefreshSelection(selection)
  if (validationError) {
    throw new RangeError(validationError)
  }

  return selection.value * MILLISECONDS_PER_UNIT[selection.unit]
}

export function isAutoRefreshSelection (selection: unknown): selection is AutoRefreshSelection {
  if (!selection || typeof selection !== 'object') {
    return false
  }

  const candidate = selection as Partial<AutoRefreshSelection>
  return typeof candidate.enabled === 'boolean'
    && typeof candidate.value === 'number'
    && AUTO_REFRESH_UNITS.includes(candidate.unit as AutoRefreshUnit)
}

/** What the scheduler needs of `document`. */
export interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState
  addEventListener: (type: 'visibilitychange', listener: () => void) => void
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void
}

export interface AutoRefreshOptions {
  intervalMs: number
  /** Fetches the data again. */
  tick: () => void
  /** True while a fetch runs: the tick is skipped, as in the Web UI. */
  isBusy: () => boolean
  visibility: VisibilitySource
}

/**
 * Calls `tick` every `intervalMs` (Web UI's `setInterval` model). While the
 * frame is hidden the timer stops; when it is shown again, the data is
 * fetched at once and the timer restarts. Returns the function that stops it.
 */
export function startAutoRefresh (options: AutoRefreshOptions): () => void {
  let timer: ReturnType<typeof setInterval> | null = null

  const run = () => {
    if (!options.isBusy()) {
      options.tick()
    }
  }
  const start = () => {
    timer ??= setInterval(run, options.intervalMs)
  }
  const pause = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
  const onVisibility = () => {
    if (options.visibility.visibilityState === 'hidden') {
      pause()
    } else if (!timer) {
      run()
      start()
    }
  }

  if (options.visibility.visibilityState !== 'hidden') {
    start()
  }
  options.visibility.addEventListener('visibilitychange', onVisibility)

  return () => {
    pause()
    options.visibility.removeEventListener('visibilitychange', onVisibility)
  }
}

/** The Web UI's request counter: only the latest request may change the view. */
export class RequestCounter {
  private active = 0

  /** Starts a request and returns its id. */
  begin (): number {
    this.active += 1
    return this.active
  }

  /** Makes every pending request stale. */
  invalidate (): void {
    this.active += 1
  }

  isCurrent (id: number): boolean {
    return id === this.active
  }
}
