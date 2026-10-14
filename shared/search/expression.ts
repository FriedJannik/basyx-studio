// The shell search of the BaSyx AAS Web UI (MVP-4 plan, S2): free text plus
// `field:value` (contains), `field=value` (equals), `field!=value` and
// `-field:value` (not), with quoted values. Shared by the UI, which shows the
// filters as chips, and the server, which turns them into AAS Query Language
// queries or, for AASX workspaces, evaluates them itself.

/** Where a shell query runs: the AAS repository (`/query/shells`) or the AAS registry (`/query/shell-descriptors`). */
export type ShellQueryTarget = 'repository' | 'registry'

export const searchFields = ['id', 'idShort', 'assetKind', 'assetType', 'globalAssetId', 'specificAssetId'] as const
export type SearchField = (typeof searchFields)[number]

export type SearchOperator = 'contains' | 'equals' | 'not-equals'

export interface SearchFilter {
  field: SearchField
  operator: SearchOperator
  value: string
}

export interface ParsedSearch {
  /** The free text, with filters removed and whitespace collapsed. */
  text: string
  filters: SearchFilter[]
  /** A field typed without a value yet, e.g. `idShort:`; it is not part of `filters`. */
  incompleteField?: SearchField
}

/** Fields with a fixed set of values; their filters compare for equality. */
export const searchFieldValues: Partial<Record<SearchField, readonly string[]>> = {
  assetKind: ['Instance', 'Type', 'Role', 'NotApplicable'],
}

/** The Query Language field of each search field, per target. */
const fieldPaths: Record<ShellQueryTarget, Record<SearchField, string>> = {
  repository: {
    id: '$aas#id',
    idShort: '$aas#idShort',
    assetKind: '$aas#assetInformation.assetKind',
    assetType: '$aas#assetInformation.assetType',
    globalAssetId: '$aas#assetInformation.globalAssetId',
    specificAssetId: '$aas#assetInformation.specificAssetIds[].value',
  },
  registry: {
    id: '$aasdesc#id',
    idShort: '$aasdesc#idShort',
    assetKind: '$aasdesc#assetKind',
    assetType: '$aasdesc#assetType',
    globalAssetId: '$aasdesc#globalAssetId',
    specificAssetId: '$aasdesc#specificAssetIds[].value',
  },
}

/** Free text matches these fields, as in the Web UI (not the display name). */
const textFields: readonly SearchField[] = ['id', 'idShort', 'globalAssetId', 'specificAssetId']

/** The roots a raw query may use on each target. */
export const queryRoots: Record<ShellQueryTarget, readonly string[]> = {
  repository: ['$aas'],
  registry: ['$aasdesc', '$smdesc'],
}

const tokenPattern = /(?:^|\s)(-?)([a-z][a-z0-9]*)(:|!=|=)(?:"((?:\\.|[^"])*)"|(\S*))/gi

