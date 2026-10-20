// The `studio-sdk/0` protocol between an app frame and BaSyx Studio. Studio
// validates every message it receives against its own schemas
// (shared/contract/apps.ts in the Studio repository); these types describe
// the same contract for app authors.

export const protocolVersion = 'studio-sdk/0'

/** Version of the Studio app API that manifests name in `studioApi`. */
export const studioAppApiVersion = '0.1.2'

/** The largest file `studio.ui.readFile` hands to an app (200 MiB). */
export const readFileMaxBytes = 200 * 1024 * 1024

export const permissions = [
  'studio.aas.read',
  'studio.aas.write',
  'studio.ui.notifications',
  'studio.ui.navigation',
  /** Copying text to the user's clipboard after a click in the app. */
  'studio.ui.clipboard',
  /**
   * Reading files that AAS content names by an http(s) address at another
   * host. The user's browser fetches them, without credentials or referrer,
   * so that host learns the user's address and which file they view.
   */
  'studio.ui.externalFiles',
  'studio.backend',
  /** Desktop only, bundled first-party apps only: local BaSyx instances on Docker or Podman (ADR 0033). */
  'studio.containers',
  /** Bundled first-party apps only: time series of IDTA Time Series Data submodels, also from databases (ADR 0040). */
  'studio.timeseries.read',
] as const
export type Permission = (typeof permissions)[number]

export type LocalizedText = Record<string, string>

export interface AppManifest {
  manifestVersion: 0
  id: string
  version: string
  publisher: { name: string, url?: string }
  title: LocalizedText
  description?: LocalizedText
  studioApi: string
  runtimes: ('hosted' | 'desktop')[]
  permissions: Permission[]
  backend?: { runtime: 'deno', entry: string }
  /**
   * What the app's pages may run beyond scripts (ADR 0038): WebAssembly
   * modules, and workers started from `blob:` URLs. An administrator sees
   * both at install.
   */
  sandbox?: AppSandbox
  contributes: {
    submodelViews?: SubmodelViewContribution[]
    modules?: ModuleContribution[]
  }
}

export interface AppSandbox {
  /** Compile and run WebAssembly (CSP `'wasm-unsafe-eval'`), e.g. for file parsers. */
  webAssembly?: boolean
  /** Start dedicated workers from `blob:` URLs, e.g. to parse large files off the page. */
  workers?: boolean
}

/** Vuetify's breakpoint names, smallest first. */
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'

export interface SubmodelViewContribution {
  id: string
  title: LocalizedText
  entry: string
  semanticIds: string[]
  /**
   * Default width of the view as a widget on a shell's Overview, in columns
   * of 12, per breakpoint of the Overview's width (Vuetify's names, as in
   * `v-col`). A breakpoint without a value uses the nearest smaller one;
   * without any, the view starts half wide from `lg` and full width below.
   * Widgets share their row, so the widths are a starting point.
   */
  columns?: Partial<Record<Breakpoint, number>>
}

export type ModuleContext = 'global' | 'target' | 'shell'

export interface ModuleContribution {
  id: string
  title: LocalizedText
  icon?: string
  entry: string
  route: string
  context: ModuleContext
}

export type JsonObject = Record<string, unknown>

export interface ThemeTokens {
  dark: boolean
  /** Vuetify theme colors as CSS color values, e.g. `primary`, `surface`, `on-surface`. */
  colors: Record<string, string>
}

/** Where the frame runs. Sent on connect and again with every change. */
export interface AppContext {
  protocol: typeof protocolVersion
  installationId: string
  appId: string
  contribution: { kind: 'submodelView' | 'module', id: string }
  /** The active target; every AAS call goes to it. `null` for global modules outside a target. */
  target: { id: string, name: string, write: boolean, persistence: 'immediate' | 'explicit_save' } | null
  shell: { id: string } | null
  submodel: { id: string, semanticId: string | null } | null
  /** The module's sub-path below its route (nested routes), without leading slash. */
  subPath: string
  /** Studio's mode: apps show edit controls only in `edit` (MVP-4). */
  mode: 'view' | 'edit'
  /** True in the full-screen dialog that `studio.ui.openFullscreen` opens. */
  fullscreen: boolean
  /**
   * In that dialog, the `state` the view passed to `openFullscreen`, e.g.
   * what the user had selected; `''` otherwise (Studio app API 0.1.1).
   */
  viewState: string
  locale: string
  theme: ThemeTokens
}

