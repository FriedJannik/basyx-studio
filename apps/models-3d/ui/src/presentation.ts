import type { Translate } from '../../../shared/i18n'
import type { Api, Application, BoundingBox, Model3DEntry, Model3DVersion, Organization, ReferenceSystem, Vector } from './models3d'
import { pickText } from './models3d'

// What the view shows of a model, as label and value rows. Based on the
// BaSyx AAS Web UI (Models3D_v1_0/utils/presentation.ts at ed7ad908), © the
// Eclipse BaSyx Authors, MIT License, with every element of IDTA 02026.

export interface DetailRow {
  label: string
  value: string
  icon?: string
  /** An http(s) address the row opens. */
  url?: string
}

export interface DetailGroup {
  key: string
  title: string
  icon: string
  rows: DetailRow[]
}

/** Values of the specification's predefined value lists (chapter 2.3), with a translated label. */
const valueLists: Record<string, string[]> = {
  status: ['InReview', 'Released'],
  objectType: ['Component', 'Assembly'],
  origin: ['MeasureOptical', 'MeasureMechanical', 'DesignEngineering', 'DesignGenerative'],
  representation: ['SolidBody', 'WireFrame', 'Surface', 'Mesh', 'PointCloud'],
  purpose: ['Logistics', 'SimuMesh', 'VirtualCommisioning', '3DPrintingSlicer', 'Rendering'],
  embeddedInfo: ['PMI', 'ReferencePoints', 'Kinematics', 'Parametrization'],
  state: ['Prototype', 'PilotRun', 'InSeries', 'InterIn', 'InterOut'],
  reducedElements: ['ScrewJoints', 'InnerParts', 'Graphics'],
  boundingBoxKind: ['MinEnvelope', 'MaxEnvelope'],
}

/** A value list entry in the user's language; other values as they are. */
export function listValue (t: Translate, list: keyof typeof valueLists, value: string): string {
  const known = valueLists[list]!.find(entry => entry.toLowerCase() === value.toLowerCase())
  return known ? t(`values.${known}`) : value
}

function row (label: string, value: string | undefined, extra: Partial<DetailRow> = {}): DetailRow | null {
  return value && value.trim() !== '' ? { label, value, ...extra } : null
}

function compact (rows: Array<DetailRow | null>): DetailRow[] {
  return rows.filter((entry): entry is DetailRow => entry !== null)
}

const isUrl = (value: string) => /^https?:\/\//i.test(value)

function organizationText (organization: Organization | null): string {
  if (!organization) {
    return ''
  }
  return organization.officialName && organization.officialName !== organization.name
    ? `${organization.name || organization.officialName}${organization.name ? ` (${organization.officialName})` : ''}`
    : organization.name || organization.officialName
}

function applicationText (application: Application): string {
  const name = [application.name, application.version].filter(Boolean).join(' ')
  const details = [application.qualifier, organizationText(application.vendor)].filter(Boolean).join(', ')
  return details ? `${name} (${details})` : name
}

function apiRows (t: Translate, apis: Api[]): DetailRow[] {
  return apis.flatMap(api => compact([
    row(t('details.api'), api.version),
    row(t('details.apiDocumentation'), api.documentationUrl, { url: isUrl(api.documentationUrl) ? api.documentationUrl : undefined }),
    row(t('details.apiSpecification'), api.specificationUrl, { url: isUrl(api.specificationUrl) ? api.specificationUrl : undefined }),
  ]))
}

function vectorText (vector: Vector | null, unit = ''): string {
  return vector ? `${vector.x || '–'} × ${vector.y || '–'} × ${vector.z || '–'}${unit ? ` ${unit}` : ''}` : ''
}

function referenceSystemRows (t: Translate, system: ReferenceSystem | null, unit: string): DetailRow[] {
  if (!system) {
    return []
  }
  return compact([
    row(t('details.offset'), system.offset ? `(${[system.offset.x, system.offset.y, system.offset.z].join(', ')})${unit ? ` ${unit}` : ''}` : ''),
    row(t('details.orientation'), system.orientation.map(vector => `(${[vector.x, vector.y, vector.z].join(', ')})`).join(' ')),
  ])
}

/** E.g. "glTF 2.0". */
export function formatLabel (version: Model3DVersion | undefined): string {
  return [version?.format.name, version?.format.version].filter(Boolean).join(' ')
}

/** E.g. "v1.1"; versions without an ID by their position. */
export function versionLabel (t: Translate, version: Model3DVersion, index: number): string {
  return version.versionId ? `v${version.versionId}` : t('model.version', { number: index + 1 })
}

