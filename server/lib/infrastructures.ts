import type { ClientCertificateSummary, ImportResolution, Infrastructure, InfrastructureImportEntry, InfrastructureImportResult, ProbeResult, SecretInput, ServiceProfiles } from '#shared/contract'
import type { StoredSecurity } from '../database/schema'
import type { ClientIdentity } from './crypto/pkcs12'
import type { Actor, StudioDeps } from './deps'
import type { DeclaredInfrastructure } from './infrastructure-file'
import type { ClientCertificate, NetworkFailureKind, OutboundPolicy } from './network/guarded-fetch'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { infrastructureInputSchema } from '#shared/contract'
import { infrastructures } from '../database/schema'
import { recordAudit } from './audit'
import { ConfigurationError } from './config'
import { readSecretReference, storeConnections } from './connections/secrets'
import { randomToken } from './crypto/cipher'
import { Pkcs12Error, readPkcs12 } from './crypto/pkcs12'
import { analyzeInfrastructureFile, exportInfrastructureFile } from './infrastructure-file'
import { rejectUrl } from './network/address-policy'
import { checkHost, createGuardedFetch, NetworkFailure, releaseCertificateAgents } from './network/guarded-fetch'
import { forgetOidcClients } from './oidc/client'
import { StudioProblem } from './problem'
import { announcedFeatures } from './targets/profiles'

export type InfrastructureRecord = typeof infrastructures.$inferSelect

interface SecretSummary {
  kind: 'env' | 'file' | 'stored'
  ref: string | null
}

const secretPurpose = 'infrastructures.client_secret'
const certificatePurpose = 'infrastructures.client_certificate'

type ParsedInput = ReturnType<typeof infrastructureInputSchema.parse>

export function toInfrastructure (record: InfrastructureRecord): Infrastructure {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    template: record.template,
    endpoints: record.endpoints,
    listSource: record.listSource,
    sync: record.sync,
    serviceProfiles: record.serviceProfiles,
    probedAt: record.probedAt?.toISOString() ?? null,
    announced: announcedFeatures(record),
    security: record.security,
    clientCertificate: record.clientCertificate,
    allowPrivateNetwork: record.allowPrivateNetwork,
    connections: record.connections,
    managed: Boolean(record.managedKey),
    revision: record.revision,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

/** The AAS environment's base URL (serialization, upload), if the infrastructure has one. */
export function environmentUrl (record: Pick<InfrastructureRecord, 'endpoints'>): string | undefined {
  return record.endpoints.find(entry => entry.type === 'aasEnvironment')?.url.replace(/\/+$/, '')
}

/** The outbound policy for requests to a target's own endpoints, with its client certificate if it has one. */
export function targetPolicy (
  deps: StudioDeps,
  record: Pick<InfrastructureRecord, 'endpoints' | 'allowPrivateNetwork'>,
  clientCertificate?: ClientCertificate,
): OutboundPolicy {
  return {
    allowedOrigins: new Set(record.endpoints.map(endpoint => new URL(endpoint.url).origin)),
    allowPrivateNetwork: record.allowPrivateNetwork && deps.config.allowPrivateNetworkTargets,
    timeoutMs: 15_000,
    maxResponseBytes: 50 * 1024 * 1024,
    ...(clientCertificate ? { clientCertificate } : {}),
  }
}

export async function listInfrastructures (deps: StudioDeps): Promise<InfrastructureRecord[]> {
  const records = await deps.db.select().from(infrastructures).orderBy(asc(infrastructures.name))
  return Promise.all(records.map(record => withProfiles(deps, record)))
}

export async function getInfrastructure (deps: StudioDeps, id: string): Promise<InfrastructureRecord> {
  const [record] = await deps.db.select().from(infrastructures).where(eq(infrastructures.id, id))
  if (!record) {
    throw new StudioProblem('not_found', 'No such target.')
  }
  return withProfiles(deps, record)
}

/**
 * Infrastructures saved before Studio stored profiles (migration 0003) are
 * probed once when first loaded, so their features do not wait for an
 * administrator. A failed probe leaves them unprobed for the next load.
 */
async function withProfiles (deps: StudioDeps, record: InfrastructureRecord): Promise<InfrastructureRecord> {
  if (record.probedAt) {
    return record
  }
  const certificate = await resolveClientCertificate(deps, record).catch(() => null)
  if (certificate === null) {
    return record
  }
  const probe = await probeEndpoints(deps, record, certificate)
  if (probe.endpoints.every(endpoint => !endpoint.reachable)) {
    return record
  }
  const [updated] = await deps.db.update(infrastructures)
    .set({ serviceProfiles: storedProfiles(probe), probedAt: new Date(probe.checkedAt) })
    .where(eq(infrastructures.id, record.id))
    .returning()
  return updated ?? record
}

function parseInput (deps: StudioDeps, raw: unknown): ParsedInput {
  const parsed = infrastructureInputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new StudioProblem('invalid_request', 'The infrastructure configuration is invalid.', {
      violations: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
    })
  }
  const input = parsed.data
  if ((input.allowPrivateNetwork || input.connections.some(connection => connection.allowPrivateNetwork)) && !deps.config.allowPrivateNetworkTargets) {
    throw new StudioProblem('endpoint_rejected', 'This Studio deployment does not allow private-network or loopback targets.')
  }
  return input
}

