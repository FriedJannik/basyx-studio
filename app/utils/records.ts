/** A filter of a record list; `value` is `group:value`. */
export interface FilterOption {
  value: string
  title: string
  icon?: string
}

/** Filters shown together in the filter menu, e.g. all security modes. */
export interface FilterGroup {
  title: string
  options: FilterOption[]
}

export interface RecordDescription {
  /** Texts the search matches, case-insensitively. */
  text: Array<string | null | undefined>
  /** Facets as `group:value`, matched against the selected filters. */
  facets: string[]
}

/**
 * Filters records by search text and filters: filters of one group widen
 * the result (any of them), different groups narrow it (all groups).
 */
export function filterRecords<T> (items: readonly T[], search: string | null, selected: readonly string[], describe: (item: T) => RecordDescription): T[] {
  const query = search?.trim().toLowerCase() ?? ''
  const groups = new Map<string, string[]>()
  for (const value of selected) {
    const group = value.split(':', 1)[0]!
    groups.set(group, [...(groups.get(group) ?? []), value])
  }
  return items.filter(item => {
    const { text, facets } = describe(item)
    if (query && !text.some(part => part?.toLowerCase().includes(query))) {
      return false
    }
    return [...groups.values()].every(values => values.some(value => facets.includes(value)))
  })
}