export type ConcurrencyMode = 'strong' | 'best_effort'

export interface ElementSnapshot {
  value: JsonObject
  /** Opaque revision; pass it unchanged to `setElementValue`. */
  revision: string
  concurrency: ConcurrencyMode
}

/** The content of a File element (`studio.ui.readFile`). */
export interface FileContent {
  bytes: Uint8Array
  /** The media type Studio received, e.g. `model/gltf-binary`. */
  contentType: string
}

export interface ShellSummary {
  id: string
  idShort: string | null
  displayName: { language: string, text: string }[]
  assetKind: string | null
  globalAssetId: string | null
}

export interface SubmodelSummary {
  id: string
  idShort: string | null
  semanticId: string | null
  status: 'available' | 'forbidden' | 'not_found' | 'error'
}

export interface Page<T> {
  items: T[]
  page: { nextCursor: string | null, hasMore: boolean }
}

/** Value of a Property (string or `null`) or of a MultiLanguageProperty. */
export type ElementValue = string | null | { language: string, text: string }[]

// Time series of IDTA 02008 Time Series Data submodels (`studio.timeseries.read`,
// ADR 0040). Studio reads the submodel itself and, for a LinkedSegment, the
// database of a connection of the target; the app names records only.

export interface TimeSeriesReadParams {
  submodelId: string
  /** The idShort of the segment in `Segments`. */
  segment: string
  /** The idShort of the `Metadata.Record` entry that holds the time. */
  time: string
  /** The idShorts of the records to read, one series each (up to 20). */
  values: string[]
  /**
   * RFC 3339 times. `anchor: 'latest'` moves the range to end at the latest
   * point of an InternalSegment's or ExternalSegment's data; LinkedSegments
   * are always read for the range as given.
   */
  range: { start: string, stop: string, anchor?: 'fixed' | 'latest' }
  /** Points per series (10 to 20,000, default 5,000); more are thinned out evenly. */
  maxPoints?: number
}

export type TimeSeriesWarningCode = 'value_missing' | 'time_missing' | 'points_skipped' | 'points_reduced'

export interface TimeSeriesResult {
  kind: 'internal' | 'linked' | 'external'
  /** The range the series cover. */
  range: { start: string, stop: string }
  /** One per selected value, in order. */
  series: { key: string, unit: string | null, points: [epochMs: number, value: number][] }[]
  warnings: { code: TimeSeriesWarningCode, params: Record<string, string | number> }[]
}

// Local BaSyx instances (`studio.containers`, ADR 0033). Studio validates the
// same shapes with the schemas in shared/contract/containers.ts.

export type StackComponentId = 'database' | 'schema' | 'keycloak' | 'environment' | 'aasRegistry' | 'submodelRegistry' | 'discovery'

export interface StackSpec {
  format: 'basyx-stack/1'
  name: string
  preset: 'quick' | 'full' | 'secured'
  topology: 'single' | 'separate'
  security: { mode: 'none' } | { mode: 'keycloak', access: 'roles' | 'sharing' }
  persistence: 'keep' | 'ephemeral'
  features: { history: boolean, eventFeed: boolean, registrySync: boolean, discoverySync: boolean }
  network: { exposure: 'local' | 'network', basePort: number | null }
  images: { channel: 'tested' | 'latest', digests?: Partial<Record<StackComponentId, string>> }
  restart: 'always' | 'manual'
  aasxFiles: string[]
}

export interface EngineInfo {
  host: string
  kind: 'docker' | 'podman'
  name: string
  source: 'settings' | 'environment' | 'context' | 'default'
  running: boolean
  version: string | null
  apiVersion: string | null
  os: string | null
  arch: string | null
  error: string | null
}

