// Entry point of the container image: applies the deployment settings that
// Nuxt reads when its server module loads, then starts the Studio Service in
// this process, so SIGTERM reaches Nitro's graceful shutdown directly.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { basePathOf } from './base-path.mjs'

const serverDir = fileURLToPath(new URL('server/', import.meta.url))

let basePath
try {
  basePath = basePathOf(process.env)
} catch (error) {
  console.error(`[studio] startup failed: ${error.message}`)
  process.exitCode = 1
}

if (basePath) {
  // Nuxt serves pages, assets and every server route under app.baseURL.
  process.env.NUXT_APP_BASE_URL = basePath
  // The Workspace Worker lies next to the server entry, not next to this file.
  process.env.STUDIO_WORKSPACE_WORKER ??= join(serverDir, 'workspace-worker.mjs')
  await import(join(serverDir, 'index.mjs'))
}
