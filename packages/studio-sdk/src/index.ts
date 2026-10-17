import type {
  AppContext,
  ConnectMessage,
  HelloMessage,
  HostMessage,
  MethodName,
  Methods,
  Problem,
  StackComponentId,
  StackFileKind,
  StackSpec,
  ThemeTokens,
} from './protocol'
import { protocolVersion } from './protocol'

export * from './protocol'

/** A capability call that Studio refused or that failed. */
export class StudioError extends Error {
  constructor (readonly problem: Problem) {
    super(problem.detail ?? problem.title)
    this.name = 'StudioError'
  }

  get code (): string {
    return this.problem.code
  }
}

export interface ConnectOptions {
  /** How long to wait for Studio to answer. Default 10 s. */
  timeoutMs?: number
}

/**
 * The connection of an app frame to Studio. Every call is checked by Studio
 * against the app's declared permissions and the user's rights.
 */
export class StudioClient {
  readonly aas = {
    listShells: (params: Methods['studio.aas.listShells']['params'] = {}) => this.call('studio.aas.listShells', params),
    getShell: (shellId: string) => this.call('studio.aas.getShell', { shellId }),
    listSubmodels: (shellId: string) => this.call('studio.aas.listSubmodels', { shellId }),
    getSubmodel: (submodelId: string) => this.call('studio.aas.getSubmodel', { submodelId }),
    getElement: (submodelId: string, idShortPath: string) => this.call('studio.aas.getElement', { submodelId, idShortPath }),
    setElementValue: (params: Methods['studio.aas.setElementValue']['params']) => this.call('studio.aas.setElementValue', params),
  }

  readonly ui = {
    notify: (message: string, level: Methods['studio.ui.notify']['params']['level'] = 'info') => this.call('studio.ui.notify', { message, level }),
    /** Changes the module's sub-path in Studio's URL (nested routes). */
    navigate: (subPath: string) => this.call('studio.ui.navigate', { subPath }),
    /** Sizes the frame to a content height; see `fitHeight` to follow the document. */
    setHeight: (height: number) => this.call('studio.ui.setHeight', { height: Math.ceil(height) }),
    /** Opens a File element's content in a new tab; `download` saves it instead. */
    openFile: (submodelId: string, idShortPath: string, download = false) => this.call('studio.ui.openFile', { submodelId, idShortPath, download }),
    /** Opens this view again in a full-screen dialog; `context.fullscreen` is true there. */
    openFullscreen: () => this.call('studio.ui.openFullscreen', {}),
    /** Opens a target in Studio (needs studio.ui.navigation). */
    openTarget: (targetId: string) => this.call('studio.ui.openTarget', { targetId }),
    /**
     * Opens a URL in the system browser (needs studio.ui.navigation): https,
     * or http to this computer. Call it from a click handler.
     */
    openExternal: (url: string) => this.call('studio.ui.openExternal', { url }),
    /** Copies text to the clipboard (needs studio.ui.clipboard). Call it from a click handler. */
    copyText: (text: string) => this.call('studio.ui.copyText', { text }),
  }

  /** Local BaSyx instances on Docker or Podman; desktop and bundled apps only (ADR 0033). */
  readonly containers = {
    listEngines: () => this.call('studio.containers.listEngines', {}),
    selectEngine: (host: string | null) => this.call('studio.containers.selectEngine', { host }),
    listStacks: () => this.call('studio.containers.listStacks', {}),
    getStack: (stackId: string) => this.call('studio.containers.getStack', { stackId }),
    planStack: (spec: StackSpec, stackId?: string) => this.call('studio.containers.planStack', stackId ? { spec, stackId } : { spec }),
    createStack: (params: Methods['studio.containers.createStack']['params']) => this.call('studio.containers.createStack', params),
    changeStack: (params: Methods['studio.containers.changeStack']['params']) => this.call('studio.containers.changeStack', params),
    startStack: (stackId: string) => this.call('studio.containers.startStack', { stackId }),
    stopStack: (stackId: string) => this.call('studio.containers.stopStack', { stackId }),
    updateStack: (stackId: string) => this.call('studio.containers.updateStack', { stackId }),
    removeStack: (params: Methods['studio.containers.removeStack']['params']) => this.call('studio.containers.removeStack', params),
    getJob: (jobId: string) => this.call('studio.containers.getJob', { jobId }),
    getLogs: (stackId: string, component: StackComponentId, tail?: number) => this.call('studio.containers.getLogs', tail === undefined ? { stackId, component } : { stackId, component, tail }),
    getSignIn: (stackId: string) => this.call('studio.containers.getSignIn', { stackId }),
    /** Lets the user choose files in a native dialog of the host; empty when cancelled. */
    pickFiles: (kind: StackFileKind, suggestedName?: string) => this.call('studio.containers.pickFiles', suggestedName ? { kind, suggestedName } : { kind }),
    /** AASX files to load at startup; pass their handles to `createStack` or `changeStack`. */
    pickAasxFiles: () => this.containers.pickFiles('stack-aasx'),
    /** Asks where to save, then writes the last 500 lines of a component's log; `null` when cancelled. */
    saveLogs: async (stackId: string, component: StackComponentId) => {
      const file = await this.#pickOne('stack-logs')
      return file ? this.call('studio.containers.saveLogs', { stackId, component, fileHandle: file }) : null
    },
    /** Asks where to save (prefilled with `suggestedName`), then writes the export; `null` when cancelled. */
    exportStack: async (stackId: string, suggestedName?: string) => {
      const file = await this.#pickOne('stack-export', suggestedName)
      return file ? this.call('studio.containers.exportStack', { stackId, fileHandle: file }) : null
    },
    /** Lets the user choose an exported ZIP or `basyx-stack.json` and reads it; `null` when cancelled. */
    importStack: async () => {
      const file = await this.#pickOne('stack-import')
      return file ? this.call('studio.containers.importStack', { fileHandle: file }) : null
    },
  }

