import type { InfrastructureRecord } from './infrastructures'
import type { YAMLMap, YAMLSeq } from 'yaml'
import type { z } from 'zod'
import { Document, parseDocument } from 'yaml'
import { infrastructureInputSchema, managedInfrastructureKeySchema } from '#shared/contract'
import { ConfigurationError } from './config'
import { exportConnection } from './connections/secrets'

// The deployment's infrastructure file (ADR 0037): YAML with the fields of
// the infrastructure API input plus a stable key per entry.
//
//   version: 1
//   infrastructures:
//     - key: factory-a
//       name: Factory A
//       template: mono-all
//       endpoints:
//         - { type: aasEnvironment, url: https://basyx.example.org }
//       security: { mode: unsecured }
//       connections:
//         - key: influx
//           type: influxdb2
//           url: http://influxdb:8086
//           auth: { scheme: token, token: { ref: env:INFLUX_TOKEN } }

export type ParsedInfrastructureInput = z.output<typeof infrastructureInputSchema>

export interface DeclaredInfrastructure {
  key: string
  input: ParsedInfrastructureInput
  /** Where the entry was declared, for error messages. */
  source: string
}

export const infrastructureFileVersion = 1

const inputFields = new Set(Object.keys(infrastructureInputSchema.shape))

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface AnalyzedEntry {
  index: number
  key: string | null
  name: string | null
  /** The parsed input; `null` when the entry has problems. */
  input: ParsedInfrastructureInput | null
  /** Problems of this entry, each with its path within the entry. */
  problems: string[]
}

export interface AnalyzedFile {
  /** Problems of the file as a whole (syntax, `version`, unknown fields). */
  problems: string[]
  entries: AnalyzedEntry[]
}

/**
 * Reads an infrastructure file and reports every problem with its place, so
 * the whole file can be fixed in one go. Pasted imports may leave out keys
 * (`requireKey: false`); the deployment's file may not.
 */
export function analyzeInfrastructureFile (text: string, options: { requireKey: boolean }): AnalyzedFile {
  const document = parseDocument(text)
  if (document.errors.length > 0) {
    const [error] = document.errors
    const line = error!.linePos?.[0]
    return { problems: [`invalid YAML${line ? ` at line ${line.line}, column ${line.col}` : ''}: ${error!.message.split('\n', 1)[0]!.replace(/ at line \d+, column \d+:?$/, '')}`], entries: [] }
  }
  const content: unknown = document.toJS()
  if (content === null || content === undefined) {
    return { problems: [], entries: [] }
  }
  if (!isRecord(content)) {
    return { problems: ['expected a mapping with `version` and `infrastructures`'], entries: [] }
  }

  const problems: string[] = []
  for (const field of Object.keys(content)) {
    if (field !== 'version' && field !== 'infrastructures') {
      problems.push(`${field}: unknown field`)
    }
  }
  if (content.version !== infrastructureFileVersion) {
    problems.push(`version: must be ${infrastructureFileVersion}`)
  }
  const list = content.infrastructures ?? []
  if (!Array.isArray(list)) {
    problems.push('infrastructures: must be a list')
  }

  const entries: AnalyzedEntry[] = []
  const keys = new Set<string>()
  for (const [index, entry] of (Array.isArray(list) ? list : []).entries()) {
    if (!isRecord(entry)) {
      entries.push({ index, key: null, name: null, input: null, problems: ['entry: must be a mapping'] })
      continue
    }
    const { key, ...fields } = entry
    const entryProblems: string[] = []
    let parsedKey: string | null = null
    if (key !== undefined || options.requireKey) {
      const result = managedInfrastructureKeySchema.safeParse(key)
      if (!result.success) {
        entryProblems.push(`key: ${key === undefined ? 'required' : result.error.issues[0]!.message}`)
      } else if (keys.has(result.data)) {
        entryProblems.push('key: declared more than once')
      } else {
        parsedKey = result.data
        keys.add(result.data)
      }
    }
    for (const field of Object.keys(fields)) {
      if (!inputFields.has(field)) {
        entryProblems.push(`${field}: unknown field`)
      }
    }
    const parsed = infrastructureInputSchema.safeParse(fields)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        entryProblems.push(`${issue.path.length > 0 ? issue.path.join('.') : 'entry'}: ${issue.message}`)
      }
    }
    entries.push({
      index,
      key: parsedKey ?? (typeof key === 'string' ? key : null),
      name: typeof fields.name === 'string' ? fields.name : null,
      input: parsed.success && entryProblems.length === 0 ? parsed.data : null,
      problems: entryProblems,
    })
  }
  return { problems, entries }
}