/**
 * The URLs Studio contacts for an input, each with its place and whether it
 * may be private: endpoints, issuers, and the connections' services.
 * Connection aliases are never contacted.
 */
function urlsOf (input: ParsedInput): Array<[string, string, boolean]> {
  const urls: Array<[string, string, boolean]> = input.endpoints.map(endpoint => [endpoint.type, endpoint.url, input.allowPrivateNetwork])
  if (input.security.mode !== 'unsecured') {
    urls.push(['security.issuer', input.security.issuer, input.allowPrivateNetwork])
  }
  for (const connection of input.connections) {
    urls.push([`connections.${connection.key}.url`, connection.url, connection.allowPrivateNetwork])
    if (connection.auth.scheme === 'oauth2ClientCredentials') {
      urls.push([`connections.${connection.key}.auth.issuer`, connection.auth.issuer, connection.allowPrivateNetwork])
    }
  }
  return urls
}

/** Checks endpoint, issuer and connection URLs against the static URL rules and the address policy. */
async function validateUrls (input: ParsedInput): Promise<void> {
  for (const [label, url, allowPrivateNetwork] of urlsOf(input)) {
    try {
      await checkHost(new URL(url), { allowPrivateNetwork })
    } catch (error) {
      if (error instanceof NetworkFailure) {
        throw new StudioProblem('endpoint_rejected', `${label}: ${error.message}`)
      }
      throw error
    }
  }
}

interface ResolvedSecurity {
  security: StoredSecurity
  secretCiphertext: string | null
}

function resolveSecurityInput (
  deps: StudioDeps,
  input: ParsedInput['security'],
  previous: InfrastructureRecord | undefined,
): ResolvedSecurity {
  if (input.mode === 'unsecured') {
    return { security: { mode: 'unsecured' }, secretCiphertext: null }
  }

  let clientSecret: SecretSummary | null = null
  let secretCiphertext: string | null = null
  const previousSecret = previous && previous.security.mode !== 'unsecured' ? previous.security.clientSecret : null

  if (input.clientSecret) {
    ;({ clientSecret, secretCiphertext } = storeSecret(deps, input.clientSecret))
  } else if (previousSecret) {
    clientSecret = previousSecret
    secretCiphertext = previous!.secretCiphertext
  }

  if (input.mode === 'deployment_client_credentials' && !clientSecret) {
    throw new StudioProblem('invalid_request', 'Client credentials require a client secret.', {
      violations: [{ path: 'security.clientSecret', message: 'required' }],
    })
  }

  const oidcFields = { issuer: input.issuer, clientId: input.clientId, scopes: input.scopes, clientSecret }
  return {
    security: input.mode === 'delegated_user'
      ? { mode: 'delegated_user', ...oidcFields, desktopLoopbackHost: input.desktopLoopbackHost }
      : { mode: 'deployment_client_credentials', ...oidcFields },
    secretCiphertext,
  }
}

