// Turns a shell and its submodels into a compact twin digest: identity,
// category, passport readiness, carbon footprint, technical key figures,
// structure (parts) and live signals. Pure functions, so they are unit-tested
// without Studio.

/** Submodel kinds Fleet Atlas reads; everything else is listed, not loaded. */
const kinds = [
  ['nameplate', /nameplate/i, /nameplate/i],
  ['technical', /technicaldata|AHX837/i, /^technicaldata$/i],
  ['carbon', /carbonfootprint/i, /carbonfootprint|pcf/i],
  ['documentation', /AHF578|documentation|2770/i, /documentation/i],
  ['hierarchy', /hierarchicalstructures|billofmaterial/i, /hierarchicalstructures|billofmaterial|bom/i],
  ['operational', /operationaldata|conditionmonitoring|telemetry|livedata/i, /^(operational|condition|live|telemetry)/i],
]

export function submodelKind (semanticId, idShort) {
  for (const [kind, bySemantic, byIdShort] of kinds) {
    if ((semanticId && bySemantic.test(semanticId)) || (idShort && byIdShort.test(idShort))) {
      return kind
    }
  }
  return 'other'
}

/** Categories, recognized from designation, family and name. Assemblies with parts default to `machine`. */
const categories = [
  ['plant', 'Plant', 'mdi-factory', /\b(plant|factory|site)\b/i],
  ['line', 'Line', 'mdi-transit-connection-horizontal', /production line|^line\b/i],
  ['battery', 'Battery', 'mdi-battery-high', /battery/i],
  ['agv', 'Mobile robot', 'mdi-forklift', /autonomous mobile robot|\bamr\b|\bagv\b|automated guided/i],
  ['robot', 'Robot', 'mdi-robot-industrial', /robot/i],
  ['laser', 'Laser', 'mdi-flash', /laser/i],
  ['compressor', 'Compressor', 'mdi-air-filter', /compressor/i],
  ['chiller', 'Chiller', 'mdi-snowflake', /chiller/i],
  ['pump', 'Pump', 'mdi-pump', /pump/i],
  ['spindle', 'Spindle', 'mdi-rotate-orbit', /spindle/i],
  ['drive', 'Drive', 'mdi-sine-wave', /converter|inverter|servo drive|\bdrive\b|vfd/i],
  ['motor', 'Motor', 'mdi-engine', /motor|servo/i],
  ['valve', 'Valve', 'mdi-pipe-valve', /valve/i],
  ['camera', 'Camera', 'mdi-camera-iris', /camera/i],
  ['sensor', 'Sensor', 'mdi-access-point', /sensor|transmitter|meter\b|probe|radar|gauge|thermometer/i],
  ['hmi', 'HMI', 'mdi-monitor-dashboard', /\bhmi\b|touch panel|operator panel/i],
  ['controller', 'Controller', 'mdi-memory', /controller|\bplc\b/i],
  ['conveyor', 'Conveyor', 'mdi-transfer-right', /conveyor/i],
]

export const categoryInfo = Object.fromEntries([
  ...categories.map(([key, label, icon]) => [key, { key, label, icon }]),
  ['machine', { key: 'machine', label: 'Machine', icon: 'mdi-cog-outline' }],
  ['device', { key: 'device', label: 'Device', icon: 'mdi-cube-outline' }],
])

/** The category from the first text that names one: designation, then family, then the twin's name. */
export function categorize (texts, hasParts) {
  for (const text of texts.filter(Boolean)) {
    for (const category of categories) {
      const [key] = category
      // A line or plant is only one when it is an assembly.
      if (category[3].test(text) && !((key === 'line' || key === 'plant') && !hasParts)) {
        return key
      }
    }
  }
  return hasParts ? 'machine' : 'device'
}

// ---------------------------------------------------------------------------
// Element helpers
// ---------------------------------------------------------------------------

function childrenOf (element) {
  if (!element) {
    return []
  }
  const items = element.modelType === 'Submodel'
    ? element.submodelElements
    : (element.modelType === 'Entity' ? element.statements : element.value)
  return Array.isArray(items) ? items.filter(item => item && typeof item === 'object') : []
}

