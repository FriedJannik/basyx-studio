import type { ConceptDescriptionSummary, ElementHit, ElementValueInput, Page, ShellSummary } from '#shared/contract'
import type { LocatorStep } from '../aas/keys'
import type { JsonObject } from '../aas/outline'
import type { BinaryContent, ElementSnapshot } from '../targets/aas-target'
import { matchesShell, parseSearch } from '#shared/search/expression'
import { toConceptDescriptionSummary } from '../aas/basyx-go'
import { parseLocator } from '../aas/keys'
import { submodelIdOf, toShellSummary } from '../aas/shells'
import { elementHits } from '../aas/tree'
import { withValue } from '../aas/values'
import { StudioProblem } from '../problem'
import { contentHash, parseRevision, revisionOf } from '../targets/revision'

function objects (value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => typeof item === 'object' && item !== null && !Array.isArray(item)) : []
}

function notFound (): never {
  throw new StudioProblem('target_resource_not_found')
}

/** Elements below a submodel element that the AAS API addresses by idShort. */
function namedChildren (element: JsonObject): unknown {
  switch (element.modelType) {
    case 'SubmodelElementCollection': {
      return element.value
    }
    case 'Entity': {
      return element.statements
    }
    case 'AnnotatedRelationshipElement': {
      return element.annotations
    }
    default: {
      return undefined
    }
  }
}

/** Access to the files (parts) of the package behind a workspace. */
export interface PackageFiles {
  /** A part by its path in the package, e.g. `/aasx-suppl/manual.pdf`. */
  read: (path: string) => Promise<BinaryContent | null>
  /** Stores a supplementary file and returns its path in the package. */
  write: (fileName: string, file: BinaryContent) => Promise<string>
  /** The package thumbnail, if any. */
  thumbnail: () => Promise<BinaryContent | null>
}

const noFiles: PackageFiles = {
  read: async () => null,
  write: async () => {
    throw new StudioProblem('unsupported_operation', 'This workspace cannot store files.')
  },
  thumbnail: async () => null,
}

function paged<T> (items: T[], limit: number, cursor: string | undefined): Page<T> {
  const start = cursor === undefined ? 0 : Number(cursor)
  if (!Number.isInteger(start) || start < 0 || start > items.length) {
    throw new StudioProblem('invalid_request', 'Malformed cursor.')
  }
  const end = Math.min(start + limit, items.length)
  return {
    items: items.slice(start, end),
    page: { nextCursor: end < items.length ? String(end) : null, hasMore: end < items.length },
  }
}

/**
 * The AAS environment of an opened package, with the operations of a
 * Studio target. Only the Workspace Worker holds it; one worker call runs at
 * a time, so a revision check and the following change cannot interleave.
 */
export class WorkspaceModel {
  /** Increments with every applied change. */
  revision = 0
  savedRevision = 0

  constructor (readonly environment: JsonObject, private readonly files: PackageFiles = noFiles) {}

  get unsavedChanges (): boolean {
    return this.revision !== this.savedRevision
  }

  listShells (limit: number, cursor: string | undefined): Page<ShellSummary> {
    const page = paged(objects(this.environment.assetAdministrationShells), limit, cursor)
    return { items: page.items.map(shell => toShellSummary(shell)), page: page.page }
  }

  shell (id: string): JsonObject {
    return objects(this.environment.assetAdministrationShells).find(shell => shell.id === id) ?? notFound()
  }

  submodelIds (shellId: string): string[] {
    return objects(this.shell(shellId).submodels)
      .map(reference => submodelIdOf(reference))
      .filter((id): id is string => id !== null)
  }

  submodel (id: string): JsonObject {
    return objects(this.environment.submodels).find(submodel => submodel.id === id) ?? notFound()
  }

  submodelMetadata (id: string): JsonObject {
    const { submodelElements: _, ...metadata } = this.submodel(id)
    return metadata
  }

  element (submodelId: string, idShortPath: string): ElementSnapshot {
    const { container, index } = this.#locate(submodelId, idShortPath)
    const value = container[index] as JsonObject
    return { value, revision: revisionOf(value), concurrency: 'strong' }
  }

  setElementValue (submodelId: string, idShortPath: string, value: ElementValueInput['value'], revision: string): ElementSnapshot {
    const token = parseRevision(revision)
    const { container, index } = this.#locate(submodelId, idShortPath)
    if (contentHash(container[index]) !== token.hash) {
      throw new StudioProblem('revision_conflict')
    }
    const { json } = withValue(container[index] as JsonObject, value)
    container[index] = json
    this.revision++
    return { value: json, revision: revisionOf(json), concurrency: 'strong' }
  }