function storeSecret (deps: StudioDeps, secret: SecretInput): { clientSecret: SecretSummary, secretCiphertext: string | null } {
  if ('value' in secret) {
    if (deps.config.deploymentMode !== 'desktop') {
      throw new StudioProblem('invalid_request', 'Hosted Studio accepts client secrets only as env: or file: references to deployment secrets.', {
        violations: [{ path: 'security.clientSecret', message: 'use a secret reference' }],
      })
    }
    return {
      clientSecret: { kind: 'stored', ref: null },
      secretCiphertext: deps.cipher.encrypt(secret.value, secretPurpose),
    }
  }
  const [kind, ...rest] = secret.ref.split(':')
  return {
    clientSecret: { kind: kind as 'env' | 'file', ref: rest.join(':') },
    secretCiphertext: null,
  }
}

/** Resolves the client secret of a target's OIDC client, or undefined for public clients. */
export async function resolveClientSecret (deps: StudioDeps, record: InfrastructureRecord): Promise<string | undefined> {
  if (record.security.mode === 'unsecured' || !record.security.clientSecret) {
    return undefined
  }
  const { kind, ref } = record.security.clientSecret
  const value = kind === 'stored' && record.secretCiphertext
    ? deps.cipher.decrypt(record.secretCiphertext, secretPurpose)
    : (ref ? await readSecretReference(`${kind}:${ref}`) : undefined)
  if (!value) {
    throw new StudioProblem('target_credentials_rejected', 'The client secret reference of this target could not be resolved.')
  }
  return value
}

interface CertificateMaterial {
  bundle: Uint8Array
  passphrase: string
}

interface ResolvedCertificate {
  clientCertificate: ClientCertificateSummary | null
  clientCertificateCiphertext: string | null
  /** The identity of a new or kept certificate, for the probe before saving. */
  identity: ClientIdentity | null
}

/** Messages for violations on `clientCertificate`; they never contain material. */
function certificateViolation (message: string): StudioProblem {
  return new StudioProblem('invalid_request', `The client certificate cannot be used: ${message}.`, {
    violations: [{ path: 'clientCertificate', message }],
  })
}

/** Opens a bundle and checks that it is usable now. */
function openBundle (material: CertificateMaterial): ClientIdentity {
  let identity: ClientIdentity
  try {
    identity = readPkcs12(material.bundle, material.passphrase)
  } catch (error) {
    if (error instanceof Pkcs12Error) {
      throw certificateViolation(error.reason === 'passphrase' ? 'the passphrase is wrong' : error.message.replace(/\.$/, '').toLowerCase())
    }
    throw error
  }
  if (identity.notAfter.getTime() <= Date.now()) {
    throw certificateViolation(`the certificate expired on ${identity.notAfter.toISOString().slice(0, 10)}`)
  }
  if (identity.notBefore.getTime() > Date.now()) {
    throw certificateViolation(`the certificate is not valid before ${identity.notBefore.toISOString().slice(0, 10)}`)
  }
  return identity
}

async function referencedMaterial (ref: string, passphraseRef: string | null): Promise<CertificateMaterial> {
  const path = ref.replace(/^file:/, '')
  const bundle = await readFile(path).catch(() => undefined)
  if (!bundle) {
    throw certificateViolation(`${path} could not be read`)
  }
  const passphrase = passphraseRef ? await readSecretReference(passphraseRef) : ''
  if (passphrase === undefined) {
    throw certificateViolation(`the passphrase reference ${passphraseRef} could not be resolved`)
  }
  return { bundle, passphrase }
}

function storedMaterial (deps: StudioDeps, ciphertext: string): CertificateMaterial {
  const { bundle, passphrase } = JSON.parse(deps.cipher.decrypt(ciphertext, certificatePurpose)) as { bundle: string, passphrase: string }
  return { bundle: Buffer.from(bundle, 'base64'), passphrase }
}

function summarize (identity: ClientIdentity, kind: 'file' | 'stored', ref: string | null, passphraseRef: string | null): ClientCertificateSummary {
  return { kind, ref, passphraseRef, subject: identity.subject, issuer: identity.issuer, notAfter: identity.notAfter.toISOString() }
}

/**
 * Validates and stores the client certificate of an input: a reference
 * (hosted and desktop) or an uploaded bundle (desktop only, encrypted).
 * Omitted keeps the previous certificate; `null` removes it.
 */
