import type { Node } from '../../../shared/aas'
import type { ModelFormat } from '@basyx/model-viewer'
import type { JsonObject } from '@basyx/studio-sdk'
import { detectModelFormat } from '@basyx/model-viewer'
import { childrenOf, langText } from '../../../shared/aas'

// Reading IDTA 02026-1-0 "Provision of 3D Models" (Models3D, templates 1.0,
// 1.0.1 and 1.0.2, which differ only in qualifier kinds). Ported from the
// BaSyx AAS Web UI (aas-web-ui/src/components/Plugins/Submodels/
// Models3D_v1_0/utils/parseModel3D.ts at ed7ad908,
// https://github.com/eclipse-basyx/basyx-aas-web-ui), © the Eclipse BaSyx
// Authors, MIT License, and extended to every element of the template.
//
// Elements are found by idShort (a trailing number allowed: `IsPrimary01`)
// or by the last segment of their semantic ID. The specification and the
// template JSON spell some semantic IDs differently (`FileDomainId` and
// `FileDomaniId`, `isPrimary`, `FileVersionID`, `NegModelPurpos`,
// `LevelDescription`, `…ApplicationQualifier1/0`), so all spellings are
// accepted. Lists may also be collections, as in older AASX files.

export interface LangString {
  language: string
  text: string
}

/** A File element: its idShortPath (for `readFile`), media type and value. */
export interface FileRef {
  path: string
  contentType: string
  value: string
}

export interface Organization {
  name: string
  officialName: string
}

export interface Api {
  version: string
  documentationUrl: string
  specificationUrl: string
}

export interface Application {
  name: string
  version: string
  qualifier: string
  vendor: Organization | null
  apis: Api[]
}

export interface ExternalFile {
  url: string
  identifier: string
  host: Organization | null
  apis: Api[]
}

export interface Model3DVersion {
  key: string
  title: LangString[]
  fileName: string
  versionId: string
  status: string
  setDate: string
  format: { name: string, version: string, qualifier: string }
  preview: FileRef | null
  digital: FileRef | null
  externalFiles: ExternalFile[]
  sourceApplication: Application | null
  providingOrganization: Organization | null
  /** Targets of `BasedOn` and `RefersTo` references, as text. */
  basedOn: string[]
  refersTo: string[]
}

export interface FileId {
  domain: string
  value: string
  primary: boolean
}

export interface Classification {
  id: string
  name: LangString[]
  system: string
}

export interface Vector {
  x: string
  y: string
  z: string
}

export interface ReferenceSystem {
  offset: Vector | null
  orientation: Vector[]
}

export interface BoundingBox {
  kind: string
  size: Vector | null
  referenceSystem: ReferenceSystem | null
}

export interface Model3DEntry {
  key: string
  ids: FileId[]
  isPrimary: boolean
  versions: Model3DVersion[]
  consumingApplications: Application[]
  classifications: Classification[]
  positivePurposes: string[]
  negativePurposes: string[]
  embeddedInfo: string[]
  states: string[]
  objectType: string
  origin: string
  simplification: { description: string, reducedElements: string[], derivedFrom: string } | null
  representation: string
  lengthUnit: string
  boundingBoxes: BoundingBox[]
  referenceSystems: ReferenceSystem[]
}

export const models3dSemanticId = 'https://admin-shell.io/idta/Models3D/1/0'

/** Other spellings of element names in the specification and template semantic IDs. */
const aliases: Record<string, string[]> = {
  FileDomainId: ['FileDomaniId'],
  NegModelPurpose: ['NegModelPurpos'],
  Description: ['LevelDescription'],
  ApiDocumentationUrl: ['ApiDocumentation'],
}

/** The name a semantic ID gives its element: `…/FileVersion/FileName/1/0` → `filename`. */
function semanticName (element: JsonObject): string {
  const keys = (element.semanticId as { keys?: Array<{ value?: unknown }> } | undefined)?.keys ?? []
  const value = typeof keys[0]?.value === 'string' ? keys[0].value : ''
  return value.replace(/\/?\d+\/\d+\/?$/, '').split('/').pop()?.toLowerCase() ?? ''
}

function matches (element: JsonObject, name: string): boolean {
  const names = new Set([name, ...(aliases[name] ?? [])].map(entry => entry.toLowerCase()))
  const idShort = String(element.idShort ?? '').toLowerCase().replace(/\d+$/, '')
  return names.has(idShort) || names.has(semanticName(element))
}

function children (node: Node | undefined): Node[] {
  return node ? childrenOf(node) : []
}

function all (node: Node | undefined, name: string): Node[] {
  return children(node).filter(entry => matches(entry.element, name))
}

