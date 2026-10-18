import type { ModelFormat } from './formats'
import type { IfcElementInfo } from './types'
import type { LoadResult, ModelViewer, ModelViewerErrorCode, ViewerTheme } from './viewer'
import type { Ref } from 'vue'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'

// The viewer's life in a Vue component, shared by Studio and its apps: each
// draws its own Vuetify controls around the container.

export type ModelViewerStatus = 'idle' | 'downloading' | 'processing' | 'ready' | 'error'

export interface ModelViewerProblem {
  code: ModelViewerErrorCode | 'download'
  message: string
  /** E.g. the missing files of a glTF. */
  details: string[]
}

export function useModelViewer (container: Ref<HTMLElement | null | undefined>, theme: () => ViewerTheme) {
  const status = ref<ModelViewerStatus>('idle')
  /** Progress of the current step from 0 to 1, or `null` while unknown. */
  const progress = ref<number | null>(null)
  const problem = ref<ModelViewerProblem | null>(null)
  const result = shallowRef<LoadResult | null>(null)
  /** The picked IFC element and its properties. */
  const selected = shallowRef<IfcElementInfo | null>(null)
  const selecting = ref(false)

  let viewer: ModelViewer | null = null
  let ready: Promise<ModelViewer> | null = null
  let selection = 0
  let requests = 0
  let unmounted = false

  async function create (): Promise<ModelViewer> {
    const { ModelViewer } = await import('./viewer')
    if (unmounted || !container.value) {
      throw new Error('The viewer is not mounted.')
    }
    viewer = new ModelViewer(container.value, { theme: theme(), onSelect })
    return viewer
  }

  async function onSelect (expressId: number | null): Promise<void> {
    const current = ++selection
    selected.value = null
    selecting.value = expressId !== null
    if (expressId === null || !viewer) {
      return
    }
    try {
      const info = await viewer.elementInfo(expressId)
      if (current === selection) {
        selected.value = info
      }
    } catch {
      // The element has no readable properties; it stays highlighted.
    } finally {
      if (current === selection) {
        selecting.value = false
      }
    }
  }

  /**
   * Downloads and shows a model; a later call replaces it. Only the latest
   * call changes the state: an earlier download that finishes later is
   * dropped before it is parsed.
   */
  async function load (download: () => Promise<Uint8Array>, format: ModelFormat): Promise<void> {
    const request = ++requests
    const latest = () => request === requests && !unmounted
    problem.value = null
    result.value = null
    status.value = 'downloading'
    progress.value = null
    let bytes: Uint8Array
    try {
      bytes = await download()
    } catch (error) {
      if (latest()) {
        status.value = 'error'
        problem.value = { code: 'download', message: error instanceof Error ? error.message : String(error), details: [] }
      }
      return
    }
    if (!latest()) {
      return
    }
    try {
      ready ??= create()
      const current = await ready
      if (!latest()) {
        return
      }
      status.value = 'processing'
      const loaded = await current.load(bytes, format, value => {
        if (latest()) {
          progress.value = value
        }
      })
      if (latest()) {
        result.value = loaded
        status.value = 'ready'
      }
    } catch (error) {
      const code = (error as { code?: ModelViewerErrorCode }).code
      if (code === 'cancelled' || !latest()) {
        return
      }
      status.value = 'error'
      problem.value = {
        code: code ?? 'parse',
        message: error instanceof Error ? error.message : String(error),
        details: (error as { details?: string[] }).details ?? [],
      }
    }
  }

  watch(theme, value => viewer?.setTheme(value), { deep: true })
  onBeforeUnmount(() => {
    unmounted = true
    viewer?.dispose()
    viewer = null
  })

  return {
    status,
    progress,
    problem,
    result,
    selected,
    selecting,
    load,
    resetView: () => viewer?.resetView(),
    clearSelection: () => viewer?.clearSelection(),
  }
}