async function resolveCertificateInput (deps: StudioDeps, input: ParsedInput['clientCertificate'], previous: InfrastructureRecord | undefined): Promise<ResolvedCertificate> {
  if (input === undefined && previous?.clientCertificate) {
    return {
      clientCertificate: previous.clientCertificate,
      clientCertificateCiphertext: previous.clientCertificateCiphertext,
      identity: openBundle(await certificateMaterial(deps, previous)),
    }
  }
  if (!input) {
    return { clientCertificate: null, clientCertificateCiphertext: null, identity: null }
  }
  if ('value' in input) {
    if (deps.config.deploymentMode !== 'desktop') {
      throw new StudioProblem('invalid_request', 'Hosted Studio accepts client certificates only as file: references to deployment files.', {
        violations: [{ path: 'clientCertificate', message: 'use a file reference' }],
      })
    }
    const identity = openBundle({ bundle: Buffer.from(input.value, 'base64'), passphrase: input.passphrase })
    return {
      clientCertificate: summarize(identity, 'stored', null, null),
      clientCertificateCiphertext: deps.cipher.encrypt(JSON.stringify({ bundle: input.value, passphrase: input.passphrase }), certificatePurpose),
      identity,
    }
  }
  const passphraseRef = input.passphraseRef ?? null
  const identity = openBundle(await referencedMaterial(input.ref, passphraseRef))
  return { clientCertificate: summarize(identity, 'file', input.ref.replace(/^file:/, ''), passphraseRef), clientCertificateCiphertext: null, identity }
}

async function certificateMaterial (deps: StudioDeps, record: Pick<InfrastructureRecord, 'clientCertificate' | 'clientCertificateCiphertext'>): Promise<CertificateMaterial> {
  const summary = record.clientCertificate!
  if (summary.kind === 'stored') {
    if (!record.clientCertificateCiphertext) {
      throw certificateViolation('the stored certificate is missing')
    }
    return storedMaterial(deps, record.clientCertificateCiphertext)
  }
  return referencedMaterial(`file:${summary.ref}`, summary.passphraseRef)
}

const resolvedCertificates = new Map<string, Promise<ClientIdentity>>()

/**
 * The client certificate of an infrastructure for its outbound requests,
 * read once per revision. Its identity (ID and revision) keys the connection
 * pools, so certificates are never shared between infrastructures.
 */
export async function resolveClientCertificate (
  deps: StudioDeps,
  record: Pick<InfrastructureRecord, 'id' | 'revision' | 'clientCertificate' | 'clientCertificateCiphertext'>,
): Promise<ClientCertificate | undefined> {
  if (!record.clientCertificate) {
    return undefined
  }
  const key = `${record.id}:${record.revision}`
  let pending = resolvedCertificates.get(key)
  if (!pending) {
    pending = certificateMaterial(deps, record).then(material => readPkcs12(material.bundle, material.passphrase))
    resolvedCertificates.set(key, pending)
    pending.catch(() => resolvedCertificates.delete(key))
  }
  let identity: ClientIdentity
  try {
    identity = await pending
  } catch (error) {
    const detail = error instanceof StudioProblem ? error.violations?.[0]?.message : (error instanceof Pkcs12Error ? error.message.replace(/\.$/, '') : undefined)
    throw new StudioProblem('client_certificate_invalid', detail ? `The client certificate of this target cannot be used: ${detail}.` : undefined, { cause: error })
  }
  if (identity.notAfter.getTime() <= Date.now()) {
    throw new StudioProblem('client_certificate_invalid', `The client certificate of this target expired on ${identity.notAfter.toISOString().slice(0, 10)}.`)
  }
  return { identity: key, key: identity.key, cert: identity.cert }
}

/** Drops the resolved certificates and connection pools of an infrastructure. */
function forgetClientCertificates (id: string): void {
  for (const key of resolvedCertificates.keys()) {
    if (key.startsWith(`${id}:`)) {
      resolvedCertificates.delete(key)
    }
  }
  releaseCertificateAgents(`${id}:`)
}

/** The `profiles` of a `/description` answer, or `null` if it has none. */
async function profilesOf (response: Response): Promise<string[] | null> {
  if (!response.ok) {
    await response.body?.cancel()
    return null
  }
  try {
    const body = await response.json() as { profiles?: unknown }
    return Array.isArray(body.profiles) ? body.profiles.filter((profile): profile is string => typeof profile === 'string').slice(0, 200) : null
  } catch {
    return null
  }
}

