// "Ask the fleet": turns a question such as "pumps over 50 kW without carbon
// footprint in line 1" into clauses the map applies. No language model, no
// network: patterns, units and the fleet's own vocabulary (categories,
// manufacturers, technical properties and places), so every match can be
// explained. Each clause carries a label that the UI shows as a chip.

const stopwords = new Set(['a', 'all', 'anything', 'something', 'everything', 'everyone', 'an', 'and', 'any', 'are', 'assets', 'devices', 'every', 'find', 'for', 'from', 'give', 'has', 'have', 'is', 'list', 'me', 'my', 'of', 'only', 'please', 'show', 'that', 'the', 'their', 'them', 'there', 'these', 'those', 'twins', 'what', 'where', 'which', 'who', 'whose', 'with', 'by', 'in', 'on', 'at', 'than', 'built', 'made', 'products', 'items', 'units', 'kg'])

/** Category words → category keys. */
const categoryWords = [
  [/\b(battery modules?|batteries|battery)\b/, 'battery', 'Battery modules'],
  [/\b(mobile robots?|amrs?|agvs?)\b/, 'agv', 'Mobile robots'],
  [/\b(lasers?)\b/, 'laser', 'Lasers'],
  [/\b(cameras?)\b/, 'camera', 'Cameras'],
  [/\b(hmis?|panels?)\b/, 'hmi', 'HMI panels'],
  [/\b(spindles?)\b/, 'spindle', 'Spindles'],
  [/\b(chillers?)\b/, 'chiller', 'Chillers'],
  [/\b(motors?|servos?)\b/, 'motor', 'Motors'],
  [/\b(pumps?)\b/, 'pump', 'Pumps'],
  [/\b(valves?)\b/, 'valve', 'Valves'],
  [/\b(sensors?|transmitters?|meters?|probes?)\b/, 'sensor', 'Sensors'],
  [/\b(controllers?|plcs?)\b/, 'controller', 'Controllers'],
  [/\b(compressors?)\b/, 'compressor', 'Compressors'],
  [/\b(robots?)\b/, 'robot', 'Robots'],
  [/\b(drives?|converters?|inverters?|vfds?)\b/, 'drive', 'Drives'],
  [/\b(conveyors?)\b/, 'conveyor', 'Conveyors'],
  [/\b(machines?|assemblies)\b/, 'machine', 'Machines'],
  [/\b(lines)\b/, 'line', 'Lines'],
]

/** What can be missing → the readiness checks it covers. */
const missingTopics = [
  [/carbon|pcf|footprint|co2|co₂|emission/, ['carbon', 'PcfCO2eq'], 'carbon footprint'],
  [/nameplate/, ['nameplate'], 'nameplate'],
  [/doc|manual|handover/, ['documentation'], 'documentation'],
  [/technical|datasheet|data sheet|specs?/, ['technical'], 'technical data'],
  [/serial/, ['SerialNumber'], 'serial number'],
  [/country|origin/, ['CountryOfOrigin'], 'country of origin'],
  [/year|age/, ['YearOfConstruction'], 'year of construction'],
  [/manufacturer|maker|vendor/, ['ManufacturerName'], 'manufacturer'],
  [/ur[il]|link|website|web/, ['URIOfTheProduct'], 'product URI'],
  [/designation|name/, ['ManufacturerProductDesignation'], 'designation'],
]

/** Units → quantity of a technical property, with a factor to the unit Fleet Atlas uses. */
const unitWords = [
  [/^kw$/, /power/i, 1, 'kW'],
  [/^w$/, /power/i, 0.001, 'kW'],
  [/^mw$/, /power/i, 1000, 'kW'],
  [/^v$/, /voltage/i, 1, 'V'],
  [/^a$/, /current/i, 1, 'A'],
  [/^(rpm|1\/min)$/, /speed/i, 1, 'rpm'],
  [/^(kg|kilograms?)$/, /weight|mass/i, 1, 'kg'],
  [/^(t|tons?|tonnes?)$/, /weight|mass/i, 1000, 'kg'],
  [/^bar$/, /pressure/i, 1, 'bar'],
  [/^(m3\/h|m³\/h)$/, /flow/i, 1, 'm³/h'],
  [/^nm$/, /torque/i, 1, 'Nm'],
  [/^mm$/, /diameter|reach|length/i, 1, 'mm'],
]

