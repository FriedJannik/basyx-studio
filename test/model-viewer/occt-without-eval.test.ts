import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { withoutEval } from '../../apps/shared/vite'

// App frames forbid evaluating strings as code (no 'unsafe-eval' in their
// CSP, ADR 0017). The apps' build replaces occt-import-js's embind invokers,
// which use `new Function`, with closures (apps/shared/vite.ts). A context
// that refuses code generation from strings stands in for the CSP.

const require = createRequire(new URL('../../packages/model-viewer/package.json', import.meta.url))
const source = readFileSync(require.resolve('occt-import-js'), 'utf8')
const wasmBinary = readFileSync(require.resolve('occt-import-js/dist/occt-import-js.wasm'))
const step = new Uint8Array(readFileSync(new URL('../../test-setup/fixtures/models3d/bracket.step', import.meta.url)))

interface Occt {
  ReadStepFile: (content: Uint8Array, params: Record<string, unknown> | null) => { success: boolean, meshes: unknown[] }
}

/** Loads occt-import-js in a context without `eval` and `new Function`. */
async function loadWithoutEval (code: string): Promise<Occt> {
  const sandbox: Record<string, unknown> = { module: { exports: {} }, console, TextDecoder, setTimeout, clearTimeout, performance }
  sandbox.exports = (sandbox.module as { exports: unknown }).exports
  const context = createContext(sandbox, { codeGeneration: { strings: false, wasm: true } })
  runInContext(code, context)
  const factory = (sandbox.module as { exports: (options: Record<string, unknown>) => Promise<Occt> }).exports
  return factory({ wasmBinary })
}

describe('occt-import-js without eval', () => {
  it('needs eval as published, so STEP fails in app frames', async () => {
    await expect(loadWithoutEval(source)).rejects.toThrow(/Code generation from strings disallowed/)
  })

  it('reads STEP without eval once the apps\' build replaced its invokers', async () => {
    const occt = await loadWithoutEval(withoutEval(source))
    const result = occt.ReadStepFile(step, { linearUnit: 'millimeter' })
    expect(result.success).toBe(true)
    expect(result.meshes).toHaveLength(1)
  })

  it('refuses to build a version it does not know', () => {
    expect(() => withoutEval('var x = 1')).toThrow(/occt-import-js changed/)
  })
})
