import type { DeploymentMode } from '#shared/contract'
import type { StudioDeps } from '../lib/deps'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { useRuntimeConfig } from 'nuxt/server'
import { BackendRunner } from '../lib/apps/runner'
import { installBundledApp } from '../lib/apps/store'
import { capabilityTokenKey } from '../lib/apps/tokens'
import { loadStudioConfig } from '../lib/config'
import { systemDiscoveryEnvironment } from '../lib/containers/discovery'
import { infrastructureInputOf } from '../lib/containers/infrastructure'
import { ContainerManager } from '../lib/containers/manager'
import { SecretCipher } from '../lib/crypto/cipher'
import { openDatabase } from '../lib/database/client'
import { applyMigrations } from '../lib/database/migrate'
import { FileGrantStore } from '../lib/desktop/grants'
import { createInfrastructure, deleteInfrastructure } from '../lib/infrastructures'
import { ensureDesktopSession } from '../lib/sessions'
import { CredentialBroker } from '../lib/targets/credentials'
import { WorkspaceWorkerClient } from '../lib/workspaces/client'
import { WorkspaceManager } from '../lib/workspaces/manager'
import { loadBundledApps } from '../nitro/bundled-apps'
import { loadMigrationsFromAssets } from '../nitro/migration-assets'

export interface StudioRuntime extends StudioDeps {
  broker: CredentialBroker
  /** Desktop AASX workspaces; `null` when hosted or the worker is missing. */
  workspaces: WorkspaceManager | null
  /** Checks uploads in the Workspace Worker process (ADR 0014); `null` when the worker is missing. */
  inspector: WorkspaceWorkerClient | null
  /** Backend apps in Deno; `null` when apps are disabled. */
  backends: BackendRunner | null
  /** Signs the capability tokens of backend app calls. */
  capabilityKey: Buffer
  /** Files the user chose in native dialogs for the BaSyx Docker app (desktop). */
  fileGrants: FileGrantStore
  /** Local BaSyx instances on Docker or Podman (ADR 0033); `null` when hosted. */
  containers: ContainerManager | null
  close: () => Promise<void>
}

/** The Deno executable: configured, else the pnpm-managed runtime (`devEngines.runtime`). */
function denoExecutable (configured: string | null): string {
  return configured ?? join(process.cwd(), 'node_modules', 'deno', process.platform === 'win32' ? 'deno.exe' : 'deno')
}

/** The bundled Workspace Worker: configured for `nuxt dev`, else next to the server entry. */
function workspaceWorkerEntry (configured: string): string | null {
  const entry = configured || process.env.STUDIO_WORKSPACE_WORKER || (process.argv[1] ? join(dirname(process.argv[1]), 'workspace-worker.mjs') : '')
  return entry && existsSync(entry) ? entry : null
}

/** Installs or updates the apps shipped with this build; a broken package never blocks startup. */
async function installBundledApps (deps: StudioDeps): Promise<void> {
  for (const { name, bytes } of await loadBundledApps()) {
    try {
      const outcome = await installBundledApp(deps, bytes)
      if (outcome !== 'unchanged') {
        console.info(`[studio] bundled app ${name}: ${outcome}`)
      }
    } catch (error) {
      console.error(`[studio] bundled app ${name} was not installed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

let runtime: Promise<StudioRuntime> | undefined

async function initialize (): Promise<StudioRuntime> {
  const runtimeConfig = useRuntimeConfig().studio
  const deploymentMode = runtimeConfig.deploymentMode as DeploymentMode
  const config = loadStudioConfig(process.env, deploymentMode)
  const handle = await openDatabase(config.database)
  try {
    const applied = await applyMigrations(handle.db, await loadMigrationsFromAssets())
    if (applied.length > 0) {
      console.info(`[studio] applied database migrations: ${applied.join(', ')}`)
    }
    const deps: StudioDeps = { config, db: handle.db, cipher: new SecretCipher(config.dataKey) }
    if (config.deploymentMode === 'desktop') {
      await ensureDesktopSession(deps)
    }
    if (config.apps.baseUrl) {
      await installBundledApps(deps)
    }
    let workspaces: WorkspaceManager | null = null
    let inspector: WorkspaceWorkerClient | null = null
    const entry = workspaceWorkerEntry(String(runtimeConfig.workspaceWorker ?? ''))
    if (entry) {
      // Desktop shares one worker for workspaces and upload checks; hosted
      // Studio starts it only to check uploads.
      inspector = new WorkspaceWorkerClient({ entry })
      if (config.deploymentMode === 'desktop') {
        workspaces = new WorkspaceManager(inspector)
      }
    } else {
      console.warn('[studio] the Workspace Worker was not found; AASX workspaces and uploads are unavailable')
    }
    const backends = config.apps.baseUrl
      ? new BackendRunner({
          denoPath: denoExecutable(config.apps.denoPath),
          workDir: config.apps.workDir,
          capabilityUrl: config.apps.capabilityUrl,
        })
      : null
    const fileGrants = new FileGrantStore()
    const containers = config.containers
      ? new ContainerManager({
          deps,
          dataDir: config.containers.dataDir,
          discovery: systemDiscoveryEnvironment(),
          grants: fileGrants,
          infrastructures: {
            create: async ({ name, spec, actor, requestId }) => (await createInfrastructure(deps, actor, infrastructureInputOf(name, spec), requestId)).id,
            remove: (id, actor, requestId) => deleteInfrastructure(deps, actor, id, requestId),
          },
        })
      : null
    console.info(`[studio] ${config.deploymentMode} mode, ${config.database.kind} database, public URL ${config.publicUrl}`)
    return {
      ...deps,
      broker: new CredentialBroker(deps),
      workspaces,
      inspector,
      backends,
      capabilityKey: capabilityTokenKey(config.dataKey),
      fileGrants,
      containers,
      close: async () => {
        backends?.dispose()
        await containers?.dispose()
        workspaces?.dispose()
        inspector?.close()
        await handle.close()
      },
    }
  } catch (error) {
    await handle.close()
    throw error
  }
}

/** The process-wide Studio runtime (configuration, database, cipher, credential broker). */
export function useStudio (): Promise<StudioRuntime> {
  runtime ??= initialize().catch(error => {
    runtime = undefined
    throw error
  })
  return runtime
}

export async function closeStudio (): Promise<void> {
  const current = runtime
  runtime = undefined
  if (current) {
    await (await current.catch(() => undefined))?.close()
  }
}