/** Quantity words → technical property pattern. */
const quantityWords = [
  [/power|strong/, /power/i],
  [/voltage/, /voltage/i],
  [/current|amps?/, /current/i],
  [/speed|rpm/, /speed/i],
  [/weight|heav|mass|light/, /weight|mass/i],
  [/pressure/, /pressure/i],
  [/flow/, /flow/i],
  [/torque/, /torque/i],
  [/payload/, /payload/i],
  [/reach/, /reach/i],
  [/throughput|capacity/, /throughput/i],
  [/diameter|dn/, /diameter/i],
]

const comparators = [
  [/^(over|above|more than|greater than|bigger than|larger than|exceeding|>|heavier than|stronger than|faster than|higher than)$/, 'gt', '>'],
  [/^(at least|>=|min(imum)?)$/, 'gte', '≥'],
  [/^(under|below|less than|smaller than|<|lighter than|weaker than|slower than|lower than)$/, 'lt', '<'],
  [/^(at most|<=|max(imum)?|up to)$/, 'lte', '≤'],
]
const comparatorPattern = 'over|above|more than|greater than|bigger than|larger than|exceeding|heavier than|stronger than|faster than|higher than|at least|min(?:imum)?|under|below|less than|smaller than|lighter than|weaker than|slower than|lower than|at most|max(?:imum)?|up to|>=|<=|>|<'

function comparator (text) {
  const found = comparators.find(([pattern]) => pattern.test(text.trim()))
  return found ? { op: found[1], symbol: found[2] } : { op: 'gt', symbol: '>' }
}

const number = text => Number(String(text).replace(',', '.'))
const format = value => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, ''))
const escape = text => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/**
 * @param {{ query: string, vocabulary?: { manufacturers?: string[], specs?: Array<{ key: string, label: string, unit: string }>, places?: Array<{ id: string, name: string }>, categories?: string[] } }} params
 * @param {number} [currentYear]
 */
