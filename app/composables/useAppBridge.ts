import type { AppCallResult, AppContext, AppContributionInfo, AppMethodName, ElementDetail, Problem } from '#shared/contract'
import type { Ref } from 'vue'
import { useQueryCache } from '@pinia/colada'
import { appHelloSchema, appMethodNameSchema, appMethodParamsSchemas, appProtocol, appRequestMessageSchema, externalFileUrl, readFileMaxBytes } from '#shared/contract'
import { StudioApiError } from '~/composables/useStudioApi'
import { resourceKey } from '~/utils/aas'

export interface AppBridgeOptions {
  contribution: () => AppContributionInfo
  /** The target the frame is bound to; fixed for the frame's lifetime. */
  targetId: string | null
  context: () => AppContext
  onNavigate: (subPath: string) => void
  /** Opens the frame's view in a full-screen dialog with the view's state; absent inside that dialog. */
  onOpenFullscreen?: (state: string) => void
}

/** A refusal of the host itself, in the shape of Studio's problems. */
function hostProblem (code: Problem['code'], title: string, status: number): StudioApiError {
  return new StudioApiError({ type: 'about:blank', title, status, code, requestId: '', retryable: false })
}

/** Methods that act outside the app's frame and so need a click or key press in it just before. */
const activationMethods = new Set<AppMethodName>(['studio.ui.copyText', 'studio.ui.openExternal'])

function problemOf (error: unknown): Problem {
  if (error instanceof StudioApiError && error.problem) {
    return error.problem
  }
  return { type: 'about:blank', title: 'Studio could not be reached.', status: 0, code: 'internal_error', requestId: '', retryable: true }
}

/**
 * The host side of the `studio-sdk/0` bridge (ADR 0018). It answers only the
 * frame it created, hands that frame one MessagePort per load of its entry,
 * validates every request, and forwards capability calls to Studio, which
 * checks them against the installed manifest and the user's rights. A frame
 * that navigates away from its entry loses its port and is reloaded.
 */
