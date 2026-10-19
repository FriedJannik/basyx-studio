import type { Connection, ConnectionAuthSummary, ParsedConnectionInput, SecretInput, SecretSummary } from '#shared/contract'
import type { StudioDeps } from '../deps'
import type { Violation } from '../problem'
import { readFile } from 'node:fs/promises'
import { connectionSecretFields } from '#shared/contract'
import { StudioProblem } from '../problem'

// Connections as stored with their infrastructure (ADR 0040): the summaries
// in `connections`, the desktop's stored secret values in one encrypted map
// from connection key to secret field. References (`env:`, `file:`) are
// resolved when a connection is used.

const secretsPurpose = 'infrastructures.connection_secret'

type SecretMap = Record<string, Record<string, string>>

export interface StoredConnections {
  connections: Connection[]
  connectionSecretsCiphertext: string | null
}

/** The value of an `env:NAME` or `file:/path` reference, or undefined if it cannot be read. */
export async function readSecretReference (reference: string): Promise<string | undefined> {
  const [kind, ...rest] = reference.split(':')
  const ref = rest.join(':')
  if (kind === 'env') {
    return process.env[ref]
  }
  return kind === 'file' ? readFile(ref, 'utf8').then(content => content.trim(), () => undefined) : undefined
}

function readMap (deps: StudioDeps, ciphertext: string | null): SecretMap {
  return ciphertext ? JSON.parse(deps.cipher.decrypt(ciphertext, secretsPurpose)) as SecretMap : {}
}

type SecretField = NonNullable<(typeof connectionSecretFields)[keyof typeof connectionSecretFields]>

function secretSummary (auth: ConnectionAuthSummary): SecretSummary | null {
  const field = connectionSecretFields[auth.scheme]
  return field ? (auth as unknown as Record<SecretField, SecretSummary | null>)[field] : null
}

/**
 * Turns validated connection inputs into what is stored. A secret given as a
 * reference is kept as one; a value is accepted on desktop only and goes into
 * the encrypted map. An omitted secret keeps the one stored for the same key
 * and scheme; a new connection without one is invalid.
 */
export function storeConnections (
  deps: StudioDeps,
  inputs: ParsedConnectionInput[],
  previous?: StoredConnections,
): StoredConnections {
  const previousMap = readMap(deps, previous?.connectionSecretsCiphertext ?? null)
  const nextMap: SecretMap = {}
  const violations: Violation[] = []

  const connections = inputs.map((input, index): Connection => {
    const { auth, ...fields } = input
    const field = connectionSecretFields[auth.scheme]
    const path = `connections.${index}.auth.${field}`
    let summary: SecretSummary | null = null
    if (field) {
      const secret = (auth as Partial<Record<SecretField, SecretInput>>)[field]
      const kept = previous?.connections.find(connection => connection.key === input.key && connection.auth.scheme === auth.scheme)
      if (secret && 'value' in secret) {
        if (deps.config.deploymentMode === 'desktop') {
          summary = { kind: 'stored', ref: null }
          nextMap[input.key] = { [field]: secret.value }
        } else {
          violations.push({ path, message: 'Hosted Studio accepts secrets only as env: or file: references to deployment secrets' })
        }
      } else if (secret) {
        const [kind, ...rest] = secret.ref.split(':')
        summary = { kind: kind as 'env' | 'file', ref: rest.join(':') }
      } else if (kept && secretSummary(kept.auth)) {
        summary = secretSummary(kept.auth)
        const value = previousMap[kept.key]?.[field]
        if (summary?.kind === 'stored' && value !== undefined) {
          nextMap[input.key] = { [field]: value }
        }
      } else {
        violations.push({ path, message: 'required' })
      }
    }
    const storedAuth = field ? { ...auth, [field]: summary } : auth
    return { ...fields, auth: storedAuth } as Connection
  })

  if (violations.length > 0) {
    throw new StudioProblem('invalid_request', 'The connections of the infrastructure are invalid.', { violations })
  }
  return {
    connections,
    connectionSecretsCiphertext: Object.keys(nextMap).length > 0 ? deps.cipher.encrypt(JSON.stringify(nextMap), secretsPurpose) : null,
  }
}

/** Resolves the secret of a connection, or undefined for schemes without one. */
export async function resolveConnectionSecret (
  deps: StudioDeps,
  record: Pick<StoredConnections, 'connectionSecretsCiphertext'>,
  connection: Connection,
): Promise<string | undefined> {
  const field = connectionSecretFields[connection.auth.scheme]
  const summary = secretSummary(connection.auth)
  if (!field || !summary) {
    return undefined
  }
  const value = summary.kind === 'stored'
    ? readMap(deps, record.connectionSecretsCiphertext)[connection.key]?.[field]
    : await readSecretReference(`${summary.kind}:${summary.ref}`)
  if (!value) {
    throw new StudioProblem('connection_credentials_unavailable', `The secret of the connection ${connection.key} could not be resolved.`)
  }
  return value
}

/** A connection in the file format: references kept, stored secrets left out (and reported). */
export function exportConnection (connection: Connection): { entry: Record<string, unknown>, missing: string | null } {
  const { auth, ...fields } = connection
  const field = connectionSecretFields[auth.scheme]
  const summary = secretSummary(auth)
  const { [field ?? '']: _secret, ...rest } = auth as Record<string, unknown>
  const exported: Record<string, unknown> = { ...rest }
  let missing: string | null = null
  if (field && summary?.kind === 'stored') {
    missing = `connections ${connection.key}: auth.${field} is stored in the Studio it was exported from; add it as { ref: env:NAME } or { ref: file:/path }.`
  } else if (field && summary?.ref) {
    exported[field] = { ref: `${summary.kind}:${summary.ref}` }
  }
  return { entry: { ...fields, auth: exported }, missing }
}
