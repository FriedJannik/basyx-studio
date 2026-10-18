// Nitro-specific: server plugins are not part of `nuxt/server`. Port to
// `definePlugin` from `nitro` when moving to Nitro v3 (Nuxt 5).
import { defineNitroPlugin } from 'nitropack/runtime'
import { useRuntimeConfig } from 'nuxt/server'
import { deleteExpiredRecords } from '../lib/sessions'
import { closeStudio, useStudio } from '../utils/studio'

export default defineNitroPlugin(nitroApp => {
  // Fail fast on configuration or migration errors instead of on the first
  // request. A hosted server exits, so its orchestrator sees the failure and
  // does not route traffic to a service that cannot answer; `nuxt dev` and
  // the desktop service keep running and report the error per request.
  const exitOnFailure = !import.meta.dev && useRuntimeConfig().studio.deploymentMode === 'hosted'
  useStudio().catch((error: Error) => {
    console.error(`[studio] startup failed: ${error.message}`)
    if (exitOnFailure) {
      // The listening server keeps the process alive, so exitCode is not enough.
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit(1)
    }
  })

  const cleanup = setInterval(() => {
    useStudio()
      .then(studio => deleteExpiredRecords(studio))
      .catch(() => {})
  }, 60 * 60 * 1000)
  cleanup.unref()

  // PGlite must be closed so its data directory is flushed and released.
  nitroApp.hooks.hook('close', async () => {
    clearInterval(cleanup)
    await closeStudio()
  })
})
