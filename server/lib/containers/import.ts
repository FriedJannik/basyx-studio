import type { StackSpec } from '#shared/contract'
import type { ArchiveLimits } from '../workspaces/archive'
import type { StackSecrets, StackUser } from './security'
import { readFile, stat } from 'node:fs/promises'
import { basename, posix } from 'node:path'
import { strFromU8, unzip } from 'fflate'
import { stackSpecSchema } from '#shared/contract'
import { StudioProblem } from '../problem'
import { inspectArchive } from '../workspaces/archive'

// Import of an exported ZIP or a bare `basyx-stack.json` (plan X4). Only the
// spec, `.env`, the realm's users and the AASX files are read; a hand-edited
// compose file is ignored.

export interface ParsedImport {
  spec: StackSpec
  /** Secrets found in the export; missing ones are generated on create. */
  secrets: Partial<StackSecrets>
  aasx: Map<string, Uint8Array>
  /** A compose file was there and is not read. */
  composeIgnored: boolean
  database?: Uint8Array
}

const MiB = 1024 * 1024

/**
 * Limits of an exported ZIP (DATA-006): its database snapshot and up to
 * 500 MB of AASX files, checked from the central directory before anything
 * is decompressed.
 */
export const importArchiveLimits: ArchiveLimits = {
  maxArchiveBytes: 1024 * MiB,
  maxEntries: 200,
  maxEntryBytes: 1024 * MiB,
  maxTotalBytes: 1024 * MiB,
  maxCompressionRatio: 200,
  ratioThresholdBytes: MiB,
}

/** A bare `basyx-stack.json` holds settings only. */
const maxSpecBytes = MiB

function invalid (detail: string): StudioProblem {
  return new StudioProblem('invalid_request', detail)
}

function parseSpec (text: string): StackSpec {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw invalid('basyx-stack.json is not valid JSON.')
  }
  const parsed = stackSpecSchema.safeParse(json)
  if (!parsed.success) {
    throw new StudioProblem('invalid_request', 'basyx-stack.json is not a BaSyx Studio setup this version understands.', {
      violations: parsed.error.issues.map(issue => ({ path: `basyx-stack.json#${issue.path.join('.')}`, message: issue.message })),
    })
  }
  return parsed.data
}

function parseEnv (text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (match) {
      values[match[1]!] = match[2]!.trim().replace(/^(["'])(.*)\1$/, '$2')
    }
  }
  return values
}

const roleOfRealmRole: Record<string, StackUser['role']> = {
  'basyx-admin': 'admin',
  'basyx-viewer': 'viewer',
  'basyx-user': 'user',
}

/** The users of an exported realm, with their fixed IDs and passwords. */
function usersOfRealm (text: string): StackUser[] {
  try {
    const realm = JSON.parse(text) as { users?: Array<{ id?: string, username?: string, realmRoles?: string[], credentials?: Array<{ type?: string, value?: string }> }> }
    return (realm.users ?? []).flatMap(user => {
      const password = user.credentials?.find(credential => credential.type === 'password')?.value
      const role = (user.realmRoles ?? []).map(name => roleOfRealmRole[name]).find(Boolean)
      return user.id && user.username && password && role ? [{ id: user.id, username: user.username, password, role }] : []
    })
  } catch {
    return []
  }
}

/** Decompresses in a worker thread, so a large export does not block Studio's requests. */
function unzipped (bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, { filter: file => !file.name.endsWith('/') }, (error, entries) => error ? reject(error) : resolve(entries))
  })
}

/** Reads an export the user chose, within the limits, before parsing it. */
export async function readImport (path: string): Promise<ParsedImport> {
  const json = path.toLowerCase().endsWith('.json')
  const { size } = await stat(path)
  if (size > (json ? maxSpecBytes : importArchiveLimits.maxArchiveBytes)) {
    throw invalid('The file is too large for a BaSyx Studio export.')
  }
  return parseImport(new Uint8Array(await readFile(path)), basename(path))
}

export async function parseImport (bytes: Uint8Array, fileName: string): Promise<ParsedImport> {
  if (fileName.toLowerCase().endsWith('.json')) {
    if (bytes.length > maxSpecBytes) {
      throw invalid('basyx-stack.json is too large.')
    }
    return { spec: parseSpec(strFromU8(bytes)), secrets: {}, aasx: new Map(), composeIgnored: false }
  }
  inspectArchive(bytes, importArchiveLimits, 'BaSyx Studio export (ZIP)')
  let entries: Record<string, Uint8Array>
  try {
    entries = await unzipped(bytes)
  } catch {
    throw invalid('The file is not a ZIP file.')
  }
  // The export has one top folder; files may also be at the root.
  const specPath = Object.keys(entries).filter(path => posix.basename(path) === 'basyx-stack.json').toSorted((a, b) => a.length - b.length)[0]
  if (!specPath) {
    throw invalid('The ZIP file has no basyx-stack.json. Choose a ZIP file exported from BaSyx Studio.')
  }
  const root = posix.dirname(specPath) === '.' ? '' : `${posix.dirname(specPath)}/`
  const at = (path: string) => entries[`${root}${path}`]
  const spec = parseSpec(strFromU8(entries[specPath]!))

  const secrets: Partial<StackSecrets> = {}
  const env = at('.env')
  if (env) {
    const values = parseEnv(strFromU8(env))
    if (values.POSTGRES_PASSWORD) {
      secrets.databasePassword = values.POSTGRES_PASSWORD
    }
    if (values.KEYCLOAK_ADMIN_PASSWORD) {
      secrets.keycloakAdminPassword = values.KEYCLOAK_ADMIN_PASSWORD
    }
  }
  const realm = at('config/keycloak/realm.json')
  if (realm) {
    const users = usersOfRealm(strFromU8(realm))
    if (users.length > 0) {
      secrets.users = users
    }
  }
  const aasx = new Map<string, Uint8Array>()
  for (const name of spec.aasxFiles) {
    const content = at(`aasx/${name}`)
    if (content) {
      aasx.set(name, content)
    }
  }
  const database = at('data/database.dump')
  if (database && strFromU8(database.subarray(0, 5)) !== 'PGDMP') {
    throw invalid('The database backup is not a PostgreSQL archive.')
  }
  return { spec, secrets, aasx, composeIgnored: Boolean(at('docker-compose.yml')), database }
}
