import type { KeyObject } from 'node:crypto'
import { createPrivateKey, X509Certificate } from 'node:crypto'
import forge from 'node-forge'

/**
 * A TLS client identity read from a PKCS#12 bundle. The key and chain are
 * PEM for the TLS socket and stay in memory only.
 */
export interface ClientIdentity {
  /** Unencrypted PKCS#8 private key. */
  key: string
  /** The certificate that matches the key, followed by the other certificates of the bundle. */
  cert: string
  subject: string
  issuer: string
  notBefore: Date
  notAfter: Date
}

export type Pkcs12FailureReason = 'format' | 'passphrase' | 'no_key' | 'no_certificate'

export class Pkcs12Error extends Error {
  constructor (readonly reason: Pkcs12FailureReason, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'Pkcs12Error'
  }
}

/** One RFC 4514-style line, e.g. `C=DE, O=Example, CN=Client`. */
function distinguishedName (name: string): string {
  return name.split('\n').filter(Boolean).join(', ')
}

function der (asn1: forge.asn1.Asn1): Buffer {
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary')
}

/**
 * Reads a PKCS#12 bundle with node-forge rather than OpenSSL, because OpenSSL 3
 * rejects bundles with legacy encryption (RC2, 3DES) that CAs still issue.
 * RSA and EC keys are supported: forge leaves keys it cannot model as ASN.1,
 * which Node's crypto then loads.
 */
export function readPkcs12 (bundle: Uint8Array, passphrase: string): ClientIdentity {
  let asn1: forge.asn1.Asn1
  try {
    asn1 = forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(bundle).toString('binary')), false)
  } catch (error) {
    throw new Pkcs12Error('format', 'The file is not a PKCS#12 (.p12/.pfx) bundle.', { cause: error })
  }

  let pfx: forge.pkcs12.Pkcs12Pfx
  try {
    pfx = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/password/i.test(message)) {
      throw new Pkcs12Error('passphrase', 'The passphrase does not open this certificate bundle.', { cause: error })
    }
    throw new Pkcs12Error('format', 'The certificate bundle could not be read.', { cause: error })
  }

  const keys: KeyObject[] = []
  for (const type of [forge.pki.oids.pkcs8ShroudedKeyBag!, forge.pki.oids.keyBag!]) {
    for (const bag of pfx.getBags({ bagType: type })[type] ?? []) {
      const info = bag.key ? forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(bag.key)) : bag.asn1
      if (info) {
        keys.push(createPrivateKey({ key: der(info), format: 'der', type: 'pkcs8' }))
      }
    }
  }
  const key = keys[0]
  if (!key) {
    throw new Pkcs12Error('no_key', 'The certificate bundle contains no private key.')
  }

  const certificates: X509Certificate[] = []
  for (const bag of pfx.getBags({ bagType: forge.pki.oids.certBag! })[forge.pki.oids.certBag!] ?? []) {
    const certAsn1 = bag.cert ? forge.pki.certificateToAsn1(bag.cert) : bag.asn1
    if (certAsn1) {
      certificates.push(new X509Certificate(der(certAsn1)))
    }
  }
  const leaf = certificates.find(certificate => certificate.checkPrivateKey(key))
  if (!leaf) {
    throw new Pkcs12Error('no_certificate', 'The certificate bundle contains no certificate for its private key.')
  }

  return {
    key: key.export({ type: 'pkcs8', format: 'pem' }) as string,
    cert: [leaf, ...certificates.filter(certificate => certificate !== leaf)].map(certificate => certificate.toString()).join(''),
    subject: distinguishedName(leaf.subject),
    issuer: distinguishedName(leaf.issuer),
    notBefore: new Date(leaf.validFrom),
    notAfter: new Date(leaf.validTo),
  }
}
