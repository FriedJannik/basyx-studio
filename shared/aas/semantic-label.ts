// A short label for a submodel's semantic ID: which submodel template it
// follows and in which version, e.g. `Nameplate 3.0`. Shown next to the
// submodel in the tree, where the idShort already names the submodel.

/** IRDIs of submodel templates (ECLASS / IEC CDD); their own version (`#003`) is not the template's. */
const knownIrdis: Record<string, string> = {
  // IDTA 02003 Technical Data
  AHX837: 'TechnicalData',
  // IDTA 02004 Handover Documentation (VDI 2770)
  AHF578: 'HandoverDocumentation',
}

/** Path segments that name no template, e.g. `…/TechnicalData/Submodel/2/0`. */
const generic = new Set(['submodel', 'submodeltemplate', 'aas'])

const irdi = /^\d{4}-\d#\d{2}-([A-Z]{3}\d{3})#\d{3}$/

/** A submodel's administrative information, as the submodel references carry it. */
export interface SubmodelAdministration {
  version: string | null
  revision: string | null
  templateId: string | null
}

function capitalized (name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function normalized (text: string): string {
  return text.toLowerCase().replaceAll(/[\s_-]/g, '')
}

function named (segment: string | undefined): segment is string {
  return segment !== undefined && /\D/.test(segment) && !generic.has(segment.toLowerCase())
}

/**
 * The name and version an IRI states as `…/<Name>/<major>/<minor>[/<Part>]`
 * (IDTA, ZVEI): the part after the version (the submodel's name in the
 * template) or, where that is missing or generic, the name before it.
 */
function fromIri (id: string): { name: string | null, version: string | null } {
  const segments = id.split(/[/#]/).filter(Boolean)
  const at = segments.findIndex((segment, index) => /^\d+$/.test(segment) && /^\d+$/.test(segments[index + 1] ?? ''))
  if (at <= 0) {
    return { name: null, version: null }
  }
  const name = segments.slice(at + 2).find(segment => named(segment)) ?? segments.slice(0, at).findLast(segment => named(segment)) ?? null
  return { name, version: `${segments[at]}.${segments[at + 1]}` }
}

/**
 * The template version a template ID states: as an IRI path (`…/2/0`) or
 * at the end of an IDTA document ID (`…/idta-02004-2-0`).
 */
function templateVersion (templateId: string): string | null {
  const dashed = /-(\d+)-(\d+)\/?$/.exec(templateId)
  return dashed ? `${dashed[1]}.${dashed[2]}` : fromIri(templateId).version
}

/**
 * The template and version of a submodel, or `null` when they are unknown
 * or say nothing the idShort does not.
 *
 * The template's name comes from the semantic ID: an IRI as above, or a
 * known template IRDI. Its version comes from the submodel's administration
 * first, which states it (`templateId`, else `version` and `revision`), and
 * only then from the IRI; an IRDI's own version is never used. A name
 * without a version that only repeats `idShort` is left out, and so is an
 * ID without a recognizable template, where only a code or number is left.
 */
export function semanticLabel (semanticId: string, idShort?: string | null, administration?: SubmodelAdministration | null): string | null {
  const id = semanticId.trim()
  const code = irdi.exec(id)?.[1]
  const iri = code ? { name: null, version: null } : fromIri(id)
  const name = code ? knownIrdis[code] ?? null : iri.name
  if (!name) {
    return null
  }

  const administered = administration?.version
    ? `${administration.version}.${administration.revision ?? '0'}`
    : null
  const version = (administration?.templateId ? templateVersion(administration.templateId) : null) ?? administered ?? iri.version
  if (!version) {
    return idShort && normalized(name) === normalized(idShort) ? null : capitalized(name)
  }
  return `${capitalized(name)} ${version}`
}
