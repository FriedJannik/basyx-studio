import type { AtlasDatum, Description, Paint } from './atlas'
import type { FleetIndex } from './fleet'
import type { Grouping, Lens, Status, Twin } from './types'
import { rootKey } from './atlas'
import { formatCarbon, signalStatus, twinStatus } from './fleet'

// Lenses re-encode the same map: what a circle's color, size, ring and pulse
// mean. Groupings decide what contains what.

export const categories: Record<string, { label: string, plural: string, icon: string }> = {
  plant: { label: 'Plant', plural: 'Plants', icon: 'mdi-factory' },
  line: { label: 'Line', plural: 'Lines', icon: 'mdi-transit-connection-horizontal' },
  machine: { label: 'Machine', plural: 'Machines', icon: 'mdi-cog-outline' },
  battery: { label: 'Battery module', plural: 'Battery modules', icon: 'mdi-battery-high' },
  agv: { label: 'Mobile robot', plural: 'Mobile robots', icon: 'mdi-forklift' },
  robot: { label: 'Robot', plural: 'Robots', icon: 'mdi-robot-industrial' },
  laser: { label: 'Laser', plural: 'Lasers', icon: 'mdi-flash' },
  chiller: { label: 'Chiller', plural: 'Chillers', icon: 'mdi-snowflake' },
  spindle: { label: 'Spindle', plural: 'Spindles', icon: 'mdi-rotate-orbit' },
  camera: { label: 'Camera', plural: 'Cameras', icon: 'mdi-camera-iris' },
  hmi: { label: 'HMI panel', plural: 'HMI panels', icon: 'mdi-monitor-dashboard' },
  compressor: { label: 'Compressor', plural: 'Compressors', icon: 'mdi-air-filter' },
  pump: { label: 'Pump', plural: 'Pumps', icon: 'mdi-pump' },
  motor: { label: 'Motor', plural: 'Motors', icon: 'mdi-engine' },
  drive: { label: 'Drive', plural: 'Drives', icon: 'mdi-sine-wave' },
  valve: { label: 'Valve', plural: 'Valves', icon: 'mdi-pipe-valve' },
  sensor: { label: 'Sensor', plural: 'Sensors', icon: 'mdi-access-point' },
  controller: { label: 'Controller', plural: 'Controllers', icon: 'mdi-memory' },
  conveyor: { label: 'Conveyor', plural: 'Conveyors', icon: 'mdi-transfer-right' },
  device: { label: 'Device', plural: 'Other devices', icon: 'mdi-cube-outline' },
}

export const lenses: Array<{ value: Lens, title: string, icon: string }> = [
  { value: 'readiness', title: 'Passport', icon: 'mdi-passport' },
  { value: 'carbon', title: 'Carbon', icon: 'mdi-molecule-co2' },
  { value: 'live', title: 'Live', icon: 'mdi-pulse' },
  { value: 'age', title: 'Age', icon: 'mdi-history' },
]

export const groupings: Array<{ value: Grouping, title: string, icon: string }> = [
  { value: 'structure', title: 'Structure', icon: 'mdi-file-tree-outline' },
  { value: 'manufacturer', title: 'Manufacturer', icon: 'mdi-domain' },
  { value: 'category', title: 'Category', icon: 'mdi-shape-outline' },
]

const statusColors: Record<Status, string> = { alarm: '#ef4444', warning: '#f59e0b', normal: '#14b8a6', none: '#64748b' }
const neutral = '#64748b'