function child (node: Node | undefined, name: string): Node | undefined {
  return all(node, name)[0]
}

/** The items of a list, or of a collection used as one. */
function items (node: Node | undefined, name: string): Node[] {
  return children(child(node, name))
}

function text (node: Node | undefined, name: string): string {
  const value = child(node, name)?.element.value
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value).trim() : ''
}

function langStrings (node: Node | undefined, name: string): LangString[] {
  const value = child(node, name)?.element.value
  return Array.isArray(value) ? (value as unknown[]).filter((entry): entry is LangString => typeof (entry as LangString)?.text === 'string') : []
}

function textList (node: Node | undefined, name: string): string[] {
  return items(node, name)
    .map(entry => entry.element.value)
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
}

function isTrue (value: string): boolean {
  return value.toLowerCase() === 'true' || value === '1'
}

function fileRef (node: Node | undefined, name: string): FileRef | null {
  const file = child(node, name)
  const value = typeof file?.element.value === 'string' ? file.element.value.trim() : ''
  return file && file.element.modelType === 'File' && value !== ''
    ? { path: file.path, contentType: String(file.element.contentType ?? ''), value }
    : null
}

/** A reference's keys as text, e.g. `urn:sm:models / Model3D[0]`. */
function referenceText (value: unknown): string {
  const keys = (value as { keys?: Array<{ value?: unknown }> } | null)?.keys ?? []
  return keys.map(key => String(key.value ?? '')).filter(Boolean).join(' / ')
}

function references (node: Node | undefined, name: string): string[] {
  return items(node, name).map(entry => referenceText(entry.element.value)).filter(Boolean)
}

function organization (node: Node | undefined): Organization | null {
  const parsed = { name: text(node, 'OrganizationName'), officialName: text(node, 'OrganizationOfficialName') }
  return parsed.name || parsed.officialName ? parsed : null
}

function apis (node: Node | undefined): Api[] {
  return items(node, 'Api')
    .map(api => ({ version: text(api, 'ApiVersion'), documentationUrl: text(api, 'ApiDocumentationUrl'), specificationUrl: text(api, 'ApiSpecificationUrl') }))
    .filter(api => api.version || api.documentationUrl || api.specificationUrl)
}

function application (node: Node | undefined): Application | null {
  if (!node) {
    return null
  }
  const parsed = {
    name: text(node, 'ApplicationName'),
    version: text(node, 'ApplicationVersion'),
    qualifier: text(node, 'ApplicationQualifier'),
    vendor: organization(child(node, 'VendorOrganization')),
    apis: apis(node),
  }
  return parsed.name || parsed.version || parsed.qualifier || parsed.vendor ? parsed : null
}

function vector (node: Node | undefined): Vector | null {
  const parsed = { x: text(node, 'X'), y: text(node, 'Y'), z: text(node, 'Z') }
  return node && (parsed.x || parsed.y || parsed.z) ? parsed : null
}

function referenceSystem (node: Node | undefined): ReferenceSystem | null {
  if (!node) {
    return null
  }
  const parsed = {
    offset: vector(child(node, 'CartOffsetVector')),
    orientation: items(node, 'NormOrientationVector').map(entry => vector(entry)).filter((entry): entry is Vector => entry !== null),
  }
  return parsed.offset || parsed.orientation.length > 0 ? parsed : null
}

function parseVersion (node: Node, key: string): Model3DVersion {
  const format = child(node, 'FileFormat')
  return {
    key,
    title: langStrings(node, 'Title'),
    fileName: text(node, 'FileName'),
    versionId: text(node, 'FileVersionId'),
    status: text(node, 'StatusValue'),
    setDate: text(node, 'SetDate'),
    format: { name: text(format, 'FormatName'), version: text(format, 'FormatVersion'), qualifier: text(format, 'FormatQualifier') },
    preview: fileRef(node, 'PreviewFile'),
    digital: fileRef(node, 'DigitalFile'),
    externalFiles: items(node, 'ExternalFile')
      .map(entry => ({ url: text(entry, 'ExternalUrl'), identifier: text(entry, 'FileIdentifier'), host: organization(child(entry, 'HostOrganization')), apis: apis(entry) }))
      .filter(entry => entry.url !== ''),
    sourceApplication: application(child(node, 'SourceApplication')),
    providingOrganization: organization(child(node, 'ProvidingOrganization')),
    basedOn: references(node, 'BasedOn'),
    refersTo: references(node, 'RefersTo'),
  }
}