/**
 * Asks every endpoint for its self-description. Any HTTP answer proves
 * reachability (`/description` may need authorization); its profiles say
 * which optional features the service offers (MVP-4 plan, I6).
 */
export async function probeEndpoints (
  deps: StudioDeps,
  record: Pick<InfrastructureRecord, 'endpoints' | 'allowPrivateNetwork'>,
  clientCertificate?: ClientCertificate,
): Promise<ProbeResult> {
  return (await probeWithFailures(deps, record, clientCertificate)).probe
}

async function probeWithFailures (
  deps: StudioDeps,
  record: Pick<InfrastructureRecord, 'endpoints' | 'allowPrivateNetwork'>,
  clientCertificate: ClientCertificate | undefined,
): Promise<{ probe: ProbeResult, failures: NetworkFailureKind[] }> {
  const guardedFetch = createGuardedFetch(targetPolicy(deps, record, clientCertificate))
  const failures: NetworkFailureKind[] = []
  const results = await Promise.all(record.endpoints.map(async endpoint => {
    const started = performance.now()
    try {
      const response = await guardedFetch(`${endpoint.url.replace(/\/+$/, '')}/description`, { headers: { Accept: 'application/json' } })
      const latencyMs = Math.round(performance.now() - started)
      return { type: endpoint.type, reachable: response.status < 500, status: response.status, latencyMs, error: null, profiles: await profilesOf(response) }
    } catch (error) {
      if (error instanceof NetworkFailure) {
        failures.push(error.kind)
      }
      return { type: endpoint.type, reachable: false, status: null, latencyMs: null, error: error instanceof Error ? error.message : 'request failed', profiles: null }
    }
  }))
  return { probe: { checkedAt: new Date().toISOString(), endpoints: results }, failures }
}

/** The profiles of a probe, per endpoint type, as stored with the infrastructure. */
function storedProfiles (probe: ProbeResult): ServiceProfiles {
  return Object.fromEntries(probe.endpoints.map(endpoint => [endpoint.type, endpoint.profiles]))
}

/**
 * Probes the endpoints of an input before saving it, with the certificate it
 * will have. The certificate gets a connection pool of its own, closed after.
 */
async function requireReachable (deps: StudioDeps, input: ParsedInput, identity: ClientIdentity | null): Promise<ProbeResult> {
  const pendingIdentity = `pending:${randomToken(9)}`
  const certificate = identity ? { identity: pendingIdentity, key: identity.key, cert: identity.cert } : undefined
  const { probe, failures } = await probeWithFailures(deps, input, certificate).finally(() => releaseCertificateAgents(pendingIdentity))
  const failed = probe.endpoints.filter(endpoint => !endpoint.reachable)
  if (failed.length === 0) {
    return probe
  }
  const detail = failed.map(endpoint => `${endpoint.type}: ${endpoint.error ?? `HTTP ${endpoint.status}`}`).join('; ')
  if (failures.includes('client_certificate_required')) {
    throw new StudioProblem('target_client_certificate_required', detail, { violations: [{ path: 'clientCertificate', message: identity ? 'the server did not accept this certificate' : 'the server requires a client certificate' }] })
  }
  if (failures.includes('client_certificate_rejected')) {
    throw new StudioProblem('target_client_certificate_rejected', detail, { violations: [{ path: 'clientCertificate', message: 'the server rejected this certificate' }] })
  }
  throw new StudioProblem('infrastructure_unreachable', detail)
}

/** Probes an infrastructure again and stores the profiles it reports. */
export async function reprobeInfrastructure (deps: StudioDeps, id: string): Promise<ProbeResult> {
  const [record] = await deps.db.select().from(infrastructures).where(eq(infrastructures.id, id))
  if (!record) {
    throw new StudioProblem('not_found', 'No such infrastructure.')
  }
  const probe = await probeEndpoints(deps, record, await resolveClientCertificate(deps, record))
  await deps.db.update(infrastructures)
    .set({ serviceProfiles: storedProfiles(probe), probedAt: new Date(probe.checkedAt) })
    .where(eq(infrastructures.id, id))
  return probe
}