  readonly backend = {
    /** Calls an exported handler of the app's backend. */
    call: <T = unknown>(method: string, params?: unknown) => this.call('studio.backend.call', { method, params }) as Promise<T>,
  }

  #port: MessagePort
  #context: AppContext
  #nextId = 1
  #pending = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>()
  #listeners = new Set<(context: AppContext) => void>()

  constructor (port: MessagePort, context: AppContext) {
    this.#port = port
    this.#context = context
    port.addEventListener('message', event => this.#receive(event.data as HostMessage))
    port.start()
  }

  /** The current context: target, shell, submodel, sub-path, locale and theme. */
  get context (): AppContext {
    return this.#context
  }

  /** Called whenever the context changes, e.g. the theme or the module sub-path. Returns an unsubscribe function. */
  onContext (listener: (context: AppContext) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  call<M extends MethodName> (method: M, params: Methods[M]['params']): Promise<Methods[M]['result']> {
    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.#port.postMessage({ type: 'request', id, method, params })
    })
  }

  /** The handle of the one file the user chose, or `null` when cancelled. */
  async #pickOne (kind: StackFileKind, suggestedName?: string): Promise<string | null> {
    const { files } = await this.containers.pickFiles(kind, suggestedName)
    return files[0]?.handle ?? null
  }

  #receive (message: HostMessage) {
    if (message.type === 'context') {
      this.#context = message.context
      for (const listener of this.#listeners) {
        listener(message.context)
      }
      return
    }
    const pending = this.#pending.get(message.id)
    if (!pending) {
      return
    }
    this.#pending.delete(message.id)
    if (message.type === 'response') {
      pending.resolve(message.result)
    } else {
      pending.reject(new StudioError(message.problem))
    }
  }
}

/**
 * Connects the app frame to Studio. Studio answers only to the frame it
 * created, and only once per page load.
 */
export function connect (options: ConnectOptions = {}): Promise<StudioClient> {
  if (window.parent === window) {
    return Promise.reject(new Error('A Studio app must run inside BaSyx Studio.'))
  }
  return new Promise((resolve, reject) => {
    const hello: HelloMessage = { protocol: protocolVersion, type: 'hello' }
    // The frame has an opaque origin and cannot name its parent's origin;
    // the hello carries no data, and the reply is checked by its source.
    const send = () => window.parent.postMessage(hello, '*')
    const retry = setInterval(send, 250)
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('BaSyx Studio did not answer.'))
    }, options.timeoutMs ?? 10_000)
    function onMessage (event: MessageEvent) {
      const message = event.data as Partial<ConnectMessage> | null
      if (event.source !== window.parent || message?.protocol !== protocolVersion || message.type !== 'connect' || !event.ports[0] || !message.context) {
        return
      }
      cleanup()
      resolve(new StudioClient(event.ports[0], message.context))
    }
    function cleanup () {
      clearInterval(retry)
      clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
    }
    window.addEventListener('message', onMessage)
    send()
  })
}

/**
 * Applies Studio's theme to the document as CSS custom properties
 * (`--studio-color-primary`, …) and `color-scheme`.
 */
export function applyTheme (theme: ThemeTokens, root: HTMLElement = document.documentElement): void {
  root.style.colorScheme = theme.dark ? 'dark' : 'light'
  for (const [name, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--studio-color-${name}`, value)
  }
}

/** Picks the text for a locale from a localized label, falling back to English and then to any language. */
export function localized (text: Record<string, string>, locale: string): string {
  return text[locale] ?? text[locale.split('-', 1)[0]!] ?? text.en ?? Object.values(text)[0] ?? ''
}

/**
 * Keeps the frame as tall as an element (the document by default), for views
 * that Studio embeds next to others, e.g. on a shell's overview. Returns a
 * function that stops following.
 */
export function fitHeight (client: StudioClient, element: HTMLElement = document.documentElement): () => void {
  let last = -1
  const update = () => {
    const height = Math.ceil(element.getBoundingClientRect().height)
    if (height !== last) {
      last = height
      void client.ui.setHeight(height)
    }
  }
  const observer = new ResizeObserver(update)
  observer.observe(element)
  update()
  return () => observer.disconnect()
}
