import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useModelViewer } from '../../packages/model-viewer/src/vue'

// The viewer's life in Vue components: only the latest load changes what
// is shown (packages/model-viewer/src/vue.ts). The renderer is mocked.

vi.mock('../../packages/model-viewer/src/viewer', () => ({
  ModelViewer: class {
    async load (bytes: Uint8Array, format: string) {
      return { format, triangles: bytes.length, missingImages: [], pickable: false }
    }

    setTheme () {}
    dispose () {}
  },
}))

/** A download the test finishes when it wants to. */
function pending (size: number) {
  let finish!: () => void
  const promise = new Promise<Uint8Array>(resolve => (finish = () => resolve(new Uint8Array(size))))
  return { download: () => promise, finish }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const theme = () => ({ background: '#000', model: '#888', highlight: '#00f' })

afterEach(() => vi.restoreAllMocks())

describe('useModelViewer', () => {
  it('drops a download that finishes after a later one', async () => {
    // Outside a component, Vue warns about the lifecycle hook.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const viewer = useModelViewer(ref({} as HTMLElement), theme)
    const first = pending(1)
    const second = pending(2)

    const loads = [viewer.load(first.download, 'stl'), viewer.load(second.download, 'obj')]
    second.finish()
    await flush()
    expect(viewer.result.value?.triangles).toBe(2)

    first.finish()
    await Promise.all(loads)
    expect(viewer.status.value).toBe('ready')
    expect(viewer.result.value).toMatchObject({ format: 'obj', triangles: 2 })
  })

  it('reports only the latest download\'s failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const viewer = useModelViewer(ref({} as HTMLElement), theme)
    const second = pending(3)
    const loads = [viewer.load(() => new Promise((_, reject) => setTimeout(() => reject(new Error('gone')), 5)), 'stl'), viewer.load(second.download, 'stl')]
    second.finish()
    await Promise.all(loads)
    expect(viewer.problem.value).toBeNull()
    expect(viewer.result.value?.triangles).toBe(3)
  })
})