/** Rejects changes when the deployment fixes its infrastructures (STUDIO_INFRASTRUCTURES_EDITABLE=false). */
function requireEditable (deps: StudioDeps): void {
  if (!deps.config.infrastructuresEditable) {
    throw new StudioProblem('forbidden', 'This Studio deployment does not allow changing infrastructures.')
  }
}

function requireUnmanaged (record: Pick<InfrastructureRecord, 'managedKey'>): void {
  if (record.managedKey) {
    throw new StudioProblem('forbidden', 'This infrastructure is managed by the deployment; change it in the deployment\'s infrastructure file.')
  }
}

/** Rejects changes to an infrastructure that the deployment fixes or manages. */
export function requireChangeable (deps: StudioDeps, record: Pick<InfrastructureRecord, 'managedKey'>): void {
  requireEditable(deps)
  requireUnmanaged(record)
}

export async function createInfrastructure (deps: StudioDeps, actor: Actor, raw: unknown, requestId: string): Promise<InfrastructureRecord> {
  requireEditable(deps)
  const input = parseInput(deps, raw)
  await validateUrls(input)
  const { security, secretCiphertext } = resolveSecurityInput(deps, input.security, undefined)
  const { identity, ...certificate } = await resolveCertificateInput(deps, input.clientCertificate, undefined)
  const connections = storeConnections(deps, input.connections)
  const probe = await requireReachable(deps, input, identity)

  const [record] = await deps.db.insert(infrastructures).values({
    id: randomToken(12),
    name: input.name,
    description: input.description ?? null,
    template: input.template,
    endpoints: input.endpoints,
    listSource: input.listSource,
    sync: input.sync,
    serviceProfiles: storedProfiles(probe),
    probedAt: new Date(probe.checkedAt),
    security,
    secretCiphertext,
    ...certificate,
    ...connections,
    allowPrivateNetwork: input.allowPrivateNetwork,
    createdBy: actor.subject,
  }).returning()
  await recordAudit(deps, { action: 'infrastructure.create', outcome: 'success', requestId, actorSubject: actor.subject, targetId: record!.id })
  return record!
}

export async function updateInfrastructure (
  deps: StudioDeps,
  actor: Actor,
  id: string,
  expectedRevision: number,
  raw: unknown,
  requestId: string,
): Promise<InfrastructureRecord> {
  requireEditable(deps)
  const previous = await getInfrastructure(deps, id)
  requireUnmanaged(previous)
  const input = parseInput(deps, raw)
  await validateUrls(input)
  const { security, secretCiphertext } = resolveSecurityInput(deps, input.security, previous)
  const { identity, ...certificate } = await resolveCertificateInput(deps, input.clientCertificate, previous)
  const connections = storeConnections(deps, input.connections, previous)
  const probe = await requireReachable(deps, input, identity)

  const [record] = await deps.db.update(infrastructures).set({
    name: input.name,
    description: input.description ?? null,
    template: input.template,
    endpoints: input.endpoints,
    listSource: input.listSource,
    sync: input.sync,
    serviceProfiles: storedProfiles(probe),
    probedAt: new Date(probe.checkedAt),
    security,
    secretCiphertext,
    ...certificate,
    ...connections,
    allowPrivateNetwork: input.allowPrivateNetwork,
    revision: expectedRevision + 1,
    updatedAt: new Date(),
  }).where(and(eq(infrastructures.id, id), eq(infrastructures.revision, expectedRevision))).returning()
  if (!record) {
    throw new StudioProblem('revision_conflict', 'The infrastructure was changed in the meantime. Reload it and try again.')
  }
  forgetOidcClients()
  forgetClientCertificates(id)
  await recordAudit(deps, { action: 'infrastructure.update', outcome: 'success', requestId, actorSubject: actor.subject, targetId: id })
  return record
}

export async function deleteInfrastructure (deps: StudioDeps, actor: Actor, id: string, requestId: string): Promise<void> {
  requireEditable(deps)
  const [existing] = await deps.db.select({ managedKey: infrastructures.managedKey }).from(infrastructures).where(eq(infrastructures.id, id))
  if (!existing) {
    throw new StudioProblem('not_found', 'No such infrastructure.')
  }
  requireUnmanaged(existing)
  await deps.db.delete(infrastructures).where(eq(infrastructures.id, id))
  forgetOidcClients()
  forgetClientCertificates(id)
  await recordAudit(deps, { action: 'infrastructure.delete', outcome: 'success', requestId, actorSubject: actor.subject, targetId: id })
}

