import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vuetify is patched for server rendering (patches/README.md). pnpm applies a
// patch only to the exact version it names and installs any other version
// without it and without an error, so a Vuetify update would bring the layout
// shift back unnoticed. These checks fail instead and say what to do.
const root = join(import.meta.dirname, '..', '..')
const advice = 'Vuetify was updated. Check whether it now reserves the app bar and drawers in server-rendered HTML (patches/README.md): if so, delete the patch and its patchedDependencies entry; if not, re-create the patch for this version.'

describe('Vuetify patch', () => {
  const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const patched = [...workspace.matchAll(/^\s+vuetify@([^:]+):\s*patches\//gm)].map(match => match[1])
  const installed = (JSON.parse(readFileSync(join(root, 'node_modules', 'vuetify', 'package.json'), 'utf8')) as { version: string }).version

  it.runIf(patched.length > 0)('is for the installed version', () => {
    expect(patched, advice).toContain(installed)
  })

  it.runIf(patched.length > 0)('is applied', () => {
    const appBar = readFileSync(join(root, 'node_modules', 'vuetify', 'lib', 'components', 'VAppBar', 'VAppBar.js'), 'utf8')
    const layout = readFileSync(join(root, 'node_modules', 'vuetify', 'lib', 'composables', 'layout.js'), 'utf8')
    expect(appBar.includes('propsContentHeight') && layout.includes('Patched for BaSyx Studio'), advice).toBe(true)
  })
})