export function ask ({ query, vocabulary = {} }, currentYear = new Date().getFullYear()) {
  let text = ` ${String(query ?? '').toLowerCase().replaceAll(/[?!;]/g, ' ').replaceAll(/\s+/g, ' ').trim()} `
  const clauses = []
  const take = (pattern, handle) => {
    // Spaces stay single, so patterns can match them literally.
    text = text.replace(pattern, (...match) => {
      handle(match)
      return ' '
    }).replaceAll(/ {2,}/g, ' ')
  }

  // Passport readiness.
  take(/\b(not (?:passport[- ])?ready|incomplete|with gaps|having gaps|gaps)\b/g, () => clauses.push({ type: 'readiness', op: 'lt', value: 1, label: 'Passport incomplete' }))
  take(/\b(passport[- ]ready|complete|ready)\b/g, () => clauses.push({ type: 'readiness', op: 'eq', value: 1, label: 'Passport ready' }))

  // Live status.
  take(/\b(?:alarms? or warnings?|warnings? or alarms?)\b/g, () => clauses.push({ type: 'status', levels: ['warning', 'alarm'], label: 'Warning or alarm' }))
  take(/\b(in alarm|alarms?|alarming|critical|overheat\w*|hot)\b/g, () => clauses.push({ type: 'status', levels: ['alarm'], label: 'In alarm' }))
  take(/\b(warnings?|attention|abnormal|anomal\w*|unusual)\b/g, () => clauses.push({ type: 'status', levels: ['warning', 'alarm'], label: 'Warning or alarm' }))
  take(/\b(live|monitored|connected)\b/g, () => clauses.push({ type: 'live', label: 'With live data' }))

  // Missing data: "without carbon footprint", "missing serial number", "no docs".
  const triggers = new Set(['without', 'missing', 'lacking', 'lacks', 'no', 'w/o'])
  const articles = new Set(['a', 'an', 'the', 'any'])
  const boundaries = new Set(['and', 'or', 'with', 'from', 'by', 'in', 'on', 'at', 'over', 'above', 'under', 'below', 'older', 'newer', 'built', 'made', 'before', 'after', 'since'])
  const tokens = text.trim().split(' ')
  for (let start = 0; start < tokens.length; start++) {
    if (!triggers.has(tokens[start])) {
      continue
    }
    let end = start + 1
    while (articles.has(tokens[end])) {
      end++
    }
    const words = []
    while (end < tokens.length && words.length < 4 && !boundaries.has(tokens[end]) && !tokens[end].endsWith(',')) {
      words.push(tokens[end++])
    }
    const found = missingTopics.find(([pattern]) => pattern.test(words.join(' ')))
    if (found) {
      clauses.push({ type: 'missing', checks: found[1], label: `Missing ${found[2]}` })
      tokens.fill('', start, end)
      start = end - 1
    }
  }
  text = ` ${tokens.filter(Boolean).join(' ')} `

  // Age: "older than 10 years", "built before 2015", "newer than 2020".
  take(/\bolder than (\d+) years?\b/g, ([, years]) => clauses.push({ type: 'year', op: 'lt', value: currentYear - Number(years), label: `Older than ${years} years` }))
  take(/\b(?:newer|younger) than (\d+) years?\b/g, ([, years]) => clauses.push({ type: 'year', op: 'gt', value: currentYear - Number(years), label: `Newer than ${years} years` }))
  take(/\b(?:before|prior to|until|older than) ((?:19|20)\d{2})\b/g, ([, year]) => clauses.push({ type: 'year', op: 'lt', value: Number(year), label: `Built before ${year}` }))
  take(/\b(?:after|newer than) ((?:19|20)\d{2})\b/g, ([, year]) => clauses.push({ type: 'year', op: 'gt', value: Number(year), label: `Built after ${year}` }))
  take(/\bsince ((?:19|20)\d{2})\b/g, ([, year]) => clauses.push({ type: 'year', op: 'gte', value: Number(year), label: `Built since ${year}` }))
  take(/\b(?:from|in) ((?:19|20)\d{2})\b/g, ([, year]) => clauses.push({ type: 'year', op: 'eq', value: Number(year), label: `Built in ${year}` }))

  // Carbon: "co2 over 500 kg", "footprint above 1 t", "more than 200 kg co2".
  const carbonWords = '(?:co2e?|co₂e?|carbon(?: footprint)?|footprint|pcf|emissions?)'
  const carbonClause = (op, value, unit) => {
    const kg = number(value) * ((unit ?? '').startsWith('t') ? 1000 : 1)
    const { op: operator, symbol } = comparator(op)
    clauses.push({ type: 'carbon', op: operator, value: kg, label: `CO₂e ${symbol} ${format(kg)} kg` })
  }
  take(new RegExp(String.raw`\b${carbonWords} (${comparatorPattern}) (\d+(?:[.,]\d+)?)(?: ?(kg|tons?|tonnes?|t))?\b(?: ${carbonWords})?`, 'g'), ([, op, value, unit]) => carbonClause(op, value, unit))
  take(new RegExp(String.raw`(${comparatorPattern}) (\d+(?:[.,]\d+)?)(?: ?(kg|tons?|tonnes?|t))? (?:of )?${carbonWords}`, 'g'), ([, op, value, unit]) => carbonClause(op, value, unit))

  // Technical key figures: "over 50 kw", "power above 10", "between 5 and 20 bar".
  const specs = vocabulary.specs ?? []
  const specClause = (quantity, unitPattern, factor, unit, op, value, value2) => {
    const matching = specs.filter(spec => quantity.test(spec.key) || quantity.test(spec.label))
    const keys = matching.length > 0 ? matching.map(spec => spec.key) : []
    const label = matching[0]?.label ?? quantity.source.split('|', 1)[0]
    const scaled = number(value) * factor
    if (op === 'between') {
      const upper = number(value2) * factor
      clauses.push({ type: 'spec', keys, pattern: quantity.source, op, value: scaled, value2: upper, label: `${capitalize(label)} ${format(scaled)}–${format(upper)} ${unit}`.trim() })
    } else {
      const { op: operator, symbol } = comparator(op)
      clauses.push({ type: 'spec', keys, pattern: quantity.source, op: operator, value: scaled, label: `${capitalize(label)} ${symbol} ${format(scaled)} ${unit}`.trim() })
    }
  }
  const resolve = (quantityText, unitText) => {
    const byUnit = unitText ? unitWords.find(([pattern]) => pattern.test(unitText)) : undefined
    const byWord = quantityText ? quantityWords.find(([pattern]) => pattern.test(quantityText)) : undefined
    if (byWord) {
      const unit = byUnit && byUnit[1].source === byWord[1].source ? byUnit : unitWords.find(([, quantity]) => quantity.source === byWord[1].source)
      return { quantity: byWord[1], factor: unit && byUnit === unit ? unit[2] : 1, unit: unit?.[3] ?? '' }
    }
    return byUnit ? { quantity: byUnit[1], factor: byUnit[2], unit: byUnit[3] } : undefined
  }
  const quantityPattern = '(power(?:ful)?|strong(?:er)?|voltage|current|amps?|speed|rpm|weight|heav(?:y|ier)|mass|light(?:er)?|pressure|flow(?: ?rate)?|torque|payload|reach|throughput|capacity|diameter|dn)'
  const unitPattern = String.raw`(kw|mw|rpm|1\/min|kg|kilograms?|tons?|tonnes?|bar|m3\/h|m³\/h|nm|mm|[atvw])`
  take(new RegExp(String.raw`(?:${quantityPattern} )?between (\d+(?:[.,]\d+)?)(?: ?${unitPattern})? and (\d+(?:[.,]\d+)?)(?: ?${unitPattern})?\b`, 'g'), ([, quantity, low, unitLow, high, unitHigh]) => {
    const resolved = resolve(quantity, unitHigh ?? unitLow)
    if (resolved) {
      specClause(resolved.quantity, null, resolved.factor, resolved.unit, 'between', low, high)
    }
  })
  take(new RegExp(String.raw`(?:${quantityPattern} (?:of |is )?)?(${comparatorPattern}) (\d+(?:[.,]\d+)?)(?: ?${unitPattern})?(?=[\s,]|$)(?: ${quantityPattern})?`, 'g'), ([whole, before, op, value, unit, after]) => {
    const resolved = resolve(before ?? after ?? impliedQuantity(op), unit)
    if (resolved) {
      specClause(resolved.quantity, null, resolved.factor, resolved.unit, op, value)
    } else {
      text += ` ${whole} `
    }
  })

  // Places: "in line 1", "in the rotary filler", "utilities".
  for (const place of (vocabulary.places ?? []).toSorted((a, b) => b.name.length - a.name.length)) {
    const full = place.name.toLowerCase()
    const aliases = [full, full.split(/\s+[–—-]\s+/, 1)[0], full.replace(/^[a-z]?\d+\s+/, '')].filter((alias, index, all) => alias.length > 2 && all.indexOf(alias) === index)
    for (const alias of aliases) {
      const pattern = new RegExp(String.raw`(?:\b(?:in|on|at|of|inside|within|under)\s+(?:the\s+)?)?(?<![\w-])${escape(alias)}(?![\w-])`, 'g')
      if (pattern.test(text)) {
        take(pattern, () => {})
        clauses.push({ type: 'within', id: place.id, label: `In ${place.name}` })
        break
      }
    }
  }

  // Manufacturers, by name or by their distinctive first word.
  const generic = /^(?:gmbh|ag|inc|co|ltd|systems?|instruments|automation|technik|fluid|kg|the|und|&)$/
  for (const manufacturer of vocabulary.manufacturers ?? []) {
    const full = manufacturer.toLowerCase()
    const word = full.split(/[\s&.,]+/).find(part => part.length >= 4 && !generic.test(part))
    for (const alias of [full, word].filter(Boolean)) {
      const pattern = new RegExp(String.raw`(?:\b(?:from|by|made by|of)\s+)?(?<![\w-])${escape(alias)}(?![\w-])`, 'g')
      if (pattern.test(text)) {
        take(pattern, () => {})
        const existing = clauses.find(clause => clause.type === 'manufacturer')
        if (existing) {
          existing.names.push(manufacturer)
          existing.label = `By ${existing.names.join(' or ')}`
        } else {
          clauses.push({ type: 'manufacturer', names: [manufacturer], label: `By ${manufacturer}` })
        }
        break
      }
    }
  }

  // Categories.
  const keys = []
  const labels = []
  for (const [pattern, key, label] of categoryWords) {
    const global = new RegExp(pattern.source, 'g')
    if (global.test(text)) {
      take(global, () => {})
      keys.push(key)
      labels.push(label)
    }
  }
  if (keys.length > 0) {
    clauses.unshift({ type: 'category', keys, label: labels.join(' or ') })
  }

  // Whatever is left is searched in names, designations and manufacturers.
  const words = text.split(/[\s,]+/).map(word => word.trim()).filter(word => word.length > 1 && !stopwords.has(word) && !/^(?:or|not|no|than|kw|[avw]|bar)$/.test(word))
  if (words.length > 0) {
    clauses.push({ type: 'text', words, label: `“${words.join(' ')}”` })
  }
  return { clauses }
}

/** "heavier than 5 t" means weight, "stronger than 10 kW" power. */
function impliedQuantity (op) {
  const implied = [[/heavier|lighter/, 'weight'], [/stronger|weaker/, 'power'], [/faster|slower/, 'speed']]
  return implied.find(([pattern]) => pattern.test(op))?.[1]
}

function capitalize (text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
