import type { Problem } from '#shared/contract'
import type { MethodName, Methods, StackComponentId, StackFileKind, StackSpec } from '@basyx/studio-sdk'
import type { DockerClient } from '~/components/basyx-docker/support'
import { StudioApiError } from '~/composables/useStudioApi'

type ContainerMethod = Extract<MethodName, `studio.containers.${string}`>

function unavailable (): StudioApiError {
  const problem: Problem = {
    type: 'about:blank',
    title: 'This action needs the BaSyx Studio desktop app.',
    status: 422,
    code: 'unsupported_operation',
    requestId: '',
    retryable: false,
  }
  return new StudioApiError(problem)
}

/** Native Studio client for the desktop-only local BaSyx instances page. */
export function useDockerClient (): DockerClient {
  const api = useStudioApi()
  const desktop = useDesktopBridge()
  const notifications = useNotificationsStore()
  const router = useRouter()

  async function call<M extends ContainerMethod> (method: M, params: Methods[M]['params']): Promise<Methods[M]['result']> {
    const operation = method.slice('studio.containers.'.length)
    return await api<Methods[M]['result']>(`/containers/${operation}`, { method: 'POST', body: params })
  }

  async function pickFiles (kind: StackFileKind, suggestedName?: string) {
    if (!desktop?.chooseStackFiles) {
      throw unavailable()
    }
    return { files: await desktop.chooseStackFiles(kind, suggestedName) }
  }

  async function pickOne (kind: StackFileKind, suggestedName?: string): Promise<string | null> {
    return (await pickFiles(kind, suggestedName)).files[0]?.handle ?? null
  }

  const containers: DockerClient['containers'] = {
    listEngines: () => call('studio.containers.listEngines', {}),
    selectEngine: host => call('studio.containers.selectEngine', { host }),
    listStacks: () => call('studio.containers.listStacks', {}),
    getStack: stackId => call('studio.containers.getStack', { stackId }),
    planStack: (spec: StackSpec, stackId?: string) => call('studio.containers.planStack', stackId ? { spec, stackId } : { spec }),
    createStack: params => call('studio.containers.createStack', params),
    changeStack: params => call('studio.containers.changeStack', params),
    startStack: stackId => call('studio.containers.startStack', { stackId }),
    stopStack: stackId => call('studio.containers.stopStack', { stackId }),
    updateStack: stackId => call('studio.containers.updateStack', { stackId }),
    removeStack: params => call('studio.containers.removeStack', params),
    getJob: jobId => call('studio.containers.getJob', { jobId }),
    getLogs: (stackId: string, component: StackComponentId, tail?: number) => call('studio.containers.getLogs', tail === undefined ? { stackId, component } : { stackId, component, tail }),
    getSignIn: stackId => call('studio.containers.getSignIn', { stackId }),
    pickFiles,
    pickAasxFiles: () => pickFiles('stack-aasx'),
    saveLogs: async (stackId, component) => {
      const fileHandle = await pickOne('stack-logs', `${stackId}-${component}`)
      return fileHandle ? call('studio.containers.saveLogs', { stackId, component, fileHandle }) : null
    },
    exportStack: async (stackId, suggestedName) => {
      const fileHandle = await pickOne('stack-export', suggestedName)
      return fileHandle ? call('studio.containers.exportStack', { stackId, fileHandle }) : null
    },
    importStack: async () => {
      const fileHandle = await pickOne('stack-import')
      return fileHandle ? call('studio.containers.importStack', { fileHandle }) : null
    },
  }

  return {
    containers,
    ui: {
      async copyText (text) {
        await navigator.clipboard.writeText(text)
        return null
      },
      async notify (message, level = 'info') {
        notifications.notify({ text: message, color: level })
        return null
      },
      async openExternal (url) {
        window.open(url, '_blank', 'noopener')
        return null
      },
      async openTarget (targetId) {
        await router.push(`/targets/${encodeURIComponent(targetId)}`)
        return null
      },
    },
  }
}