const normalize = idShort => String(idShort ?? '').toLowerCase().replace(/\d+$/, '')

function child (element, ...idShorts) {
  const wanted = new Set(idShorts.map(idShort => normalize(idShort)))
  return childrenOf(element).find(item => wanted.has(normalize(item.idShort)))
}

/** Text of a Property or MultiLanguageProperty, preferring English. */
export function textOf (element) {
  if (!element) {
    return ''
  }
  if (Array.isArray(element.value)) {
    const strings = element.value
    return (strings.find(entry => entry?.language?.startsWith('en')) ?? strings[0])?.text ?? ''
  }
  return typeof element.value === 'string' ? element.value : ''
}

const semanticOf = element => element?.semanticId?.keys?.[0]?.value ?? null

/** Walks all elements with their idShortPaths. */
function* walk (element, path = '') {
  const isList = element.modelType === 'SubmodelElementList'
  let index = 0
  for (const item of childrenOf(element)) {
    const itemPath = isList ? `${path}[${index++}]` : (path ? `${path}.${item.idShort}` : String(item.idShort))
    yield { element: item, path: itemPath }
    yield* walk(item, itemPath)
  }
}

// ---------------------------------------------------------------------------
// Units of common technical properties
// ---------------------------------------------------------------------------

/** Units of well-known idShorts; patterns cover the rest. */
const exactUnits = {
  RatedSpeed: '1/min', MaxSpindleSpeed: '1/min', RatedTorque: 'N·m', SupplyVoltage: 'V DC', Accuracy: '%', ScreenSize: 'in',
  Repeatability: 'mm', FreeAirDelivery: 'm³/min', CoolingCapacity: 'kW', Wavelength: 'nm', NominalVoltage: 'V', Capacity: 'Ah',
  Energy: 'kWh', CycleLife: 'cycles', Resolution: 'MP', FrameRate: 'fps', BatteryCapacity: 'kWh', MaxSpeed: 'm/s',
}

const units = [
  [/power/i, 'kW'],
  [/voltage/i, 'V'],
  [/current/i, 'A'],
  [/speed|rpm/i, 'rpm'],
  [/weight|mass|payload/i, 'kg'],
  [/pressure/i, 'bar'],
  [/freeairdelivery/i, 'm³/min'],
  [/flow/i, 'm³/h'],
  [/torque/i, 'Nm'],
  [/diameter/i, 'mm'],
  [/reach|length|width|height/i, 'mm'],
  [/throughput/i, 'units/h'],
  [/temperature/i, '°C'],
  [/inputs|outputs/i, ''],
]

export function unitOf (idShort, element) {
  const qualified = element?.qualifiers?.find(entry => /^unit$/i.test(entry.type))?.value
  if (qualified) {
    return qualified
  }
  return exactUnits[idShort] ?? units.find(([pattern]) => pattern.test(idShort))?.[1] ?? ''
}

export function labelOf (idShort) {
  const words = String(idShort).replaceAll(/([a-z\d])([A-Z])/g, '$1 $2').replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  return words.charAt(0) + words.slice(1).toLowerCase()
}

// ---------------------------------------------------------------------------
// Passport readiness
// ---------------------------------------------------------------------------

/** Nameplate properties a product passport needs. */
export const passportFields = [
  ['ManufacturerName', 'Manufacturer name'],
  ['ManufacturerProductDesignation', 'Product designation'],
  ['SerialNumber', 'Serial number'],
  ['YearOfConstruction', 'Year of construction'],
  ['CountryOfOrigin', 'Country of origin'],
  ['URIOfTheProduct', 'Product URI'],
]

function fieldCheck (submodel, idShort, label, group) {
  const element = child(submodel, idShort)
  const value = textOf(element).trim()
  const fixable = element && ['Property', 'MultiLanguageProperty'].includes(element.modelType)
  return {
    key: idShort,
    label,
    group,
    ok: value.length > 0,
    ...(!value && fixable ? { fix: { submodelId: submodel.id, idShortPath: String(element.idShort), modelType: element.modelType, valueType: element.valueType ?? null } } : {}),
  }
}