/** Splits a search into free text and field filters; unknown field names stay text. */
export function parseSearch (expression: string): ParsedSearch {
  const filters: SearchFilter[] = []
  const text: string[] = []
  let incompleteField: SearchField | undefined
  let lastIndex = 0
  for (const match of expression.matchAll(tokenPattern)) {
    const field = searchFields.find(candidate => candidate.toLowerCase() === match[2]!.toLowerCase())
    if (!field) {
      continue
    }
    text.push(expression.slice(lastIndex, match.index))
    lastIndex = match.index + match[0].length
    const quoted = match[4]
    const value = quoted === undefined ? (match[5] ?? '') : quoted.replaceAll(/\\([\\"])/g, '$1')
    if (value.trim() === '' || (quoted === undefined && value.startsWith('"'))) {
      incompleteField = field
      continue
    }
    const operator: SearchOperator = match[1] === '-' || match[3] === '!='
      ? 'not-equals'
      : (match[3] === '=' || searchFieldValues[field] ? 'equals' : 'contains')
    filters.push({ field, operator, value })
  }
  text.push(expression.slice(lastIndex))
  return { text: text.join('').trim().replaceAll(/\s+/g, ' '), filters, incompleteField }
}

function quote (value: string): string {
  return /[\s"\\]/.test(value) ? `"${value.replaceAll(/[\\"]/g, String.raw`\$&`)}"` : value
}

/** A filter as typed in the search field, e.g. `assetKind=Type` or `idShort:"Motor 1"`. */
export function formatFilter (filter: SearchFilter): string {
  const separator = { 'contains': ':', 'equals': '=', 'not-equals': '!=' }[filter.operator]
  return `${filter.field}${separator}${quote(filter.value)}`
}

/** The search without one of its filters, for removing a chip. */
export function withoutFilter (parsed: ParsedSearch, index: number): string {
  return [parsed.text, ...parsed.filters.filter((_, position) => position !== index).map(filter => formatFilter(filter))]
    .filter(Boolean)
    .join(' ')
}

export function escapeRegex (value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

type JsonCondition = Record<string, unknown>

function filterCondition (target: ShellQueryTarget, filter: SearchFilter): JsonCondition {
  const operands = [{ $field: fieldPaths[target][filter.field] }, { $strVal: filter.value }]
  return filter.operator === 'contains' ? { $contains: operands } : { $eq: operands }
}

/**
 * The AAS Query Language query of a search, built like the Web UI's: the text
 * as a case-insensitive regular expression over the text fields, positive
 * filters together in one `$match`, exclusions as `$not`. `undefined` for an
 * empty search.
 */
export function buildShellQuery (target: ShellQueryTarget, parsed: ParsedSearch): { $condition: JsonCondition } | undefined {
  const conditions: JsonCondition[] = []
  if (parsed.text) {
    const pattern = `(?i)${escapeRegex(parsed.text)}`
    conditions.push({ $or: textFields.map(field => ({ $regex: [{ $field: fieldPaths[target][field] }, { $strVal: pattern }] })) })
  }
  const positive = parsed.filters.filter(filter => filter.operator !== 'not-equals')
  if (positive.length > 0) {
    conditions.push({ $match: positive.map(filter => filterCondition(target, filter)) })
  }
  for (const filter of parsed.filters.filter(filter => filter.operator === 'not-equals')) {
    conditions.push({ $not: { $match: [filterCondition(target, filter)] } })
  }
  if (conditions.length === 0) {
    return undefined
  }
  return { $condition: conditions.length === 1 ? conditions[0]! : { $and: conditions } }
}

type Json = Record<string, unknown>
const strings = (value: unknown): string[] => (typeof value === 'string' ? [value] : [])
const assetOf = (shell: Json) => (shell.assetInformation ?? {}) as Json

/** The values of each search field on a shell (AAS JSON), for searching without a query endpoint. */
const shellValues: Record<SearchField, (shell: Json) => string[]> = {
  id: shell => strings(shell.id),
  idShort: shell => strings(shell.idShort),
  assetKind: shell => strings(assetOf(shell).assetKind),
  assetType: shell => strings(assetOf(shell).assetType),
  globalAssetId: shell => strings(assetOf(shell).globalAssetId),
  specificAssetId: shell => {
    const ids = assetOf(shell).specificAssetIds
    return Array.isArray(ids) ? ids.flatMap(entry => strings((entry as Json | null)?.value)) : []
  },
}

/** Whether a shell (AAS JSON) matches a search with the semantics of the query built for it. */
export function matchesShell (shell: Json, parsed: ParsedSearch): boolean {
  const needle = parsed.text.toLowerCase()
  if (needle && !textFields.some(field => shellValues[field](shell).some(value => value.toLowerCase().includes(needle)))) {
    return false
  }
  return parsed.filters.every(filter => {
    const values = shellValues[filter.field](shell)
    const found = filter.operator === 'contains'
      ? values.some(value => value.includes(filter.value))
      : values.includes(filter.value)
    return filter.operator === 'not-equals' ? !found : found
  })
}
