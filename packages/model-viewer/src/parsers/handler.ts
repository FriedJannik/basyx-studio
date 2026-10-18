import type { IfcModel } from './ifc'
import type { ParserRequest, ParserResponse } from './protocol'

// Answers parser requests, in the worker or, where workers are not
// available, on the main thread. The parsers load only for their format.

export function createParserHandler (send: (response: ParserResponse) => void) {
  let ifc: IfcModel | null = null

  return async function handle (request: ParserRequest): Promise<void> {
    try {
      if (request.type === 'element') {
        if (!ifc) {
          throw new Error('No IFC model is open.')
        }
        send({ type: 'element', id: request.id, element: await ifc.element(request.expressId) })
        return
      }
      ifc?.close()
      ifc = null
      if (request.format === 'ifc') {
        const { IfcModel } = await import('./ifc')
        ifc = await IfcModel.open(request.bytes, request.wasmUrl)
        send({ type: 'meshes', id: request.id, meshes: ifc.meshes(progress => send({ type: 'progress', id: request.id, progress })) })
      } else {
        const { readStep } = await import('./step')
        send({ type: 'meshes', id: request.id, meshes: await readStep(request.bytes, request.wasmUrl) })
      }
    } catch (error) {
      send({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) })
    }
  }
}