export function useAppBridge (frame: Ref<HTMLIFrameElement | null>, options: AppBridgeOptions) {
  const api = useStudioApi()
  const queryCache = useQueryCache()
  const notifications = useNotificationsStore()
  const label = useLocalizedLabel()
  const copy = useClipboard()
  const desktop = useDesktopBridge()
  const studioUrl = useStudioUrl()
  const readExternalFile = useExternalFile()
  const connected = ref(false)
  /** Content height the app asked for (`studio.ui.setHeight`), or `null`. */
  const height = ref<number | null>(null)

  let port: MessagePort | null = null
  let handedOut = false
  let loads = 0
  let reloading = false
  let lastContext = ''

  function respond (message: unknown, transfer: Transferable[] = []) {
    port?.postMessage(message, transfer)
  }

  async function onRequest (event: MessageEvent) {
    const parsed = appRequestMessageSchema.safeParse(event.data)
    if (!parsed.success) {
      return
    }
    const { id, method: name, params } = parsed.data
    const method = appMethodNameSchema.safeParse(name)
    if (!method.success) {
      respond({ type: 'error', id, problem: { ...problemOf(null), title: `Unknown method ${name}.`, code: 'invalid_request', status: 400, retryable: false } })
      return
    }
    if (method.data === 'studio.ui.getContext') {
      respond({ type: 'response', id, result: options.context() })
      return
    }
    if (method.data === 'studio.ui.setHeight') {
      // Only sizes the app's own frame; needs no permission or round trip.
      const parsedHeight = appMethodParamsSchemas['studio.ui.setHeight'].safeParse(params)
      if (parsedHeight.success) {
        height.value = parsedHeight.data.height
      }
      respond({ type: 'response', id, result: null })
      return
    }
    if (method.data === 'studio.ui.openFullscreen') {
      // Like setHeight, it only affects how Studio shows the app's own view.
      const parsedFullscreen = appMethodParamsSchemas['studio.ui.openFullscreen'].safeParse(params ?? {})
      if (parsedFullscreen.success) {
        options.onOpenFullscreen?.(parsedFullscreen.data.state ?? '')
      }
      respond({ type: 'response', id, result: null })
      return
    }
    // A click in the frame also activates Studio's page (user activation
    // propagates to ancestor frames); read it before the round trip.
    const activated = navigator.userActivation?.isActive ?? true
    const contribution = options.contribution()
    try {
      if (activationMethods.has(method.data) && !activated) {
        throw hostProblem('forbidden', 'Call this from a click or key press in the app.', 403)
      }
      const { result } = await api<AppCallResult>('/app-calls', {
        method: 'POST',
        body: { installationId: contribution.installationId, targetId: options.targetId, shellId: options.context().shell?.id ?? null, method: method.data, params },
      })
      const replaced = await carryOut(method.data, params, contribution)
      respond({ type: 'response', id, result: replaced ? replaced.result : result }, replaced?.transfer)
    } catch (error) {
      respond({ type: 'error', id, problem: problemOf(error) })
    }
  }

  /**
   * Studio authorized the call; UI methods are carried out here. A returned
   * result replaces Studio's; its `transfer` buffers move to the frame.
   */
  async function carryOut (method: AppMethodName, params: unknown, contribution: AppContributionInfo): Promise<{ result: unknown, transfer?: Transferable[] } | null> {
    switch (method) {
      case 'studio.ui.notify': {
        const notice = appMethodParamsSchemas['studio.ui.notify'].parse(params)
        notifications.notify({ text: `${label(contribution.appTitle)}: ${notice.message}`, color: notice.level })
        break
      }
      case 'studio.ui.openFile': {
        if (options.targetId) {
          const file = appMethodParamsSchemas['studio.ui.openFile'].parse(params)
          const url = studioUrl.api(`/targets/${options.targetId}/submodels/${resourceKey(file.submodelId)}/elements/${resourceKey(file.idShortPath)}/attachment${file.download ? '?download' : ''}`)
          window.open(url, '_blank', 'noopener')
        }
        break
      }
      case 'studio.ui.readFile': {
        // Through Studio's API, so the user's own rights apply as in Studio.
        if (!options.targetId) {
          throw hostProblem('invalid_request', 'This app frame is not bound to a target.', 400)
        }
        const file = appMethodParamsSchemas['studio.ui.readFile'].parse(params)
        const blob = await api<Blob>(`/targets/${options.targetId}/submodels/${resourceKey(file.submodelId)}/elements/${resourceKey(file.idShortPath)}/attachment`, { responseType: 'blob' })
        if (blob.size > readFileMaxBytes) {
          throw hostProblem('unsupported_operation', `The file is larger than ${readFileMaxBytes / 1024 / 1024} MiB.`, 422)
        }
        const bytes = new Uint8Array(await blob.arrayBuffer())
        return { result: { bytes, contentType: blob.type || 'application/octet-stream' }, transfer: [bytes.buffer] }
      }
      case 'studio.ui.readExternalFile': {
        // The address comes from the element as the user reads it, never from the app.
        if (!options.targetId) {
          throw hostProblem('invalid_request', 'This app frame is not bound to a target.', 400)
        }
        const file = appMethodParamsSchemas['studio.ui.readExternalFile'].parse(params)
        const element = await api<ElementDetail>(`/targets/${options.targetId}/submodels/${resourceKey(file.submodelId)}/elements/${resourceKey(file.idShortPath)}`)
        const url = externalFileUrl(element.value)
        if (!url) {
          throw hostProblem('unsupported_operation', 'The element does not name a file by an http(s) address.', 422)
        }
        const content = await readExternalFile(url, { targetId: options.targetId, submodelKey: resourceKey(file.submodelId), elementKey: resourceKey(file.idShortPath) })
        return { result: content, transfer: [content.bytes.buffer] }
      }
      case 'studio.ui.navigate': {
        if (contribution.kind === 'module') {
          options.onNavigate(appMethodParamsSchemas['studio.ui.navigate'].parse(params).subPath)
        }
        break
      }
      case 'studio.ui.openTarget': {
        await navigateTo(`/targets/${encodeURIComponent(appMethodParamsSchemas['studio.ui.openTarget'].parse(params).targetId)}`)
        break
      }
      case 'studio.ui.openExternal': {
        window.open(appMethodParamsSchemas['studio.ui.openExternal'].parse(params).url, '_blank', 'noopener')
        break
      }
      case 'studio.ui.copyText': {
        // Frames may not use the clipboard themselves.
        await copy(appMethodParamsSchemas['studio.ui.copyText'].parse(params).text)
        break
      }
      case 'studio.containers.pickFiles': {
        // Native dialogs of the BaSyx Docker app (ADR 0033), shown only after Studio authorized the pick.
        if (!desktop?.chooseStackFiles) {
          throw hostProblem('unsupported_operation', 'Choosing files needs the desktop app.', 422)
        }
        const { kind, suggestedName } = appMethodParamsSchemas['studio.containers.pickFiles'].parse(params)
        return { result: { files: await desktop.chooseStackFiles(kind, suggestedName) } }
      }
      case 'studio.aas.setElementValue': {
        if (options.targetId) {
          // Studio's own views show the new value, and a workspace its unsaved state.
          void queryCache.invalidateQueries({ key: ['targets', options.targetId], exact: true })
          void queryCache.invalidateQueries({ key: ['targets', options.targetId, 'details'] })
        }
        break
      }
    }
    return null
  }

  function closePort () {
    port?.close()
    port = null
    connected.value = false
  }

  function onMessage (event: MessageEvent) {
    const window = frame.value?.contentWindow
    // A queued hello from the previous document has the same WindowProxy.
    // Do not give it the next document's port during a forced entry reload.
    if (!window || event.source !== window || handedOut || reloading || !appHelloSchema.safeParse(event.data).success) {
      return
    }
    handedOut = true
    const channel = new MessageChannel()
    port = channel.port1
    port.addEventListener('message', event => void onRequest(event))
    port.start()
    // The frame's origin is opaque, so it cannot be named as target origin;
    // the message goes to this frame's window only.
    const context = options.context()
    lastContext = JSON.stringify(context)
    window.postMessage({ protocol: appProtocol, type: 'connect', context }, '*', [channel.port2])
    connected.value = true
  }

  /** Each load of the entry may connect once; any other navigation reloads the entry. */
  function onLoad () {
    loads++
    if (loads === 1 || reloading) {
      reloading = false
      return
    }
    closePort()
    handedOut = false
    reloading = true
    if (frame.value) {
      frame.value.src = options.contribution().entryUrl
    }
  }

  // Sent only when something changed, not on every render of the host page.
  watch(() => options.context(), context => {
    const serialized = JSON.stringify(context)
    if (serialized !== lastContext) {
      lastContext = serialized
      respond({ type: 'context', context })
    }
  }, { deep: true })

  onMounted(() => window.addEventListener('message', onMessage))
  onBeforeUnmount(() => {
    window.removeEventListener('message', onMessage)
    closePort()
  })

  /** Bind to the frame's `load` event. */
  return { connected, height, onLoad }
}