function parseModel (node: Node, index: number): Model3DEntry {
  const file = child(node, 'File')
  const capability = child(node, 'Capability')
  const geometry = child(node, 'Geometry')
  const simplification = child(capability, 'Simplification')
  const ids = items(file, 'FileId').map(entry => ({
    domain: text(entry, 'FileDomainId'),
    value: text(entry, 'ValueId'),
    // The template allows several IsPrimary properties; one true is enough.
    primary: all(entry, 'IsPrimary').some(flag => isTrue(String(flag.element.value ?? ''))),
  }))
  return {
    key: `model-${index}`,
    ids,
    isPrimary: ids.some(id => id.primary),
    versions: items(file, 'FileVersion').map((entry, versionIndex) => parseVersion(entry, `model-${index}-version-${versionIndex}`)),
    consumingApplications: items(file, 'ConsumingApplication').map(entry => application(entry)).filter((entry): entry is Application => entry !== null),
    classifications: items(file, 'FileClassification').map(entry => ({
      id: text(entry, 'ClassId'),
      name: langStrings(entry, 'ClassName'),
      system: text(entry, 'ClassificationSystem'),
    })),
    positivePurposes: textList(capability, 'PosModelPurpose'),
    negativePurposes: textList(capability, 'NegModelPurpose'),
    embeddedInfo: textList(capability, 'EmbeddedInfo'),
    states: textList(capability, 'State'),
    objectType: text(capability, 'ObjectType'),
    origin: text(capability, 'Origin'),
    simplification: simplification
      ? {
          description: text(simplification, 'Description'),
          reducedElements: textList(simplification, 'ReducedElements'),
          derivedFrom: referenceText(child(simplification, 'DerivedFrom')?.element.value),
        }
      : null,
    representation: text(geometry, 'Representation'),
    lengthUnit: text(geometry, 'LengthUnit'),
    boundingBoxes: items(geometry, 'CartBoundingBox').map(entry => ({
      kind: text(entry, 'BoundingBoxKind'),
      size: vector(child(entry, 'CartBoundingVector')),
      referenceSystem: referenceSystem(child(entry, 'CartRefSystem')),
    })),
    referenceSystems: items(geometry, 'CartRefSystem').map(entry => referenceSystem(entry)).filter((entry): entry is ReferenceSystem => entry !== null),
  }
}

/** The models of a Models3D submodel; the `Model3D` list items have no idShort. */
export function parseModels3D (submodel: JsonObject): Model3DEntry[] {
  return items({ element: submodel, path: '' }, 'Model3D')
    .filter(entry => entry.element.modelType === 'SubmodelElementCollection')
    .map((entry, index) => parseModel(entry, index))
}

/** The version shown first: the latest `SetDate` (YYYY-MM-DD), the last listed on equal dates. */
export function latestVersion (versions: Model3DVersion[]): Model3DVersion | undefined {
  return versions.reduce<Model3DVersion | undefined>((latest, version) => (!latest || version.setDate >= latest.setDate ? version : latest), undefined)
}

/** Primary models first, otherwise in the submodel's order. */
export function sortModels (models: Model3DEntry[]): Model3DEntry[] {
  return models.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
}

export function pickText (values: LangString[], locale: string): string {
  return langText(values, locale)
}

export function versionTitle (version: Model3DVersion | undefined, model: Model3DEntry, index: number, locale: string): string {
  const primaryId = model.ids.find(id => id.primary) ?? model.ids[0]
  return pickText(version?.title ?? [], locale) || version?.fileName || primaryId?.value || `3D model ${index + 1}`
}

/** The format the viewer reads, from the file, its name or the declared FileFormat. */
export function viewerFormat (version: Model3DVersion | undefined): ModelFormat | null {
  if (!version?.digital) {
    return null
  }
  return detectModelFormat({ contentType: version.digital.contentType, fileName: version.digital.value })
    ?? detectModelFormat({ fileName: version.fileName })
    ?? formatFromName(version.format.name, version.format.qualifier)
}

function formatFromName (name: string, qualifier: string): ModelFormat | null {
  const value = `${name} ${qualifier}`.toLowerCase()
  if (/\bifc/.test(value)) {
    return 'ifc'
  }
  if (/\b(?:step|stp|ap2(?:03|14|42)|10303)\b/.test(value)) {
    return 'step'
  }
  if (/\b(?:gltf|glb)\b/.test(value)) {
    return /\b(?:glb|binary)\b/.test(value) ? 'glb' : 'gltf'
  }
  if (/\bstl\b/.test(value)) {
    return 'stl'
  }
  if (/\b(?:obj|wavefront)\b/.test(value)) {
    return 'obj'
  }
  return null
}