export interface Engines {
  selected: EngineInfo | null
  candidates: EngineInfo[]
  configured: string | null
}

export interface StackUrls {
  environment: string | null
  aasRegistry: string | null
  submodelRegistry: string | null
  discovery: string | null
  keycloak: string | null
}

export interface StackComponent {
  id: StackComponentId
  state: 'running' | 'starting' | 'unhealthy' | 'stopped' | 'exited' | 'missing'
  exitCode: number | null
  url: string | null
  image: string
}

export interface Stack {
  id: string
  name: string
  spec: StackSpec | null
  status: 'running' | 'busy' | 'partial' | 'stopped' | 'error' | 'missing' | 'orphan' | 'unknown'
  components: StackComponent[]
  urls: StackUrls
  infrastructureId: string | null
  engineHost: string | null
  jobId: string | null
  updateAvailable: boolean
  createdAt: string | null
}

export interface StackList {
  engineAvailable: boolean
  items: Stack[]
}

export interface StackPlan {
  spec: StackSpec
  components: StackComponentId[]
  urls: StackUrls
  images: { reference: string, present: boolean, downloadMb: number }[]
  downloadMb: number | null
  portsInUse: number[]
}

export interface JobStep {
  id: string
  state: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  progress: { current: number, total: number } | null
  note: string | null
}

export interface Job {
  id: string
  stackId: string
  kind: 'create' | 'start' | 'stop' | 'update' | 'change' | 'remove'
  state: 'running' | 'succeeded' | 'failed'
  steps: JobStep[]
  problem: Problem | null
  startedAt: string
  finishedAt: string | null
}

export interface StackWithJob {
  stack: Stack
  job: Job
}

export interface StackSignIn {
  issuer: string
  accountUrl: string
  users: { username: string, password: string, role: 'admin' | 'viewer' | 'user' }[]
  console: { url: string, username: string, password: string }
}

export interface StackLogs {
  component: StackComponentId
  text: string
  truncated: boolean
}

export interface StackImport {
  importId: string
  spec: StackSpec
  aasxFiles: string[]
  notes: ('ports_reassigned' | 'secrets_generated' | 'compose_ignored' | 'aasx_missing')[]
}

/** Files the host lets the user choose: AASX files to load, an export to import, where to save an export or logs. */
export const stackFileKinds = ['stack-aasx', 'stack-import', 'stack-export', 'stack-logs'] as const
export type StackFileKind = (typeof stackFileKinds)[number]

/** The settings a new stack of a preset starts with; the wizard starts from these. */
export function presetSpec (preset: StackSpec['preset'], name: string): StackSpec {
  return {
    format: 'basyx-stack/1',
    name,
    preset,
    topology: preset === 'full' ? 'separate' : 'single',
    security: preset === 'secured' ? { mode: 'keycloak', access: 'roles' } : { mode: 'none' },
    persistence: 'ephemeral',
    features: { history: true, eventFeed: true, registrySync: true, discoverySync: true },
    network: { exposure: 'local', basePort: null },
    images: { channel: 'tested' },
    restart: 'always',
    aasxFiles: [],
  }
}

export interface PickedFile {
  handle: string
  fileName: string
}