/** Interpolates color stops [position, hex] at t (0…1). */
function scale (stops: Array<[number, string]>, t: number): string {
  const value = Math.max(0, Math.min(1, t))
  for (let index = 1; index < stops.length; index++) {
    const [p1, c1] = stops[index]!
    const [p0, c0] = stops[index - 1]!
    if (value <= p1) {
      const local = (value - p0) / (p1 - p0 || 1)
      const a = Number.parseInt(c0.slice(1), 16)
      const b = Number.parseInt(c1.slice(1), 16)
      const channel = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * local)
      return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('')}`
    }
  }
  return stops.at(-1)![1]
}

export const readinessStops: Array<[number, string]> = [[0, '#ef4444'], [0.6, '#f59e0b'], [0.85, '#a3e635'], [1, '#22c55e']]
export const carbonStops: Array<[number, string]> = [[0, '#38bdf8'], [0.35, '#818cf8'], [0.6, '#c084fc'], [0.8, '#f472b6'], [1, '#fb923c']]
export const ageStops: Array<[number, string]> = [[0, '#22d3ee'], [0.3, '#60a5fa'], [0.6, '#a78bfa'], [0.85, '#f59e0b'], [1, '#b45309']]
const maxAge = 18

export function readinessColor (value: number) {
  return scale(readinessStops, (value - 0.4) / 0.6)
}

interface Aggregate {
  twins: Twin[]
  readiness: number
  carbon: number | null
  status: Status
  alarms: number
  year: number | null
}

export class LensPainter {
  lens: Lens = 'readiness'
  #index: FleetIndex
  #members = new Map<string, Twin[]>()
  #aggregates = new Map<string, Aggregate>()
  #carbonRange: [number, number] = [1, 1]
  #year = new Date().getFullYear()
  #labels = new Map<string, string>()

  constructor (index: FleetIndex) {
    this.#index = index
  }

  /** Builds the tree for a grouping; leaf sizes follow the lens. */
  build (index: FleetIndex, grouping: Grouping, rootLabel: string): AtlasDatum {
    this.#index = index
    const twins = [...index.byId.values()]
    const carbons = twins.map(twin => twin.carbon).filter((value): value is number => value !== null && value > 0)
    this.#carbonRange = carbons.length > 0 ? [Math.min(...carbons), Math.max(...carbons)] : [1, 1]
    const fallbackCarbon = carbons.length > 0 ? carbons.toSorted((a, b) => a - b)[Math.floor(carbons.length * 0.2)]! : 1
    const value = (twin: Twin, assembly = false) => {
      if (this.lens === 'carbon') {
        return twin.carbon && twin.carbon > 0 ? twin.carbon : fallbackCarbon
      }
      return assembly ? 2.4 : 1
    }
    const leaf = (twin: Twin, assembly = false): AtlasDatum => ({ key: twin.id, label: twin.name, twin, value: value(twin, assembly) })
    const byCategory = (items: Twin[], prefix: string): AtlasDatum[] => {
      const groups = new Map<string, Twin[]>()
      for (const twin of items) {
        groups.set(twin.category, [...(groups.get(twin.category) ?? []), twin])
      }
      return [...groups].map(([category, members]) => ({
        key: `${prefix}${category}`,
        label: categories[category]?.plural ?? category,
        children: members.map(twin => leaf(twin, index.children.has(twin.id))),
      }))
    }

    let children: AtlasDatum[]
    if (grouping === 'structure') {
      const tree = (twin: Twin): AtlasDatum => {
        const parts = (index.children.get(twin.id) ?? []).map(id => index.byId.get(id)).filter((item): item is Twin => item !== undefined)
        return parts.length > 0 ? { key: twin.id, label: twin.name, twin, children: parts.map(part => tree(part)) } : leaf(twin)
      }
      const roots = twins.filter(twin => !index.parent.has(twin.id))
      const assemblies = roots.filter(twin => index.children.has(twin.id)).map(twin => tree(twin))
      const loose = roots.filter(twin => !index.children.has(twin.id))
      children = assemblies.length === 0
        ? byCategory(loose, '__c:')
        : [...assemblies, ...(loose.length > 0 ? [{ key: '__loose', label: 'Not in a structure', children: byCategory(loose, '__loose:') }] : [])]
    } else if (grouping === 'manufacturer') {
      const groups = new Map<string, Twin[]>()
      for (const twin of twins) {
        const name = twin.manufacturer || 'Unknown manufacturer'
        groups.set(name, [...(groups.get(name) ?? []), twin])
      }
      children = [...groups].map(([name, members]) => ({ key: `__m:${name}`, label: name, children: members.map(twin => leaf(twin, index.children.has(twin.id))) }))
    } else {
      children = byCategory(twins, '__c:')
    }
    const root: AtlasDatum = { key: rootKey, label: rootLabel, children }

    // Members and labels of every node, for aggregates.
    this.#members.clear()
    this.#labels.clear()
    const collect = (datum: AtlasDatum): Twin[] => {
      const below = (datum.children ?? []).flatMap(child => collect(child))
      const all = datum.twin ? [datum.twin, ...below] : below
      this.#members.set(datum.key, all)
      this.#labels.set(datum.key, datum.label)
      return all
    }
    collect(root)
    this.invalidate()
    return root
  }

  /** Values changed (live data, fixes): aggregates are recomputed on demand. */
  invalidate () {
    this.#aggregates.clear()
  }

  members (key: string): Twin[] {
    return this.#members.get(key) ?? []
  }

  aggregate (key: string): Aggregate {
    let aggregate = this.#aggregates.get(key)
    if (!aggregate) {
      const twins = this.members(key)
      const carbons = twins.map(twin => twin.carbon).filter((value): value is number => value !== null)
      const years = twins.map(twin => twin.year).filter((value): value is number => value !== null)
      const statuses = twins.map(twin => twinStatus(twin))
      aggregate = {
        twins,
        readiness: twins.length > 0 ? twins.reduce((sum, twin) => sum + twin.readiness, 0) / twins.length : 0,
        carbon: carbons.length > 0 ? carbons.reduce((sum, value) => sum + value, 0) : null,
        status: (['alarm', 'warning', 'normal'] as const).find(status => statuses.includes(status)) ?? 'none',
        alarms: statuses.filter(status => status === 'alarm').length,
        year: years.length > 0 ? years.reduce((sum, value) => sum + value, 0) / years.length : null,
      }
      this.#aggregates.set(key, aggregate)
    }
    return aggregate
  }

  paint = (key: string, twin: Twin | undefined): Paint => {
    const container = !twin || this.#index.children.has(twin.id)
    const aggregate = container ? this.aggregate(key) : undefined
    const status = aggregate ? aggregate.status : (twin ? twinStatus(twin) : 'none')
    const pulse = status === 'alarm' ? 'alarm' : (status === 'warning' && this.lens === 'live' ? 'warning' : undefined)
    switch (this.lens) {
      case 'readiness': {
        const value = aggregate ? aggregate.readiness : twin!.readiness
        return { color: readinessColor(value), ring: value, pulse }
      }
      case 'carbon': {
        const value = aggregate ? aggregate.carbon : twin!.carbon
        if (value === null) {
          return { color: neutral, hollow: !container, pulse }
        }
        // Containers compare their sum with the largest single twin.
        return { color: scale(carbonStops, container ? Math.min(1, this.#carbonT(value) * 0.85 + 0.15) : this.#carbonT(value)), pulse }
      }
      case 'live': {
        return { color: statusColors[status], pulse }
      }
      case 'age': {
        const year = aggregate ? aggregate.year : twin!.year
        if (year === null) {
          return { color: neutral, hollow: !container, pulse }
        }
        return { color: scale(ageStops, (this.#year - year) / maxAge), pulse }
      }
    }
  }

  describe = (key: string, twin: Twin | undefined): Description => {
    const aggregate = this.aggregate(key)
    if (!twin) {
      return {
        title: this.#labels.get(key) ?? key,
        subtitle: `${aggregate.twins.length} twins`,
        stats: this.#stats(aggregate.readiness, aggregate.carbon, aggregate.alarms > 0 ? `${aggregate.alarms} alarm${aggregate.alarms > 1 ? 's' : ''}` : null, aggregate.year),
      }
    }
    const container = this.#index.children.has(twin.id)
    const signal = twin.signals.find(item => signalStatus(item) !== 'normal') ?? twin.signals[0]
    const live = signal ? `${signal.value.toLocaleString('en', { maximumFractionDigits: 1 })} ${signal.unit}`.trim() : null
    return {
      title: twin.name,
      subtitle: [twin.manufacturer, twin.designation].filter(Boolean).join(' · ') || (twin.idShort ?? ''),
      icon: categories[twin.category]?.icon ?? 'mdi-cube-outline',
      stats: container
        ? this.#stats(aggregate.readiness, aggregate.carbon, aggregate.alarms > 0 ? `${aggregate.alarms} alarm${aggregate.alarms > 1 ? 's' : ''}` : live, aggregate.year)
        : this.#stats(twin.readiness, twin.carbon, live, twin.year, signal ? { label: signal.label, status: signalStatus(signal) } : undefined),
    }
  }

  #carbonT (value: number) {
    const [min, max] = this.#carbonRange
    if (max <= min) {
      return 0.5
    }
    return (Math.log(Math.max(value, min)) - Math.log(min)) / (Math.log(max) - Math.log(min))
  }

  #stats (readiness: number, carbon: number | null, live: string | null, year: number | null, signal?: { label: string, status: Status }) {
    const all = {
      readiness: { label: 'Passport', value: `${Math.round(readiness * 100)} %`, color: readinessColor(readiness) },
      carbon: { label: 'CO₂e', value: formatCarbon(carbon) },
      live: live ? { label: signal?.label ?? 'Live', value: live, color: signal ? statusColors[signal.status] : undefined } : null,
      age: { label: 'Built', value: year ? String(Math.round(year)) : '–' },
    }
    const orders: Record<Lens, Array<keyof typeof all>> = {
      readiness: ['readiness', 'carbon', 'live'],
      carbon: ['carbon', 'readiness', 'live'],
      live: ['live', 'readiness', 'carbon'],
      age: ['age', 'readiness', 'carbon'],
    }
    const order = orders[this.lens]
    return [...order, 'age' as const].map(name => all[name]).filter((stat): stat is NonNullable<typeof stat> => stat !== null).slice(0, 3)
  }
}

export const legend: Record<Lens, Array<{ label: string, color: string }>> = {
  readiness: [
    { label: 'Passport ready', color: readinessColor(1) },
    { label: 'Minor gaps', color: readinessColor(0.85) },
    { label: 'Gaps', color: readinessColor(0.65) },
    { label: 'Major gaps', color: readinessColor(0.4) },
  ],
  carbon: [
    { label: 'Low CO₂e', color: carbonStops[0]![1] },
    { label: 'Medium', color: carbonStops[2]![1] },
    { label: 'High CO₂e', color: carbonStops[4]![1] },
    { label: 'No footprint', color: neutral },
  ],
  live: [
    { label: 'Normal', color: statusColors.normal },
    { label: 'Warning', color: statusColors.warning },
    { label: 'Alarm', color: statusColors.alarm },
    { label: 'No live data', color: statusColors.none },
  ],
  age: [
    { label: 'New', color: ageStops[0]![1] },
    { label: '~9 years', color: ageStops[2]![1] },
    { label: `${maxAge}+ years`, color: ageStops[4]![1] },
    { label: 'Unknown', color: neutral },
  ],
}

export { statusColors }
