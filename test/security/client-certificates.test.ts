import type { TestIdentity } from '../support/pki'
import type { StudioConfig } from '~~/server/lib/config'
import type { DatabaseHandle } from '~~/server/lib/database/client'
import type { StudioDeps } from '~~/server/lib/deps'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCACertificates, setDefaultCACertificates } from 'node:tls'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SecretCipher } from '~~/server/lib/crypto/cipher'
import { Pkcs12Error, readPkcs12 } from '~~/server/lib/crypto/pkcs12'
import { openDatabase } from '~~/server/lib/database/client'
import { applyMigrations, loadMigrationsFromDirectory } from '~~/server/lib/database/migrate'
import { createInfrastructure, deleteInfrastructure, getInfrastructure, resolveClientCertificate, toInfrastructure, updateInfrastructure } from '~~/server/lib/infrastructures'
import { agentKey, createGuardedFetch, NetworkFailure } from '~~/server/lib/network/guarded-fetch'
import { StudioProblem } from '~~/server/lib/problem'
import { clientCertificateInputSchema, infrastructureInputSchema } from '#shared/contract'
import { createCa, issueClient, issueServer, startMutualTlsServer, toPkcs12 } from '../support/pki'

const migrationsDirectory = new URL('../../server/database/migrations', import.meta.url).pathname
const actor = { subject: 'admin', name: 'Admin', roles: [], isAdmin: true, sessionId: 'session' }

let ca: TestIdentity
let client: TestIdentity
let bundle: string
const passphrase = 'correct horse battery staple'

beforeAll(() => {
  ca = createCa('Studio Test CA')
  client = issueClient(ca, 'Studio Test Client')
  bundle = toPkcs12(client, passphrase, ca)
})

function infrastructureInput (url: string, clientCertificate?: unknown) {
  return {
    name: 'mTLS',
    template: 'mono-all',
    endpoints: [{ type: 'aasEnvironment', url }],
    security: { mode: 'unsecured' },
    allowPrivateNetwork: true,
    ...(clientCertificate === undefined ? {} : { clientCertificate }),
  }
}

async function problemOf (promise: Promise<unknown>): Promise<StudioProblem> {
  const error = await promise.then(() => undefined, (error_: unknown) => error_)
  expect(error).toBeInstanceOf(StudioProblem)
  return error as StudioProblem
}

describe('client certificate contract', () => {
  it('accepts a file reference with a passphrase reference, or an uploaded bundle', () => {
    expect(clientCertificateInputSchema.safeParse({ ref: 'file:/run/secrets/client.p12', passphraseRef: 'env:CLIENT_PASSPHRASE' }).success).toBe(true)
    expect(clientCertificateInputSchema.safeParse({ ref: 'file:/run/secrets/client.p12' }).success).toBe(true)
    expect(clientCertificateInputSchema.parse({ value: 'MIIBAA==' })).toEqual({ value: 'MIIBAA==', passphrase: '' })
  })

  it.each([
    { ref: 'env:CLIENT_P12' },
    { ref: 'file:relative.p12' },
    { ref: 'file:/a.p12', passphraseRef: 'plain-passphrase' },
    { value: 'not base64!' },
    { value: '' },
  ])('rejects %j', input => {
    expect(clientCertificateInputSchema.safeParse(input).success).toBe(false)
  })

  it('belongs to the infrastructure in every access mode, including unsecured', () => {
    const parsed = infrastructureInputSchema.parse(infrastructureInput('https://aas.example.com', { value: 'MIIBAA==', passphrase: 'x' }))
    expect(parsed.security.mode).toBe('unsecured')
    expect(parsed.clientCertificate).toEqual({ value: 'MIIBAA==', passphrase: 'x' })
    expect(infrastructureInputSchema.parse(infrastructureInput('https://aas.example.com', null)).clientCertificate).toBeNull()
    expect(infrastructureInputSchema.parse(infrastructureInput('https://aas.example.com')).clientCertificate).toBeUndefined()
  })
})

describe('readPkcs12', () => {
  it('reads the key, the matching certificate and its names', () => {
    const identity = readPkcs12(Buffer.from(bundle, 'base64'), passphrase)
    expect(identity.subject).toBe('C=DE, O=Studio Test, CN=Studio Test Client')
    expect(identity.issuer).toBe('C=DE, O=Studio Test, CN=Studio Test CA')
    expect(identity.key).toContain('BEGIN PRIVATE KEY')
    // The leaf comes first, then the CA from the bundle.
    expect(identity.cert.match(/BEGIN CERTIFICATE/g)).toHaveLength(2)
    expect(identity.notAfter.getTime()).toBeGreaterThan(Date.now())
  })

  it.each([
    ['a wrong passphrase', () => readPkcs12(Buffer.from(bundle, 'base64'), 'wrong'), 'passphrase'],
    ['no PKCS#12 data', () => readPkcs12(Buffer.from('not a bundle'), passphrase), 'format'],
  ])('reports %s', (_, read, reason) => {
    expect(read).toThrow(Pkcs12Error)
    try {
      read()
    } catch (error) {
      expect((error as Pkcs12Error).reason).toBe(reason)
    }
  })
})