/** Parameters and results of every capability method. */
export interface Methods {
  'studio.ui.getContext': { params: Record<string, never>, result: AppContext }
  'studio.ui.notify': { params: { message: string, level?: 'info' | 'success' | 'warning' | 'error' }, result: null }
  'studio.ui.navigate': { params: { subPath: string }, result: null }
  /** Asks Studio to size the frame to the app's content height in CSS pixels (embedded views). */
  'studio.ui.setHeight': { params: { height: number }, result: null }
  /** Opens the content of a File element of the active target in a new browser tab (or downloads it). */
  'studio.ui.openFile': { params: { submodelId: string, idShortPath: string, download?: boolean }, result: null }
  /**
   * Reads the content of a File element of the active target into the app,
   * e.g. a 3D model or an image to show. Studio's page loads it, so the
   * frame needs no network access; up to `readFileMaxBytes`.
   */
  'studio.ui.readFile': { params: { submodelId: string, idShortPath: string }, result: FileContent }
  /**
   * Reads a file that an element of the active target names by an http(s)
   * address at another host: a File whose value is such an address, or a
   * Property holding one (IDTA 02026 `ExternalUrl`). Studio reads the element
   * itself, so the app cannot name an address of its own, and Studio's page
   * fetches the file without credentials or referrer; the host must allow it
   * (CORS). Up to `readFileMaxBytes` (Studio app API 0.1.2).
   */
  'studio.ui.readExternalFile': { params: { submodelId: string, idShortPath: string }, result: FileContent }
  /**
   * Opens the same view again in a full-screen dialog of Studio; ignored
   * inside that dialog. `state` (up to 4,000 characters) reaches the view
   * there as `context.viewState`, so it can show what the user had selected.
   */
  'studio.ui.openFullscreen': { params: { state?: string }, result: null }
  'studio.aas.listShells': { params: { limit?: number, cursor?: string }, result: Page<ShellSummary> }
  'studio.aas.getShell': { params: { shellId: string }, result: JsonObject }
  'studio.aas.listSubmodels': { params: { shellId: string }, result: { items: SubmodelSummary[] } }
  'studio.aas.getSubmodel': { params: { submodelId: string }, result: JsonObject }
  'studio.aas.getElement': { params: { submodelId: string, idShortPath: string }, result: ElementSnapshot }
  'studio.aas.setElementValue': {
    params: { submodelId: string, idShortPath: string, value: ElementValue, revision: string }
    result: ElementSnapshot
  }
  'studio.backend.call': { params: { method: string, params?: unknown }, result: unknown }
  /** Opens a target in Studio. */
  'studio.ui.openTarget': { params: { targetId: string }, result: null }
  /** Opens an http(s) URL in the system browser. */
  /** Needs a click in the app just before. Only https, or http to this computer (127.0.0.1, localhost, [::1]). */
  'studio.ui.openExternal': { params: { url: string }, result: null }
  /** Copies text to the clipboard; needs a click in the app just before. */
  'studio.ui.copyText': { params: { text: string }, result: null }
  'studio.containers.listEngines': { params: Record<string, never>, result: Engines }
  /** Uses this engine (`unix:///…` or `npipe:////./pipe/…`); `null` picks automatically. */
  'studio.containers.selectEngine': { params: { host: string | null }, result: Engines }
  'studio.containers.listStacks': { params: Record<string, never>, result: StackList }
  'studio.containers.getStack': { params: { stackId: string }, result: Stack }
  /** What a spec would create: components, URLs, downloads. `stackId` when changing a stack. */
  'studio.containers.planStack': { params: { spec: StackSpec, stackId?: string }, result: StackPlan }
  /** `aasxFiles` are handles from `pickFiles` (`stack-aasx`); `importId` from `importStack`. */
  'studio.containers.createStack': { params: { spec: StackSpec, aasxFiles?: string[], importId?: string }, result: StackWithJob }
  'studio.containers.changeStack': { params: { stackId: string, spec: StackSpec, aasxFiles?: string[] }, result: StackWithJob }
  'studio.containers.startStack': { params: { stackId: string }, result: Job }
  'studio.containers.stopStack': { params: { stackId: string }, result: Job }
  /** Downloads newer images and recreates the containers; data is kept. */
  'studio.containers.updateStack': { params: { stackId: string }, result: Job }
  'studio.containers.removeStack': { params: { stackId: string, deleteData: boolean, removeInfrastructure: boolean }, result: Job }
  'studio.containers.getJob': { params: { jobId: string }, result: Job }
  'studio.containers.getLogs': { params: { stackId: string, component: StackComponentId, tail?: number }, result: StackLogs }
  /** Writes the last 500 lines to a file chosen with `pickFiles` (`stack-logs`). */
  'studio.containers.saveLogs': { params: { stackId: string, component: StackComponentId, fileHandle: string }, result: { fileName: string } }
  'studio.containers.getSignIn': { params: { stackId: string }, result: StackSignIn }
  /**
   * Lets the user choose files in a native dialog, once Studio has
   * authorized the call; `files` is empty when cancelled. `suggestedName`
   * prefills a save dialog.
   */
  'studio.containers.pickFiles': { params: { kind: StackFileKind, suggestedName?: string }, result: { files: PickedFile[] } }
  /** Writes the ZIP to a file chosen with `pickFiles` (`stack-export`). */
  'studio.containers.exportStack': { params: { stackId: string, fileHandle: string }, result: { fileName: string } }
  /** Reads an exported ZIP or `basyx-stack.json` chosen with `pickFiles` (`stack-import`). */
  'studio.containers.importStack': { params: { fileHandle: string }, result: StackImport }
  /** Reads a segment of a Time Series Data submodel of the active target (Studio app API 0.1.2). */
  'studio.timeseries.read': { params: TimeSeriesReadParams, result: TimeSeriesResult }
}
export type MethodName = keyof Methods

