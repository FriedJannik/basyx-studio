import type { Clause, Op, Signal, Status, Twin } from './types'

// The fleet as the UI sees it: twins, their structure (parts and parents by
// asset ID), live status and the evaluation of "ask the fleet" clauses.

export interface FleetIndex {
  byId: Map<string, Twin>
  parent: Map<string, string>
  children: Map<string, string[]>
}

/** Parents and parts from every twin's Hierarchical Structures edges, without cycles. */
export function indexFleet (twins: Iterable<Twin>): FleetIndex {
  const byId = new Map<string, Twin>()
  const byAsset = new Map<string, string>()
  for (const twin of twins) {
    byId.set(twin.id, twin)
    if (twin.assetId && !byAsset.has(twin.assetId)) {
      byAsset.set(twin.assetId, twin.id)
    }
  }
  const parent = new Map<string, string>()
  const children = new Map<string, string[]>()
  const isAncestor = (candidate: string, of: string) => {
    for (let current: string | undefined = of; current; current = parent.get(current)) {
      if (current === candidate) {
        return true
      }
    }
    return false
  }
  for (const twin of byId.values()) {
    for (const [from, to] of twin.edges) {
      const parentId = byAsset.get(from)
      const childId = byAsset.get(to)
      if (!parentId || !childId || parentId === childId || parent.has(childId) || isAncestor(childId, parentId)) {
        continue
      }
      parent.set(childId, parentId)
      children.set(parentId, [...(children.get(parentId) ?? []), childId])
    }
  }
  return { byId, parent, children }
}

export function ancestors (index: FleetIndex, id: string): string[] {
  const path: string[] = []
  for (let current = index.parent.get(id); current; current = index.parent.get(current)) {
    path.unshift(current)
  }
  return path
}

export function descendants (index: FleetIndex, id: string): string[] {
  const result: string[] = []
  const visit = (current: string) => {
    for (const child of index.children.get(current) ?? []) {
      result.push(child)
      visit(child)
    }
  }
  visit(id)
  return result
}

export function signalStatus (signal: Signal): Status {
  const { value } = signal
  if ((signal.alarmAbove !== null && value >= signal.alarmAbove) || (signal.alarmBelow !== null && value <= signal.alarmBelow)) {
    return 'alarm'
  }
  if ((signal.warnAbove !== null && value >= signal.warnAbove) || (signal.warnBelow !== null && value <= signal.warnBelow)) {
    return 'warning'
  }
  return 'normal'
}

export function twinStatus (twin: Twin): Status {
  if (twin.signals.length === 0) {
    return 'none'
  }
  const statuses = new Set(twin.signals.map(signal => signalStatus(signal)))
  return statuses.has('alarm') ? 'alarm' : (statuses.has('warning') ? 'warning' : 'normal')
}

/** Status of a twin including its parts: an assembly shows the worst state below it. */
export function rolledStatus (index: FleetIndex, id: string): Status {
  const order: Status[] = ['none', 'normal', 'warning', 'alarm']
  let worst: Status = 'none'
  for (const current of [id, ...descendants(index, id)]) {
    const twin = index.byId.get(current)
    const status = twin ? twinStatus(twin) : 'none'
    if (order.indexOf(status) > order.indexOf(worst)) {
      worst = status
    }
  }
  return worst
}

function compare (value: number, op: Op, target: number, target2?: number): boolean {
  switch (op) {
    case 'gt': { return value > target
    }
    case 'gte': { return value >= target
    }
    case 'lt': { return value < target
    }
    case 'lte': { return value <= target
    }
    case 'eq': { return Math.abs(value - target) < 1e-9
    }
    case 'between': { return value >= target && value <= (target2 ?? target)
    }
  }
}

export function matchesClause (twin: Twin, clause: Clause, index: FleetIndex): boolean {
  switch (clause.type) {
    case 'category': { return clause.keys.includes(twin.category)
    }
    case 'manufacturer': { return clause.names.some(name => twin.manufacturer.toLowerCase() === name.toLowerCase())
    }
    case 'spec': {
      const pattern = new RegExp(clause.pattern, 'i')
      return twin.specs.some(spec => typeof spec.value === 'number'
        && (clause.keys.includes(spec.key) || pattern.test(spec.key))
        && compare(spec.value, clause.op, clause.value, clause.value2))
    }
    case 'carbon': { return twin.carbon !== null && compare(twin.carbon, clause.op, clause.value)
    }
    case 'year': { return twin.year !== null && compare(twin.year, clause.op, clause.value)
    }
    case 'missing': { return twin.checks.some(check => clause.checks.includes(check.key) && !check.ok)
    }
    case 'readiness': { return compare(twin.readiness, clause.op, clause.value)
    }
    case 'status': { return clause.levels.includes(twinStatus(twin))
    }
    case 'live': { return twin.signals.length > 0
    }
    case 'within': { return ancestors(index, twin.id).includes(clause.id)
    }
    case 'text': {
      const haystack = [twin.name, twin.designation, twin.family, twin.manufacturer, twin.type, twin.serial, twin.idShort ?? '', twin.country].join(' ').toLowerCase()
      return clause.words.every(word => haystack.includes(word))
    }
  }
}

export function matchesAll (twin: Twin, clauses: Clause[], index: FleetIndex): boolean {
  return clauses.every(clause => matchesClause(twin, clause, index))
}

/** What the backend needs to understand questions about this fleet. */
export function vocabulary (index: FleetIndex) {
  const manufacturers = new Set<string>()
  const specs = new Map<string, { key: string, label: string, unit: string }>()
  for (const twin of index.byId.values()) {
    if (twin.manufacturer) {
      manufacturers.add(twin.manufacturer)
    }
    for (const spec of twin.specs) {
      if (typeof spec.value === 'number' && !specs.has(spec.key)) {
        specs.set(spec.key, { key: spec.key, label: spec.label, unit: spec.unit })
      }
    }
  }
  const places = [...index.children.keys()].map(id => ({ id, name: index.byId.get(id)?.name ?? id }))
  return { manufacturers: [...manufacturers], specs: [...specs.values()], places }
}

export function formatCarbon (kg: number | null): string {
  if (kg === null) {
    return '–'
  }
  return kg >= 1000 ? `${(kg / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} t` : `${Math.round(kg).toLocaleString('en')} kg`
}