function readinessChecks (loaded) {
  const checks = []
  const nameplate = loaded.nameplate
  checks.push({ key: 'nameplate', label: 'Digital nameplate', group: 'nameplate', ok: Boolean(nameplate) })
  for (const [idShort, label] of passportFields) {
    checks.push(nameplate ? fieldCheck(nameplate, idShort, label, 'nameplate') : { key: idShort, label, group: 'nameplate', ok: false })
  }
  checks.push({ key: 'technical', label: 'Technical data', group: 'technical', ok: Boolean(loaded.technical) })

  const carbon = loaded.carbon
  checks.push({ key: 'carbon', label: 'Carbon footprint', group: 'carbon', ok: Boolean(carbon) })
  if (carbon) {
    const footprint = [...walk(carbon)].find(entry => /^pcfco2eq$/i.test(String(entry.element.idShort)))
    const value = textOf(footprint?.element).trim()
    checks.push({
      key: 'PcfCO2eq',
      label: 'CO₂ equivalent',
      group: 'carbon',
      ok: value.length > 0,
      ...(!value && footprint?.element.modelType === 'Property' ? { fix: { submodelId: carbon.id, idShortPath: footprint.path, modelType: 'Property', valueType: footprint.element.valueType ?? 'xs:double' } } : {}),
    })
  } else {
    checks.push({ key: 'PcfCO2eq', label: 'CO₂ equivalent', group: 'carbon', ok: false })
  }

  const documents = loaded.documentation ? documentCount(loaded.documentation) : 0
  checks.push({ key: 'documentation', label: 'Handover documentation', group: 'documentation', ok: documents > 0 })
  return { checks, documents }
}

function documentCount (submodel) {
  const list = child(submodel, 'Documents')
  return list ? childrenOf(list).length : childrenOf(submodel).filter(item => /^document/i.test(String(item.idShort))).length
}

// ---------------------------------------------------------------------------
// Carbon, technical data, structure, live signals
// ---------------------------------------------------------------------------

function carbonOf (submodel) {
  if (!submodel) {
    return null
  }
  let total = null
  for (const { element } of walk(submodel)) {
    if (/^pcfco2eq$/i.test(String(element.idShort))) {
      const value = Number.parseFloat(textOf(element))
      if (Number.isFinite(value)) {
        total = (total ?? 0) + value
      }
    }
  }
  return total
}

function specsOf (submodel) {
  if (!submodel) {
    return []
  }
  const properties = child(submodel, 'TechnicalProperties') ?? submodel
  const specs = []
  for (const { element } of walk(properties)) {
    if (element.modelType !== 'Property' && element.modelType !== 'MultiLanguageProperty') {
      continue
    }
    const text = textOf(element).trim()
    if (!text) {
      continue
    }
    const number = Number(text)
    specs.push({
      key: String(element.idShort),
      label: labelOf(element.idShort),
      value: text !== '' && Number.isFinite(number) ? number : text,
      unit: unitOf(String(element.idShort), element),
    })
    if (specs.length >= 40) {
      break
    }
  }
  return specs
}

/** Edges [parent asset ID, child asset ID] from a Hierarchical Structures submodel. */
export function structureOf (submodel) {
  if (!submodel) {
    return []
  }
  const archeType = textOf(child(submodel, 'ArcheType')).toLowerCase()
  const entities = new Map()
  for (const entry of walk(submodel)) {
    if (entry.element.modelType === 'Entity') {
      entities.set(entry.path, entry.element)
    }
  }
  const entry = childrenOf(submodel).find(item => item.modelType === 'Entity')
  if (!entry?.globalAssetId) {
    return []
  }

  // Relationships name the edges explicitly (HasPart, IsPartOf).
  const edges = []
  const entityAt = reference => {
    const path = (reference?.keys ?? []).filter(key => key.type === 'Entity').map(key => key.value).join('.')
    return entities.get(path)?.globalAssetId
  }
  for (const { element } of walk(submodel)) {
    if (element.modelType !== 'RelationshipElement') {
      continue
    }
    const meaning = `${semanticOf(element) ?? ''} ${element.idShort ?? ''}`
    const first = entityAt(element.first)
    const second = entityAt(element.second)
    if (first && second && first !== second) {
      if (/haspart/i.test(meaning)) {
        edges.push([first, second])
      } else if (/ispartof/i.test(meaning)) {
        edges.push([second, first])
      }
    }
  }
  if (edges.length > 0) {
    return edges
  }

  // Without relationships, nesting is the structure: parts below, parents for OneUp.
  const nest = entity => {
    for (const item of childrenOf(entity)) {
      if (item.modelType === 'Entity' && item.globalAssetId) {
        edges.push(archeType === 'oneup' ? [item.globalAssetId, entity.globalAssetId] : [entity.globalAssetId, item.globalAssetId])
        if (archeType !== 'oneup') {
          nest(item)
        }
      }
    }
  }
  nest(entry)
  return edges
}