/**
 * Checks an infrastructure input against this deployment without contacting
 * its endpoints: the address policy, the static URL rules, the secret and
 * certificate rules. Endpoints may not be up yet.
 */
async function checkDeclared (deps: StudioDeps, raw: unknown) {
  const input = parseInput(deps, raw)
  for (const [label, url] of urlsOf(input)) {
    const reason = rejectUrl(new URL(url))
    if (reason) {
      throw new StudioProblem('endpoint_rejected', `${label}: ${reason}`)
    }
  }
  const { security, secretCiphertext } = resolveSecurityInput(deps, input.security, undefined)
  const { identity: _identity, ...certificate } = await resolveCertificateInput(deps, input.clientCertificate, undefined)
  const connections = storeConnections(deps, input.connections)
  return { input, security, secretCiphertext, certificate, connections }
}

export interface ReconcileOutcome {
  created: string[]
  updated: string[]
  removed: string[]
  unchanged: string[]
}

/** Serializes concurrent reconciles of replicas that start together on one PostgreSQL. */
const reconcileLockId = 0x53_54_4D_49

function describeFailure (error: unknown): string {
  if (error instanceof StudioProblem) {
    return [error.message, ...(error.violations ?? []).map(violation => `${violation.path}: ${violation.message}`)].join(' ')
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Applies the deployment's declared infrastructures (ADR 0037): creates the
 * new ones, updates the changed ones under their existing ID (so preferences
 * and target credentials stay attached), and removes managed ones that are no
 * longer declared. Infrastructures made in Studio are never touched.
 *
 * Every entry is validated before anything is written, so a broken file
 * changes nothing; endpoints are not contacted, as they may start after
 * Studio. They are probed when first loaded, like any unprobed infrastructure.
 */
export async function reconcileManagedInfrastructures (deps: StudioDeps, declared: DeclaredInfrastructure[]): Promise<ReconcileOutcome> {
  const prepared: Array<{ key: string, digest: string, values: Omit<typeof infrastructures.$inferInsert, 'id' | 'createdBy'> }> = []
  for (const entry of declared) {
    try {
      const { input, security, secretCiphertext, certificate, connections } = await checkDeclared(deps, entry.input)
      // Keyed with the data key, as the input may hold a desktop secret value.
      const digest = createHmac('sha256', deps.config.dataKey)
        .update(JSON.stringify({ input, clientCertificate: certificate.clientCertificate }))
        .digest('base64url')
      prepared.push({
        key: entry.key,
        digest,
        values: {
          name: input.name,
          description: input.description ?? null,
          template: input.template,
          endpoints: input.endpoints,
          listSource: input.listSource,
          sync: input.sync,
          serviceProfiles: {},
          probedAt: null,
          security,
          secretCiphertext,
          ...certificate,
          ...connections,
          allowPrivateNetwork: input.allowPrivateNetwork,
          managedKey: entry.key,
          managedDigest: digest,
        },
      })
    } catch (error) {
      throw new ConfigurationError(`${entry.source}: infrastructure ${entry.key}: ${describeFailure(error)}`)
    }
  }

  const outcome: ReconcileOutcome = { created: [], updated: [], removed: [], unchanged: [] }
  const audits: Array<{ action: string, targetId: string }> = []
  await deps.db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${reconcileLockId})`)
    const existing = await tx
      .select({ id: infrastructures.id, managedKey: infrastructures.managedKey, managedDigest: infrastructures.managedDigest, revision: infrastructures.revision })
      .from(infrastructures)
      .where(isNotNull(infrastructures.managedKey))
    const byKey = new Map(existing.map(row => [row.managedKey!, row]))
    for (const entry of prepared) {
      const current = byKey.get(entry.key)
      byKey.delete(entry.key)
      if (!current) {
        const id = randomToken(12)
        await tx.insert(infrastructures).values({ id, ...entry.values, createdBy: 'deployment' })
        outcome.created.push(entry.key)
        audits.push({ action: 'infrastructure.create', targetId: id })
      } else if (current.managedDigest === entry.digest) {
        outcome.unchanged.push(entry.key)
      } else {
        await tx.update(infrastructures)
          .set({ ...entry.values, revision: current.revision + 1, updatedAt: new Date() })
          .where(eq(infrastructures.id, current.id))
        outcome.updated.push(entry.key)
        audits.push({ action: 'infrastructure.update', targetId: current.id })
      }
    }
    for (const [key, row] of byKey) {
      await tx.delete(infrastructures).where(eq(infrastructures.id, row.id))
      outcome.removed.push(key)
      audits.push({ action: 'infrastructure.delete', targetId: row.id })
    }
  })

  if (outcome.updated.length > 0 || outcome.removed.length > 0) {
    forgetOidcClients()
  }
  for (const { action, targetId } of audits) {
    if (action !== 'infrastructure.create') {
      forgetClientCertificates(targetId)
    }
    await recordAudit(deps, { action, outcome: 'success', actorSubject: 'deployment', targetId })
  }
  return outcome
}

/** The infrastructures (all, or those with the given IDs) in the file format. */
export async function exportInfrastructures (deps: StudioDeps, ids?: string[]): Promise<string> {
  const records = await deps.db.select().from(infrastructures).where(ids ? inArray(infrastructures.id, ids) : undefined).orderBy(asc(infrastructures.name))
  if (ids && records.length !== new Set(ids).size) {
    throw new StudioProblem('not_found', 'No such infrastructure.')
  }
  return exportInfrastructureFile(records)
}

/**
 * Checks (`dryRun`) or imports infrastructures in the file format as ordinary
 * infrastructures of this Studio. Each entry is created, or replaces the one
 * with its name, on its own, probing its endpoints as a save in the form
 * does; one that fails is reported and the others are still imported.
 */
export async function importInfrastructures (
  deps: StudioDeps,
  actor: Actor,
  request: { yaml: string, dryRun: boolean, resolutions: Record<string, ImportResolution> },
  requestId: string,
): Promise<InfrastructureImportResult> {
  requireEditable(deps)
  const analyzed = analyzeInfrastructureFile(request.yaml, { requireKey: false })
  if (analyzed.problems.length > 0) {
    return { problems: analyzed.problems, entries: [] }
  }
  const existing = await deps.db
    .select({ id: infrastructures.id, name: infrastructures.name, managedKey: infrastructures.managedKey, revision: infrastructures.revision })
    .from(infrastructures)
  const byName = new Map(existing.map(row => [row.name.trim().toLowerCase(), row]))

  const entries: Array<InfrastructureImportEntry & { input: unknown, revision: number | null }> = []
  for (const entry of analyzed.entries) {
    const problems = [...entry.problems]
    if (entry.input) {
      await checkDeclared(deps, entry.input).catch(error => problems.push(describeFailure(error)))
    }
    const match = entry.name ? byName.get(entry.name.trim().toLowerCase()) : undefined
    const conflict = match ? { id: match.id, name: match.name, managed: match.managedKey !== null } : null
    const resolution = request.resolutions[String(entry.index)] ?? (conflict ? 'skip' : 'create')
    if (resolution === 'replace' && (!conflict || conflict.managed)) {
      problems.push(conflict ? 'A managed infrastructure cannot be replaced by an import.' : 'There is no infrastructure with this name to replace.')
    }
    entries.push({ index: entry.index, key: entry.key, name: entry.name, problems, conflict, resolution, outcome: null, infrastructureId: null, input: entry.input, revision: match?.revision ?? null })
  }

  if (!request.dryRun) {
    for (const entry of entries) {
      if (entry.problems.length > 0) {
        entry.outcome = 'failed'
        continue
      }
      if (entry.resolution === 'skip') {
        entry.outcome = 'skipped'
        continue
      }
      try {
        const record = entry.resolution === 'replace'
          ? await updateInfrastructure(deps, actor, entry.conflict!.id, entry.revision!, entry.input, requestId)
          : await createInfrastructure(deps, actor, entry.input, requestId)
        entry.outcome = entry.resolution === 'replace' ? 'replaced' : 'created'
        entry.infrastructureId = record.id
      } catch (error) {
        entry.outcome = 'failed'
        entry.problems.push(describeFailure(error))
      }
    }
  }
  return { problems: [], entries: entries.map(({ input: _input, revision: _revision, ...entry }) => entry) }
}

export { type InfrastructureInput } from '#shared/contract'