/**
 * Parses one infrastructure file of the deployment. Every problem is reported
 * with its place (`infrastructures[1] (factory-a).endpoints.0.url: …`); any
 * problem rejects the whole file.
 */
export function parseInfrastructureFile (text: string, source: string): DeclaredInfrastructure[] {
  const analyzed = analyzeInfrastructureFile(text, { requireKey: true })
  const problems = [
    ...analyzed.problems,
    ...analyzed.entries.flatMap(entry => entry.problems.map(problem => `infrastructures[${entry.index}]${entry.key ? ` (${entry.key})` : ''}.${problem}`)),
  ]
  if (problems.length > 0) {
    throw new ConfigurationError(`${source}: ${problems.join('; ')}`)
  }
  return analyzed.entries.map(entry => ({ key: entry.key!, input: entry.input!, source }))
}

/** Parses all infrastructure sources of a deployment; a key may be declared only once across them. */
export function parseInfrastructureSources (sources: Array<{ source: string, text: string }>): DeclaredInfrastructure[] {
  const declared = sources.flatMap(({ source, text }) => parseInfrastructureFile(text, source))
  const seen = new Map<string, string>()
  for (const entry of declared) {
    const first = seen.get(entry.key)
    if (first !== undefined) {
      throw new ConfigurationError(`The infrastructure key ${entry.key} is declared in both ${first} and ${entry.source}.`)
    }
    seen.set(entry.key, entry.source)
  }
  return declared
}

/** A key for an infrastructure made in Studio: its name as a slug, unique within the export. */
function keyFor (name: string, taken: Set<string>): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55) || 'infrastructure'
  let key = base
  for (let suffix = 2; taken.has(key); suffix++) {
    key = `${base}-${suffix}`
  }
  taken.add(key)
  return key
}

/**
 * Writes infrastructures in the file format, for the deployment's file or an
 * import into another Studio. References to deployment secrets are kept;
 * secrets and certificates stored in this Studio never leave it, and a
 * comment above the entry says what to add.
 */
export function exportInfrastructureFile (records: InfrastructureRecord[]): string {
  const taken = new Set(records.map(record => record.managedKey).filter((key): key is string => key !== null))
  const notes: string[][] = []
  const entries = records.map(record => {
    const missing: string[] = []
    let security: Record<string, unknown> = { mode: 'unsecured' }
    if (record.security.mode !== 'unsecured') {
      const { clientSecret, ...oidc } = record.security
      security = { ...oidc }
      if (clientSecret?.kind === 'stored') {
        missing.push('clientSecret is stored in the Studio it was exported from; add it as { ref: env:NAME } or { ref: file:/path }.')
      } else if (clientSecret?.ref) {
        security.clientSecret = { ref: `${clientSecret.kind}:${clientSecret.ref}` }
      }
    }
    let clientCertificate: Record<string, unknown> | undefined
    if (record.clientCertificate?.kind === 'stored') {
      missing.push('clientCertificate is stored in the Studio it was exported from; add it as { ref: file:/path, passphraseRef: env:NAME }.')
    } else if (record.clientCertificate?.ref) {
      clientCertificate = {
        ref: `file:${record.clientCertificate.ref}`,
        ...(record.clientCertificate.passphraseRef ? { passphraseRef: record.clientCertificate.passphraseRef } : {}),
      }
    }
    const connections = record.connections.map(connection => {
      const { entry, missing: secret } = exportConnection(connection)
      if (secret) {
        missing.push(secret)
      }
      return entry
    })
    notes.push(missing)
    return {
      key: record.managedKey ?? keyFor(record.name, taken),
      name: record.name,
      ...(record.description ? { description: record.description } : {}),
      template: record.template,
      endpoints: record.endpoints.map(({ type, url }) => ({ type, url })),
      listSource: record.listSource,
      sync: record.sync,
      security,
      ...(clientCertificate ? { clientCertificate } : {}),
      allowPrivateNetwork: record.allowPrivateNetwork,
      ...(connections.length > 0 ? { connections } : {}),
    }
  })

  const document = new Document({ version: infrastructureFileVersion, infrastructures: entries })
  document.commentBefore = ' BaSyx Studio infrastructures: import them in Studio or set them as STUDIO_INFRASTRUCTURES_FILE.'
  const list = document.get('infrastructures', true) as YAMLSeq<YAMLMap>
  for (const [index, missing] of notes.entries()) {
    if (missing.length > 0) {
      list.items[index]!.commentBefore = missing.map(line => ` ${line}`).join('\n')
    }
  }
  return document.toString({ lineWidth: 0 })
}