function qualifierNumber (element, ...types) {
  const entry = element.qualifiers?.find(item => types.some(type => type.toLowerCase() === String(item.type).toLowerCase()))
  const value = Number(entry?.value)
  return entry && Number.isFinite(value) ? value : null
}

export function signalsOf (submodel) {
  if (!submodel) {
    return []
  }
  const signals = []
  for (const { element, path } of walk(submodel)) {
    if (element.modelType !== 'Property') {
      continue
    }
    const value = Number(element.value)
    if (!Number.isFinite(value) || !/double|float|decimal|int|long|short/.test(String(element.valueType))) {
      continue
    }
    signals.push({
      submodelId: submodel.id,
      path,
      label: labelOf(element.idShort),
      value,
      unit: unitOf(String(element.idShort), element),
      warnAbove: qualifierNumber(element, 'WarningAbove', 'WarnAbove'),
      alarmAbove: qualifierNumber(element, 'AlarmAbove', 'Max'),
      warnBelow: qualifierNumber(element, 'WarningBelow', 'WarnBelow'),
      alarmBelow: qualifierNumber(element, 'AlarmBelow', 'Min'),
    })
    if (signals.length >= 12) {
      break
    }
  }
  return signals
}

// ---------------------------------------------------------------------------
// The digest
// ---------------------------------------------------------------------------

/**
 * @param {object} shell A shell summary (id, idShort, displayName, assetKind, globalAssetId).
 * @param {Array<{id: string, idShort: string|null, semanticId: string|null, status: string}>} submodelList
 * @param {Record<string, object>} loaded Loaded submodels by kind.
 */
export function digest (shell, submodelList, loaded) {
  const nameplate = loaded.nameplate
  const name = (shell.displayName?.find(entry => entry.language?.startsWith('en')) ?? shell.displayName?.[0])?.text || shell.idShort || shell.id
  const edges = structureOf(loaded.hierarchy)
  const designation = textOf(child(nameplate, 'ManufacturerProductDesignation'))
  const family = textOf(child(nameplate, 'ManufacturerProductFamily'))
  const hasParts = edges.some(([parent]) => parent === shell.globalAssetId)
  const { checks, documents } = readinessChecks(loaded)
  const category = categorize([designation, family, name], hasParts)
  return {
    id: shell.id,
    idShort: shell.idShort,
    name,
    assetKind: shell.assetKind,
    assetId: shell.globalAssetId,
    manufacturer: textOf(child(nameplate, 'ManufacturerName')),
    designation,
    family,
    type: textOf(child(nameplate, 'ManufacturerProductType')),
    serial: textOf(child(nameplate, 'SerialNumber')),
    year: Number.parseInt(textOf(child(nameplate, 'YearOfConstruction')), 10) || null,
    country: textOf(child(nameplate, 'CountryOfOrigin')),
    category,
    submodels: submodelList.map(item => ({ id: item.id, idShort: item.idShort, kind: submodelKind(item.semanticId, item.idShort), status: item.status })),
    checks,
    readiness: checks.filter(check => check.ok).length / checks.length,
    documents,
    carbon: carbonOf(loaded.carbon),
    specs: specsOf(loaded.technical),
    edges,
    signals: signalsOf(loaded.operational),
  }
}