/** The permission each method needs; `null` methods are always allowed. */
export const methodPermissions: Record<MethodName, Permission | null> = {
  'studio.ui.getContext': null,
  'studio.ui.notify': 'studio.ui.notifications',
  'studio.ui.navigate': 'studio.ui.navigation',
  'studio.ui.setHeight': null,
  'studio.ui.openFile': 'studio.aas.read',
  'studio.ui.readFile': 'studio.aas.read',
  'studio.ui.readExternalFile': 'studio.ui.externalFiles',
  'studio.ui.openFullscreen': null,
  'studio.aas.listShells': 'studio.aas.read',
  'studio.aas.getShell': 'studio.aas.read',
  'studio.aas.listSubmodels': 'studio.aas.read',
  'studio.aas.getSubmodel': 'studio.aas.read',
  'studio.aas.getElement': 'studio.aas.read',
  'studio.aas.setElementValue': 'studio.aas.write',
  'studio.backend.call': 'studio.backend',
  'studio.ui.openTarget': 'studio.ui.navigation',
  'studio.ui.openExternal': 'studio.ui.navigation',
  'studio.ui.copyText': 'studio.ui.clipboard',
  'studio.containers.listEngines': 'studio.containers',
  'studio.containers.selectEngine': 'studio.containers',
  'studio.containers.listStacks': 'studio.containers',
  'studio.containers.getStack': 'studio.containers',
  'studio.containers.planStack': 'studio.containers',
  'studio.containers.createStack': 'studio.containers',
  'studio.containers.changeStack': 'studio.containers',
  'studio.containers.startStack': 'studio.containers',
  'studio.containers.stopStack': 'studio.containers',
  'studio.containers.updateStack': 'studio.containers',
  'studio.containers.removeStack': 'studio.containers',
  'studio.containers.getJob': 'studio.containers',
  'studio.containers.getLogs': 'studio.containers',
  'studio.containers.saveLogs': 'studio.containers',
  'studio.containers.getSignIn': 'studio.containers',
  'studio.containers.pickFiles': 'studio.containers',
  'studio.containers.exportStack': 'studio.containers',
  'studio.containers.importStack': 'studio.containers',
  'studio.timeseries.read': 'studio.timeseries.read',
}

/** A failed call, in the shape of Studio's problem details. */
export interface Problem {
  code: string
  title: string
  status: number
  detail?: string
  retryable: boolean
  violations?: { path: string, message: string }[]
}

// Messages. The frame posts `hello` to its parent; Studio answers with
// `connect`, transferring a MessagePort that carries everything else.

export interface HelloMessage {
  protocol: typeof protocolVersion
  type: 'hello'
}

export interface ConnectMessage {
  protocol: typeof protocolVersion
  type: 'connect'
  context: AppContext
}

export interface RequestMessage {
  type: 'request'
  id: number
  method: string
  params: unknown
}

export type HostMessage
  = | { type: 'response', id: number, result: unknown }
    | { type: 'error', id: number, problem: Problem }
    | { type: 'context', context: AppContext }
