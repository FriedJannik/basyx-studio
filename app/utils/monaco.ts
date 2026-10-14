// The Monaco editor for code views (MVP-4: JSON, XML, PlantUML source and the
// advanced query), set up as in the BaSyx AAS Web UI
// (aas-web-ui/src/components/Code/monacoRuntime.ts). Loaded on first use only,
// in the browser.
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import { jsonDefaults } from 'monaco-editor/languages/features/json/register'
import 'monaco-editor/languages/definitions/xml/register'
// Monaco 0.56's JSON worker manager uses the editor features (find, folding,
// suggestions); register them before an editor is created.
import 'monaco-editor/features/register.all'

interface MonacoGlobal {
  MonacoEnvironment?: { getWorker: (moduleId: string, label: string) => Worker }
}

const global = globalThis as typeof globalThis & MonacoGlobal
global.MonacoEnvironment ??= {
  getWorker: (_moduleId: string, label: string) => (label === 'json' ? new jsonWorker() : new editorWorker()),
}

/** A JSON schema for the models whose URI matches `fileMatch`. */
export interface CodeSchema {
  uri: string
  fileMatch: string[]
  schema: unknown
}

/** Adds schemas for JSON validation and suggestions, replacing those with the same URI. */
export function registerJsonSchemas (schemas: CodeSchema[]) {
  const current = jsonDefaults.diagnosticsOptions.schemas ?? []
  const uris = new Set(schemas.map(schema => schema.uri))
  jsonDefaults.setDiagnosticsOptions({
    ...jsonDefaults.diagnosticsOptions,
    validate: true,
    enableSchemaRequest: false,
    schemas: [...current.filter(schema => !uris.has(schema.uri)), ...schemas],
  })
}

export * as monaco from 'monaco-editor/editor'
