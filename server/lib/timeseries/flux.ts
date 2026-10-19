import { StudioProblem } from '../problem'

// Flux queries of LinkedSegments (ADR 0040). The query comes from AAS
// content, so Studio checks it before sending it with a connection's token.
// The real boundary is a read-only token limited to the needed buckets; this
// check is defence in depth against queries that write or reach out.

/** The packages a query may import; everything else (http, sql, secrets, experimental, …) is refused. */
export const allowedFluxImports = new Set(['strings', 'math', 'date', 'array', 'experimental/aggregate'])

/** The point count per graph that `v.windowPeriod` aims at, as in the BaSyx AAS Web UI. */
export const pointsPerGraph = 360

type FluxToken = { kind: 'word' | 'punct', text: string } | { kind: 'string', text: string }

function refuse (message: string): StudioProblem {
  return new StudioProblem('connection_request_refused', message)
}

/** Keywords after which an expression, and so a regular expression literal, starts. */
const expressionKeywords = new Set(['return', 'then', 'else', 'and', 'or', 'not', 'exists'])

/** Whether a `/` after this token starts a regular expression literal, as Flux reads it; otherwise it divides. */
function regexMayFollow (previous: FluxToken | undefined): boolean {
  if (!previous) {
    return true
  }
  if (previous.kind === 'word') {
    return expressionKeywords.has(previous.text)
  }
  return previous.kind === 'punct' && !')]}'.includes(previous.text)
}

/**
 * The query as tokens, without comments: words (identifiers, keywords and
 * numbers), strings with their text, and single punctuation characters. The
 * code inside string interpolations (`${…}`) is tokenized too, as Flux runs
 * it. Fails closed on anything it cannot read, such as an unterminated string.
 */
function tokenize (query: string): FluxToken[] {
  const tokens: FluxToken[] = []
  let index = 0

  const readString = (): void => {
    let text = ''
    index++ // opening quote
    while (index < query.length && query[index] !== '"') {
      if (query[index] === '\\') {
        text += query[index + 1] ?? ''
        index += 2
      } else if (query.startsWith('${', index)) {
        index += 2
        readCode('}')
      } else {
        text += query[index]
        index++
      }
    }
    if (index >= query.length) {
      throw refuse('The Flux query has a string that does not end; Studio only sends queries it can check.')
    }
    index++ // closing quote
    tokens.push({ kind: 'string', text })
  }

  /** Reads code up to `end` (the `}` of an interpolation) or the end of the query. */
  const readCode = (end: string | null): void => {
    let depth = 0
    while (index < query.length) {
      const char = query[index]!
      if (end && char === end && depth === 0) {
        index++
        return
      }
      if (query.startsWith('//', index)) {
        index = query.includes('\n', index) ? query.indexOf('\n', index) : query.length
      } else if (char === '"') {
        readString()
      } else if (/\s/.test(char)) {
        index++
      } else if (/\w/.test(char)) {
        const word = /^\w+/.exec(query.slice(index))![0]
        tokens.push({ kind: 'word', text: word })
        index += word.length
      } else if (char === '/' && regexMayFollow(tokens.at(-1))) {
        const literal = /^\/(?:[^/\\\n]|\\.)*\//.exec(query.slice(index))
        if (!literal) {
          throw refuse('The Flux query has a regular expression that does not end; Studio only sends queries it can check.')
        }
        index += literal[0].length
        tokens.push({ kind: 'punct', text: 'regex' })
      } else {
        if (char === '{') {
          depth++
        } else if (char === '}') {
          depth--
        }
        tokens.push({ kind: 'punct', text: char })
        index++
      }
    }
    if (end) {
      throw refuse('The Flux query has a string interpolation that does not end; Studio only sends queries it can check.')
    }
  }

  readCode(null)
  return tokens
}

function isCall (tokens: FluxToken[], index: number, name: string) {
  return tokens[index]?.kind === 'word' && tokens[index]!.text === name
    && tokens[index + 1]?.text === '(' && tokens[index + 1]?.kind === 'punct'
    && !(tokens[index - 1]?.kind === 'punct' && tokens[index - 1]!.text === '.')
}

/** Whether the call whose `(` is at `open` names `argument` at its own level. */
function hasArgument (tokens: FluxToken[], open: number, argument: string): boolean {
  let depth = 0
  for (let index = open; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token.kind === 'punct' && '([{'.includes(token.text)) {
      depth++
    } else if (token.kind === 'punct' && ')]}'.includes(token.text)) {
      depth--
      if (depth === 0) {
        return false
      }
    } else if (depth === 1 && token.kind === 'word' && token.text === argument && tokens[index + 1]?.text === ':') {
      return true
    }
  }
  return false
}

/**
 * Refuses a query that imports other packages, writes (`to()`) or makes
 * InfluxDB query another server (`from(host: …)`). Every import counts,
 * wherever it stands, also inside string interpolations.
 */
export function checkFluxQuery (query: string): void {
  const tokens = tokenize(query)
  const refused: string[] = []
  for (const [index, token] of tokens.entries()) {
    if (token.kind !== 'word' || token.text !== 'import' || tokens[index - 1]?.text === '.') {
      continue
    }
    const target = tokens[index + 1]?.kind === 'word' ? tokens[index + 2] : tokens[index + 1]
    if (target?.kind !== 'string') {
      throw refuse('The Flux query has an import Studio cannot read; Studio only sends queries it can check.')
    }
    if (!allowedFluxImports.has(target.text)) {
      refused.push(target.text)
    }
  }
  if (refused.length > 0) {
    throw refuse(`The Flux query imports ${refused.join(', ')}; Studio only sends queries that import ${[...allowedFluxImports].join(', ')}.`)
  }
  if (tokens.some((_, index) => isCall(tokens, index, 'to'))) {
    throw refuse('The Flux query writes data (to()); Studio only sends queries that read.')
  }
  if (tokens.some((_, index) => isCall(tokens, index, 'from') && hasArgument(tokens, index + 1, 'host'))) {
    throw refuse('The Flux query reads from another server (from(host: …)); Studio only sends queries to the configured database.')
  }
}

export interface FluxRange {
  start: string
  stop: string
}

/**
 * Sets the dashboard variables of the BaSyx AAS Web UI: every `{{y-value}}`
 * becomes the value's record idShort (checked to be an idShort, so it cannot
 * carry Flux syntax), `v.timeRangeStart` and `v.timeRangeStop` the range, and
 * `v.windowPeriod` a period that gives about 360 points.
 */
export function interpolateFlux (query: string, value: string | null, range: FluxRange): string {
  const durationMs = Date.parse(range.stop) - Date.parse(range.start)
  const windowPeriodMs = Math.max(1, Math.round(durationMs / pointsPerGraph))
  const withValue = value === null ? query : query.replaceAll('{{y-value}}', value)
  return withValue
    .replaceAll(/\bv\.timeRangeStart\b/g, new Date(range.start).toISOString())
    .replaceAll(/\bv\.timeRangeStop\b/g, new Date(range.stop).toISOString())
    .replaceAll(/\bv\.windowPeriod\b/g, `${windowPeriodMs}ms`)
}

/** Whether the query is a template with one query per selected value. */
export function isValueTemplate (query: string): boolean {
  return query.includes('{{y-value}}')
}
