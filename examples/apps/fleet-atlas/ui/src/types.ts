// Shapes exchanged with the Fleet Atlas backend (backend/digest.js, backend/ask.js).

export interface Fix {
  submodelId: string
  idShortPath: string
  modelType: 'Property' | 'MultiLanguageProperty'
  valueType: string | null
}

export interface Check {
  key: string
  label: string
  group: 'nameplate' | 'technical' | 'carbon' | 'documentation'
  ok: boolean
  fix?: Fix
}

export interface Spec {
  key: string
  label: string
  value: number | string
  unit: string
}

export interface Signal {
  submodelId: string
  path: string
  label: string
  value: number
  unit: string
  warnAbove: number | null
  alarmAbove: number | null
  warnBelow: number | null
  alarmBelow: number | null
}

export interface Twin {
  id: string
  idShort: string | null
  name: string
  assetKind: string | null
  assetId: string | null
  manufacturer: string
  designation: string
  family: string
  type: string
  serial: string
  year: number | null
  country: string
  category: string
  submodels: Array<{ id: string, idShort: string | null, kind: string, status: string }>
  checks: Check[]
  readiness: number
  documents: number
  carbon: number | null
  specs: Spec[]
  edges: Array<[string, string]>
  signals: Signal[]
}

export type Status = 'alarm' | 'warning' | 'normal' | 'none'

export type Clause
  = | { type: 'category', keys: string[], label: string }
    | { type: 'manufacturer', names: string[], label: string }
    | { type: 'spec', keys: string[], pattern: string, op: Op, value: number, value2?: number, label: string }
    | { type: 'carbon', op: Op, value: number, label: string }
    | { type: 'year', op: Op, value: number, label: string }
    | { type: 'missing', checks: string[], label: string }
    | { type: 'readiness', op: Op, value: number, label: string }
    | { type: 'status', levels: Status[], label: string }
    | { type: 'live', label: string }
    | { type: 'within', id: string, label: string }
    | { type: 'text', words: string[], label: string }

export type Op = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between'

export type Lens = 'readiness' | 'carbon' | 'live' | 'age'
export type Grouping = 'structure' | 'manufacturer' | 'category'
