import type { Server } from 'node:https'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { createServer } from 'node:https'
import forge from 'node-forge'

/** A throwaway certificate with its key, for mutual-TLS tests. */
export interface TestIdentity {
  key: forge.pki.rsa.PrivateKey
  cert: forge.pki.Certificate
  keyPem: string
  certPem: string
}

function keyPair (): { privateKey: forge.pki.rsa.PrivateKey, publicKey: forge.pki.rsa.PublicKey } {
  // Node generates the key natively; forge would take seconds per key.
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const key = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }) as string) as forge.pki.rsa.PrivateKey
  return { privateKey: key, publicKey: forge.pki.rsa.setPublicKey(key.n, key.e) }
}

function issue (
  commonName: string,
  issuer: TestIdentity | null,
  options: { ca?: boolean, server?: boolean, notAfter?: Date } = {},
): TestIdentity {
  const { privateKey, publicKey } = keyPair()
  const cert = forge.pki.createCertificate()
  cert.publicKey = publicKey
  cert.serialNumber = `01${randomBytes(8).toString('hex')}`
  cert.validity.notBefore = new Date(Date.now() - 60_000)
  cert.validity.notAfter = options.notAfter ?? new Date(Date.now() + 24 * 3_600_000)
  const subject = [{ shortName: 'C', value: 'DE' }, { shortName: 'O', value: 'Studio Test' }, { shortName: 'CN', value: commonName }]
  cert.setSubject(subject)
  cert.setIssuer(issuer ? issuer.cert.subject.attributes : subject)
  cert.setExtensions([
    { name: 'basicConstraints', cA: options.ca === true },
    { name: 'keyUsage', keyCertSign: options.ca === true, digitalSignature: true, keyEncipherment: true },
    ...(options.ca ? [] : [{ name: 'extKeyUsage', serverAuth: options.server === true, clientAuth: options.server !== true }]),
    ...(options.server ? [{ name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] }] : []),
  ])
  cert.sign(issuer?.key ?? privateKey, forge.md.sha256.create())
  return { key: privateKey, cert, keyPem: forge.pki.privateKeyToPem(privateKey), certPem: forge.pki.certificateToPem(cert) }
}

export function createCa (commonName: string): TestIdentity {
  return issue(commonName, null, { ca: true })
}

export function issueServer (ca: TestIdentity): TestIdentity {
  return issue('127.0.0.1', ca, { server: true })
}

export function issueClient (ca: TestIdentity, commonName: string, notAfter?: Date): TestIdentity {
  return issue(commonName, ca, { notAfter })
}

/** A PKCS#12 bundle of the client's key and certificate (and the CA), as base64. */
export function toPkcs12 (client: TestIdentity, passphrase: string, ca?: TestIdentity): string {
  const asn1 = forge.pkcs12.toPkcs12Asn1(client.key, ca ? [client.cert, ca.cert] : [client.cert], passphrase, { algorithm: '3des' })
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary').toString('base64')
}

/**
 * An HTTPS server on 127.0.0.1 that requires a client certificate issued by
 * `clientCa`. It answers `/description` with BaSyx-style profiles.
 */
export async function startMutualTlsServer (server: TestIdentity, clientCa: TestIdentity): Promise<{ url: string, close: () => Promise<void> }> {
  const instance: Server = createServer({
    key: server.keyPem,
    cert: server.certPem,
    ca: clientCa.certPem,
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.3',
  }, (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ profiles: [], path: request.url }))
  })
  await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve))
  const address = instance.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `https://127.0.0.1:${port}`,
    close: () => new Promise(resolve => {
      instance.closeAllConnections()
      instance.close(() => resolve())
    }),
  }
}
