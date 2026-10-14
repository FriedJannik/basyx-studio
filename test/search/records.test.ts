import { describe, expect, it } from 'vitest'
import { filterRecords } from '~~/app/utils/records'

describe('record list filters', () => {
  const items = [
    { name: 'Open', security: 'unsecured', state: 'ready' },
    { name: 'Secured', security: 'oidc', state: 'ready' },
    { name: 'Mine', security: 'oidc', state: 'required' },
  ]
  const describe_ = (item: typeof items[number]) => ({ text: [item.name], facets: [`security:${item.security}`, `state:${item.state}`] })
  const names = (search: string | null, selected: string[]) => filterRecords(items, search, selected, describe_).map(item => item.name)

  it('matches the search text case-insensitively', () => {
    expect(names('SEC', [])).toEqual(['Secured'])
    expect(names('  ', [])).toEqual(['Open', 'Secured', 'Mine'])
    expect(names(null, [])).toHaveLength(3)
  })

  it('widens within a group and narrows across groups', () => {
    expect(names(null, ['security:unsecured', 'security:oidc'])).toEqual(['Open', 'Secured', 'Mine'])
    expect(names(null, ['security:oidc', 'state:ready'])).toEqual(['Secured'])
    expect(names('mine', ['security:unsecured'])).toEqual([])
  })
})