  deleteShell (id: string): void {
    const shells = objects(this.environment.assetAdministrationShells)
    const remaining = shells.filter(shell => shell.id !== id)
    if (remaining.length === shells.length) {
      notFound()
    }
    this.environment.assetAdministrationShells = remaining
    this.revision++
  }

  /** The shell's default thumbnail, else the package thumbnail. */
  async thumbnail (shellId: string): Promise<BinaryContent | null> {
    const information = (this.shell(shellId).assetInformation ?? {}) as JsonObject
    const thumbnail = (information.defaultThumbnail ?? {}) as JsonObject
    if (typeof thumbnail.path === 'string') {
      const file = await this.files.read(thumbnail.path)
      if (file) {
        return file
      }
    }
    return this.files.thumbnail()
  }

  async attachment (submodelId: string, idShortPath: string): Promise<BinaryContent> {
    const { value } = this.element(submodelId, idShortPath)
    if (value.modelType !== 'File') {
      throw new StudioProblem('unsupported_operation', 'Only File elements have an attachment.')
    }
    const location = typeof value.value === 'string' ? value.value : ''
    const file = location ? await this.files.read(location) : null
    if (!file) {
      throw new StudioProblem('target_resource_not_found', 'The file is not part of the package.')
    }
    return { ...file, contentType: typeof value.contentType === 'string' ? value.contentType : file.contentType }
  }

  async replaceAttachment (submodelId: string, idShortPath: string, file: BinaryContent, revision: string): Promise<ElementSnapshot> {
    const token = parseRevision(revision)
    const { container, index } = this.#locate(submodelId, idShortPath)
    const current = container[index] as JsonObject
    if (contentHash(current) !== token.hash) {
      throw new StudioProblem('revision_conflict')
    }
    if (current.modelType !== 'File') {
      throw new StudioProblem('unsupported_operation', 'Only File elements have an attachment.')
    }
    const location = await this.files.write(file.fileName ?? 'file', file)
    const json = { ...current, value: location, contentType: file.contentType }
    container[index] = json
    this.revision++
    return { value: json, revision: revisionOf(json), concurrency: 'strong' }
  }

  conceptDescriptions (limit: number, cursor: string | undefined): Page<ConceptDescriptionSummary> {
    const page = paged(objects(this.environment.conceptDescriptions), limit, cursor)
    return { items: page.items.map(cd => toConceptDescriptionSummary(cd)), page: page.page }
  }

  /**
   * Shells matching a search field expression, evaluated here with the same
   * semantics as the query Studio builds for live targets (MVP-4 plan, S2).
   */
  searchShells (expression: string, limit: number, cursor: string | undefined): Page<ShellSummary> {
    const parsed = parseSearch(expression)
    const matches = objects(this.environment.assetAdministrationShells).filter(shell => matchesShell(shell, parsed))
    const page = paged(matches, limit, cursor)
    return { items: page.items.map(shell => toShellSummary(shell)), page: page.page }
  }

  /** Submodel elements whose idShort contains a text (case-insensitive), with the shell that references them. */
  searchElements (text: string, limit: number): ElementHit[] {
    const owner = new Map<string, { key: string, label: string }>()
    for (const shell of objects(this.environment.assetAdministrationShells)) {
      const summary = toShellSummary(shell)
      for (const id of this.submodelIds(summary.id)) {
        if (!owner.has(id)) {
          owner.set(id, { key: summary.key, label: summary.idShort ?? summary.id })
        }
      }
    }
    const elements: ElementHit[] = []
    for (const submodel of objects(this.environment.submodels)) {
      elements.push(...elementHits(submodel, text, limit - elements.length, owner.get(String(submodel.id)) ?? null))
      if (elements.length >= limit) {
        break
      }
    }
    return elements
  }

  /** The array holding the addressed element and its position, so it can be replaced. */
  #locate (submodelId: string, idShortPath: string): { container: unknown[], index: number } {
    const steps: LocatorStep[] = parseLocator(idShortPath)
    let container: unknown = this.submodel(submodelId).submodelElements
    let index = -1
    for (const step of steps) {
      if (index !== -1) {
        const parent = (container as unknown[])[index] as JsonObject
        container = step.kind === 'index'
          ? (parent.modelType === 'SubmodelElementList' ? parent.value : undefined)
          : namedChildren(parent)
      }
      if (!Array.isArray(container)) {
        notFound()
      }
      if (step.kind === 'index') {
        index = step.index < container.length ? step.index : notFound()
      } else if (step.kind === 'idShort') {
        index = container.findIndex(item => (item as JsonObject | null)?.idShort === step.idShort)
        if (index === -1) {
          notFound()
        }
      } else {
        throw new StudioProblem('invalid_request', 'Operation variables are not addressable.')
      }
    }
    return { container: container as unknown[], index }
  }
}
