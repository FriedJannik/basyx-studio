import type { ParserRequest, ParserResponse, WorkerMessage } from './protocol'
import { createParserHandler } from './handler'
import { transferablesOf } from './protocol'

// The parser worker: IFC and STEP are read off the main thread, so the page
// stays responsive while large models load.

// Typed here: the DOM and WebWorker libraries do not go together in one program.
const scope = globalThis as unknown as {
  postMessage: (message: WorkerMessage, transfer: Transferable[]) => void
  addEventListener: (type: 'message', listener: (event: MessageEvent<ParserRequest>) => void) => void
}

const handle = createParserHandler((response: ParserResponse) => {
  scope.postMessage(response, response.type === 'meshes' ? transferablesOf(response.meshes) : [])
})

scope.addEventListener('message', event => void handle(event.data))
// Tells the viewer the worker started; until then it sends nothing.
scope.postMessage({ type: 'ready' }, [])