/** Status values of the value list (InReview, Released) and common other terms; negative ones win. */
export function statusColor (status: string): string | undefined {
  const value = status.replaceAll(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  if (/\b(?:obsolete|deprecated|withdrawn|rejected|invalid|retired|expired|unreleased|unapproved|not\s+(?:released|approved|published|valid|final))\b/.test(value)) {
    return 'error'
  }
  if (/\b(?:in\s+review|review|draft|progress|preliminary|proposed|pending)\b/.test(value)) {
    return 'warning'
  }
  if (/\b(?:released|approved|published|valid|final)\b/.test(value)) {
    return 'success'
  }
  return undefined
}

/** "Level of detail": the simplification's description, otherwise the geometric representation. */
export function levelOfDetail (t: Translate, model: Model3DEntry): string {
  return model.simplification?.description || (model.representation ? listValue(t, 'representation', model.representation) : '')
}

function boundingBoxText (t: Translate, box: BoundingBox, unit: string): string {
  const size = vectorText(box.size, unit)
  return box.kind ? `${size} (${listValue(t, 'boundingBoxKind', box.kind)})` : size
}

/** The facts shown next to the viewer. */
export function modelFacts (t: Translate, model: Model3DEntry): DetailRow[] {
  const box = model.boundingBoxes.find(entry => entry.size)
  return compact([
    row(t('facts.objectType'), model.objectType && listValue(t, 'objectType', model.objectType), { icon: 'mdi-shape-outline' }),
    row(t('facts.origin'), model.origin && listValue(t, 'origin', model.origin), { icon: 'mdi-pencil-ruler-outline' }),
    row(t('facts.representation'), model.representation && listValue(t, 'representation', model.representation), { icon: 'mdi-vector-polygon' }),
    row(t('facts.unit'), model.lengthUnit, { icon: 'mdi-ruler' }),
    box ? row(t('facts.boundingBox'), boundingBoxText(t, box, model.lengthUnit), { icon: 'mdi-cube-scan' }) : null,
  ])
}

/** The rest of the metadata, in the "Technical details". */
export function technicalGroups (t: Translate, model: Model3DEntry, version: Model3DVersion | undefined, locale: string): DetailGroup[] {
  const format = [formatLabel(version), version?.format.qualifier && `(${version.format.qualifier})`].filter(Boolean).join(' ')
  const groups: DetailGroup[] = [
    {
      key: 'file',
      title: t('details.file'),
      icon: 'mdi-file-cog-outline',
      rows: compact([
        row(t('details.fileName'), version?.fileName),
        row(t('details.format'), format),
        row(t('details.version'), version?.versionId),
        row(t('details.status'), version?.status && listValue(t, 'status', version.status)),
        row(t('details.date'), version?.setDate),
        row(t('details.providedBy'), organizationText(version?.providingOrganization ?? null)),
        ...model.ids.map(id => row(id.domain || t('details.identifier'), id.primary ? `${id.value} (${t('details.primary')})` : id.value)),
      ]),
    },
    {
      key: 'sources',
      title: t('details.sources'),
      icon: 'mdi-link-variant',
      rows: compact([
        ...(version?.externalFiles ?? []).flatMap(file => [
          row(organizationText(file.host) || t('details.externalFile'), file.url, { url: isUrl(file.url) ? file.url : undefined }),
          row(t('details.fileIdentifier'), file.identifier),
          ...apiRows(t, file.apis),
        ]),
        ...(version?.basedOn ?? []).map(target => row(t('details.basedOn'), target)),
        ...(version?.refersTo ?? []).map(target => row(t('details.refersTo'), target)),
      ]),
    },
    {
      key: 'applications',
      title: t('details.applications'),
      icon: 'mdi-application-cog-outline',
      rows: compact([
        row(t('details.createdWith'), version?.sourceApplication ? applicationText(version.sourceApplication) : ''),
        ...apiRows(t, version?.sourceApplication?.apis ?? []),
        ...model.consumingApplications.flatMap(application => [row(t('details.usedBy'), applicationText(application)), ...apiRows(t, application.apis)]),
      ]),
    },
    {
      key: 'classification',
      title: t('details.classification'),
      icon: 'mdi-tag-outline',
      rows: compact([
        ...model.classifications.map(classification => row(classification.system || t('details.class'), [classification.id, pickText(classification.name, locale)].filter(Boolean).join(' – '))),
        row(t('details.embeddedInfo'), model.embeddedInfo.map(value => listValue(t, 'embeddedInfo', value)).join(', ')),
        row(t('details.state'), model.states.map(value => listValue(t, 'state', value)).join(', ')),
      ]),
    },
    {
      key: 'geometry',
      title: t('details.geometry'),
      icon: 'mdi-axis-arrow',
      rows: compact([
        ...model.boundingBoxes.flatMap(box => [
          row(t('facts.boundingBox'), boundingBoxText(t, box, model.lengthUnit)),
          ...referenceSystemRows(t, box.referenceSystem, model.lengthUnit),
        ]),
        ...model.referenceSystems.flatMap(system => referenceSystemRows(t, system, model.lengthUnit)),
        row(t('details.derivedFrom'), model.simplification?.derivedFrom),
      ]),
    },
  ]
  return groups.filter(group => group.rows.length > 0)
}
