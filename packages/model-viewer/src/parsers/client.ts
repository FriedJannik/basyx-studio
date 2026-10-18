import type { IfcElementInfo, MeshBatch, ProgressCallback } from '../types'
import type { ParserRequest, ParserResponse, WorkerMessage } from './protocol'
import occtWasm from 'occt-import-js/dist/occt-import-js.wasm?url'
import ifcWasm from 'web-ifc/web-ifc.wasm?url'
import workerUrl from './parser.worker?worker&url'

type Pending = {
  resolve: (value: any) => void
  reject: (error: Error) => void
  onProgress?: ProgressCallback
}

const absolute = (url: string) => new URL(url, document.baseURI).href

/**
 * Runs the IFC and STEP parsers in a worker. The worker starts from a
 * `blob:` URL that imports the bundled script, which also works in the
 * opaque origin of a sandboxed app frame. Where no worker can start, the
 * parsers run on the main thread.
 */
export class ParserClient {
  #pending = new Map<number, Pending>()
  #nextId = 1
  #ready: Promise<(request: ParserRequest, transfer: Transferable[]) => void>
  #worker: Worker | null = null
  #blobUrl: string | null = null

  constructor () {
    this.#ready = this.#startWorker().catch(() => this.#startLocal())
  }

  /** The triangles of an IFC or STEP file. The bytes are handed over, not copied. */
  async parse (format: 'ifc' | 'step', bytes: Uint8Array, onProgress?: ProgressCallback): Promise<MeshBatch[]> {
    const wasmUrl = absolute(format === 'ifc' ? ifcWasm : occtWasm)
    return this.#call(id => ({ type: 'parse', id, format, bytes, wasmUrl }), [bytes.buffer as ArrayBuffer], onProgress)
  }

  /** The properties of an element of the IFC model parsed last. */
  async element (expressId: number): Promise<IfcElementInfo> {
    return this.#call(id => ({ type: 'element', id, expressId }), [])
  }

  dispose (): void {
    this.#worker?.terminate()
    if (this.#blobUrl) {
      URL.revokeObjectURL(this.#blobUrl)
    }
    for (const pending of this.#pending.values()) {
      pending.reject(new Error('The viewer was closed.'))
    }
    this.#pending.clear()
  }

  async #call<T> (request: (id: number) => ParserRequest, transfer: Transferable[], onProgress?: ProgressCallback): Promise<T> {
    const send = await this.#ready
    const id = this.#nextId++
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, onProgress })
      send(request(id), transfer)
    })
  }

  #receive (response: ParserResponse): void {
    const pending = this.#pending.get(response.id)
    if (!pending) {
      return
    }
    switch (response.type) {
      case 'progress': {
        pending.onProgress?.(response.progress)
        return
      }
      case 'meshes': {
        pending.resolve(response.meshes)
        break
      }
      case 'element': {
        pending.resolve(response.element)
        break
      }
      case 'error': {
        pending.reject(new Error(response.message))
        break
      }
    }
    this.#pending.delete(response.id)
  }

  /** Resolves once the worker answered, so nothing is handed to a worker that never started. */
  #startWorker (): Promise<(request: ParserRequest, transfer: Transferable[]) => void> {
    return new Promise((resolve, reject) => {
      this.#blobUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(absolute(workerUrl))}`], { type: 'text/javascript' }))
      const worker = new Worker(this.#blobUrl, { type: 'module' })
      this.#worker = worker
      worker.addEventListener('error', () => {
        worker.terminate()
        reject(new Error('The parser worker did not start.'))
      }, { once: true })
      worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === 'ready') {
          resolve((request, transfer) => worker.postMessage(request, transfer))
        } else {
          this.#receive(event.data)
        }
      })
    })
  }

  async #startLocal (): Promise<(request: ParserRequest) => void> {
    this.#worker = null
    const { createParserHandler } = await import('./handler')
    const handle = createParserHandler(response => this.#receive(response))
    return request => void handle(request)
  }
}
