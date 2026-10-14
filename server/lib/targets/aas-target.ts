import type {
  AccessDocument,
  AccessGrant,
  ChangePage,
  ConceptDescriptionSummary,
  ConcurrencyMode,
  EffectiveRights,
  ElementHit,
  ElementValueInput,
  ExportFormat,
  InvitationResult,
  Invocation,
  Page,
  ShellSearch,
  ShellSearchPage,
  ShellSummary,
  TargetCapabilities,
} from '#shared/contract'
import type { JsonObject } from '../aas/outline'
import type { SyncPlan, SyncStep } from '../aas/sync'

/** An element as read, with the revision token a write must be based on. */
export interface ElementSnapshot {
  value: JsonObject
  revision: string
  concurrency: ConcurrencyMode
}

/** File content with its media type, e.g. an attachment, a thumbnail or an export. */
export interface BinaryContent {
  bytes: Uint8Array
  contentType: string
  fileName: string | null
}

export interface ChangesQuery {
  after?: string
  since?: string
  subjects?: string[]
  limit: number
}

/** Optional target features that Studio detects (they depend on the server's configuration). */
/**
 * The AAS operations the Studio API needs, independent of where the data
 * lives (ADR 0003). Implemented by live infrastructures and desktop AASX
 * workspaces; route handlers only see this interface. Operations a target
 * cannot do fail with `unsupported_operation`, and its capabilities say so
 * beforehand.
 */
export interface AasTarget {
  readonly capabilities: TargetCapabilities

  listShells: (limit: number, cursor: string | undefined) => Promise<Page<ShellSummary>>
  shell: (id: string) => Promise<JsonObject>
  /** Submodel identifiers referenced by a shell. */
  submodelIds: (shellId: string) => Promise<string[]>
  /** The submodel without its elements. */
  submodelMetadata: (id: string) => Promise<JsonObject>
  submodel: (id: string) => Promise<JsonObject>
  element: (submodelId: string, idShortPath: string) => Promise<ElementSnapshot>
  /**
   * Sets the value of a `Property` or `MultiLanguageProperty`. Fails with
   * `revision_conflict` when the element changed since `revision` was read.
   */
  setElementValue: (submodelId: string, idShortPath: string, value: ElementValueInput['value'], revision: string) => Promise<ElementSnapshot>

  /** Deletes a shell; its submodels stay. */
  deleteShell: (id: string) => Promise<void>
  /** The shell's thumbnail, or `null` if it has none. */
  thumbnail: (shellId: string) => Promise<BinaryContent | null>
  /** The content of a File element. */
  attachment: (submodelId: string, idShortPath: string) => Promise<BinaryContent>
  /** Replaces the content of a File element, based on the revision the user saw. */
  replaceAttachment: (submodelId: string, idShortPath: string, file: BinaryContent, revision: string) => Promise<ElementSnapshot>
  invoke: (submodelId: string, idShortPath: string, args: Array<{ idShort: string, value: string | null }>, async: boolean) => Promise<Invocation>
  invocation: (submodelId: string, idShortPath: string, handle: string) => Promise<Invocation>
  conceptDescriptions: (limit: number, cursor: string | undefined) => Promise<Page<ConceptDescriptionSummary>>
  /** Shells matching the search field's expression or a raw query (MVP-4 plan, S2). */
  searchShells: (search: ShellSearch, limit: number, cursor: string | undefined) => Promise<ShellSearchPage>
  /** Submodel elements whose idShort matches a text, with the shell they belong to where it is known. */
  searchElements: (text: string, limit: number) => Promise<ElementHit[]>
  lookupShells: (assetId: string) => Promise<ShellSummary[]>
  exportShell: (shellId: string, format: ExportFormat) => Promise<BinaryContent>
  /** Adds an already validated AASX, JSON or XML environment. */
  upload: (file: BinaryContent) => Promise<void>
  /** Descriptors and asset links after an upload or delete, where Studio writes them (MVP-4 plan, I5). */
  registerShells: (shellIds: string[], plan: SyncPlan) => Promise<SyncStep[]>
  unregisterShell: (shellId: string, plan: SyncPlan) => Promise<SyncStep[]>
  /** The submodel as it was at `date` (ISO 8601). */
  submodelAt: (id: string, date: string) => Promise<JsonObject>
  changes: (query: ChangesQuery) => Promise<ChangePage>
  access: (shellId: string) => Promise<AccessDocument>
  setAccess: (shellId: string, grants: AccessGrant[], revision: string) => Promise<AccessDocument>
  effectiveRights: (shellId: string) => Promise<EffectiveRights>
  invite: (shellId: string, relation: string, expiresAt: string, maxUses: number) => Promise<InvitationResult>
  /** Accepts an invitation as the signed-in user. */
  acceptInvitation: (token: string) => Promise<void>
}
