// Nitro-specific: `nuxt/server` has no storage API. The packages come from
// Nitro server assets (`nitro.serverAssets` in nuxt.config.ts), built by
// `pnpm apps:bundle`; port this to `nitro/storage` when moving to Nitro v3.
import { useStorage } from 'nitropack/runtime'
import { isRetiredBundledAppPackage } from '../lib/apps/bundled'

/** The packages of the apps shipped with Studio (ADR 0023), by file name. */
export async function loadBundledApps (): Promise<Array<{ name: string, bytes: Uint8Array }>> {
  const storage = useStorage('assets:bundled-apps')
  const keys = (await storage.getKeys()).filter(key => key.endsWith('.zip') && !isRetiredBundledAppPackage(key))
  const packages: Array<{ name: string, bytes: Uint8Array }> = []
  for (const key of keys.toSorted()) {
    const value = await storage.getItemRaw(key)
    if (value) {
      packages.push({ name: key, bytes: new Uint8Array(value as ArrayBuffer) })
    }
  }
  return packages
}