const opensslAvailable = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.runIf(opensslAvailable)('readPkcs12 with bundles exported by openssl', () => {
  it('reads an EC key with the encryption the local openssl uses (RC2 for LibreSSL, AES for OpenSSL 3)', () => {
    const directory = mkdtempSync(join(tmpdir(), 'studio-p12-'))
    try {
      const run = (...args: string[]) => execFileSync('openssl', args, { cwd: directory, stdio: 'ignore' })
      run('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'client.key')
      run('req', '-new', '-x509', '-key', 'client.key', '-out', 'client.crt', '-days', '2', '-subj', '/C=DE/O=Studio Test/CN=EC Client')
      run('pkcs12', '-export', '-inkey', 'client.key', '-in', 'client.crt', '-out', 'client.p12', '-passout', 'pass:ec-passphrase')
      const identity = readPkcs12(readFileSync(join(directory, 'client.p12')), 'ec-passphrase')
      expect(identity.subject).toBe('C=DE, O=Studio Test, CN=EC Client')
      expect(identity.key).toContain('BEGIN PRIVATE KEY')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('client certificate agents', () => {
  const base = { allowedOrigins: new Set<string>(), allowPrivateNetwork: false, timeoutMs: 1000, maxResponseBytes: 1000 }
  const certificate = (identity: string) => ({ identity, key: 'k', cert: 'c' })

  it('keeps one connection pool per infrastructure and revision', () => {
    const first = agentKey({ ...base, clientCertificate: certificate('infra-a:1') }, 'https:')
    expect(agentKey({ ...base, clientCertificate: certificate('infra-b:1') }, 'https:')).not.toBe(first)
    expect(agentKey({ ...base, clientCertificate: certificate('infra-a:2') }, 'https:')).not.toBe(first)
    expect(agentKey(base, 'https:')).not.toBe(first)
    expect(agentKey({ ...base, clientCertificate: certificate('infra-a:1') }, 'https:')).toBe(first)
  })

  it('never uses a certificate for plain HTTP', () => {
    expect(agentKey({ ...base, clientCertificate: certificate('infra-a:1') }, 'http:')).toBe(agentKey(base, 'http:'))
  })

  it('names certificates by identity only, never by their material', () => {
    const key = agentKey({ ...base, clientCertificate: { identity: 'infra-a:1', key: 'PRIVATE', cert: 'CERT' } }, 'https:')
    expect(key).not.toContain('PRIVATE')
    expect(key).not.toContain('CERT')
  })
})

describe('mutual TLS against a local HTTPS server', () => {
  const defaultCas = getCACertificates('default')
  let server: { url: string, close: () => Promise<void> }
  let handle: DatabaseHandle
  let desktop: StudioDeps
  let hosted: StudioDeps

  beforeAll(async () => {
    // Trust the throwaway CA for the server certificate, as a public CA would be.
    setDefaultCACertificates([...defaultCas, ca.certPem])
    server = await startMutualTlsServer(issueServer(ca), ca)
    handle = await openDatabase({ kind: 'memory' })
    await applyMigrations(handle.db, await loadMigrationsFromDirectory(migrationsDirectory))
    const cipher = new SecretCipher(randomBytes(32))
    const config = { deploymentMode: 'desktop', allowPrivateNetworkTargets: true, infrastructuresEditable: true } as StudioConfig
    desktop = { config, db: handle.db, cipher }
    hosted = { config: { ...config, deploymentMode: 'hosted' } as StudioConfig, db: handle.db, cipher }
  })

  afterAll(async () => {
    setDefaultCACertificates(defaultCas)
    await server?.close()
    await handle?.close()
  })

  function policy (clientCertificate?: { identity: string, key: string, cert: string }) {
    return { allowedOrigins: new Set([server.url]), allowPrivateNetwork: true, timeoutMs: 5000, maxResponseBytes: 10_000, clientCertificate }
  }

  it('connects with the certificate', async () => {
    const identity = readPkcs12(Buffer.from(bundle, 'base64'), passphrase)
    const response = await createGuardedFetch(policy({ identity: 'direct:1', key: identity.key, cert: identity.cert }))(`${server.url}/description`)
    expect(response.status).toBe(200)
  })

  it('fails with a typed failure without a certificate', async () => {
    const failure = await createGuardedFetch(policy())(`${server.url}/description`).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(NetworkFailure)
    expect((failure as NetworkFailure).kind).toBe('client_certificate_required')
  })

  it('fails with a typed failure for a certificate of another CA', async () => {
    const stranger = issueClient(createCa('Other CA'), 'Stranger')
    const failure = await createGuardedFetch(policy({ identity: 'stranger:1', key: stranger.keyPem, cert: stranger.certPem }))(`${server.url}/description`)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(NetworkFailure)
    expect((failure as NetworkFailure).kind).toBe('client_certificate_rejected')
  })

  it('refuses to save an infrastructure that needs a certificate without one', async () => {
    const problem = await problemOf(createInfrastructure(desktop, actor, infrastructureInput(server.url), 'test'))
    expect(problem.code).toBe('target_client_certificate_required')
    expect(problem.violations?.[0]?.path).toBe('clientCertificate')
  })

  it('reports a wrong passphrase on the certificate field', async () => {
    const problem = await problemOf(createInfrastructure(desktop, actor, infrastructureInput(server.url, { value: bundle, passphrase: 'wrong' }), 'test'))
    expect(problem.code).toBe('invalid_request')
    expect(problem.violations).toEqual([{ path: 'clientCertificate', message: 'the passphrase is wrong' }])
  })

  it('reports an expired certificate', async () => {
    const expired = toPkcs12(issueClient(ca, 'Expired', new Date(Date.now() - 1000)), passphrase)
    const problem = await problemOf(createInfrastructure(desktop, actor, infrastructureInput(server.url, { value: expired, passphrase }), 'test'))
    expect(problem.violations?.[0]?.message).toMatch(/expired/)
  })

  it('accepts only references in hosted deployments', async () => {
    const problem = await problemOf(createInfrastructure(hosted, actor, infrastructureInput(server.url, { value: bundle, passphrase }), 'test'))
    expect(problem.code).toBe('invalid_request')
    expect(problem.violations?.[0]?.path).toBe('clientCertificate')
  })

  it('stores an uploaded certificate encrypted and never returns its material', async () => {
    const record = await createInfrastructure(desktop, actor, infrastructureInput(server.url, { value: bundle, passphrase }), 'test')
    expect(record.probedAt).not.toBeNull()
    expect(record.clientCertificateCiphertext).toMatch(/^v1\./)
    expect(record.clientCertificateCiphertext).not.toContain(passphrase)

    const summary = toInfrastructure(record)
    expect(summary.clientCertificate).toEqual({
      kind: 'stored',
      ref: null,
      passphraseRef: null,
      subject: 'C=DE, O=Studio Test, CN=Studio Test Client',
      issuer: 'C=DE, O=Studio Test, CN=Studio Test CA',
      notAfter: expect.any(String),
    })
    const serialized = JSON.stringify(summary)
    for (const secret of [passphrase, bundle.slice(0, 64), 'PRIVATE KEY', 'BEGIN CERTIFICATE', record.clientCertificateCiphertext!]) {
      expect(serialized).not.toContain(secret)
    }

    // Omitted on update keeps the certificate; null removes it.
    const kept = await updateInfrastructure(desktop, actor, record.id, record.revision, infrastructureInput(server.url), 'test')
    expect(kept.clientCertificate).toEqual(record.clientCertificate)
    const removal = await problemOf(updateInfrastructure(desktop, actor, record.id, kept.revision, infrastructureInput(server.url, null), 'test'))
    expect(removal.code).toBe('target_client_certificate_required')
    await deleteInfrastructure(desktop, actor, record.id, 'test')
  })

  it('resolves certificates per infrastructure and revision', async () => {
    const first = await createInfrastructure(desktop, actor, infrastructureInput(server.url, { value: bundle, passphrase }), 'test')
    const second = await createInfrastructure(desktop, actor, infrastructureInput(server.url, { value: bundle, passphrase }), 'test')
    const [a, b] = await Promise.all([resolveClientCertificate(desktop, first), resolveClientCertificate(desktop, second)])
    expect(a?.identity).toBe(`${first.id}:1`)
    expect(b?.identity).toBe(`${second.id}:1`)
    const updated = await updateInfrastructure(desktop, actor, first.id, 1, infrastructureInput(server.url), 'test')
    expect((await resolveClientCertificate(desktop, await getInfrastructure(desktop, updated.id)))?.identity).toBe(`${first.id}:2`)
  })
})
