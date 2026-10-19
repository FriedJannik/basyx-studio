import type { Connection, ConnectionAuthInput, ConnectionAuthScheme, ConnectionInput, ConnectionTestResult, ConnectionType, SecretSummary } from '#shared/contract'
import { connectionSecretFields } from '#shared/contract'

// The admin form of an infrastructure's connections (ADR 0040): one flat
// model per connection, so every scheme's fields can be edited in place.
// Secrets are write-only: the form shows the stored summary and sends a
// secret only when one was entered.

export interface ConnectionForm {
  /** Stable row identity while the key is edited. */
  id: number
  /** The key as saved, if the connection is saved; its stored secret belongs to it. */
  savedKey: string | null
  key: string
  type: ConnectionType
  url: string
  aliases: string[]
  allowPrivateNetwork: boolean
  timeoutSeconds: string
  scheme: ConnectionAuthScheme
  headerName: string
  username: string
  issuer: string
  clientId: string
  scopes: string
  audience: string
  forwardUserToken: boolean
  /** Hosted: an `env:`/`file:` reference. Desktop: a value stored encrypted. */
  secret: string
  /** The saved secret of this key and scheme, if any. */
  stored: SecretSummary | null
  storedScheme: ConnectionAuthScheme | null
  organization: string
  testing: boolean
  testResult: ConnectionTestResult | null
  testError: unknown
}

let nextId = 0

export function emptyConnectionForm (): ConnectionForm {
  return {
    id: nextId++,
    savedKey: null,
    key: '',
    type: 'influxdb2',
    url: '',
    aliases: [],
    allowPrivateNetwork: false,
    timeoutSeconds: '',
    scheme: 'token',
    headerName: '',
    username: '',
    issuer: '',
    clientId: '',
    scopes: '',
    audience: '',
    forwardUserToken: false,
    secret: '',
    stored: null,
    storedScheme: null,
    organization: '',
    testing: false,
    testResult: null,
    testError: null,
  }
}

/** The secret summary of a saved connection's auth, if its scheme has a secret. */
function storedSecret (auth: Connection['auth']): SecretSummary | null {
  const field = connectionSecretFields[auth.scheme]
  return field ? (auth as unknown as Record<string, SecretSummary | null>)[field] ?? null : null
}

export function connectionFormOf (connection: Connection, desktop: boolean): ConnectionForm {
  const { auth } = connection
  const stored = storedSecret(auth)
  return {
    ...emptyConnectionForm(),
    savedKey: connection.key,
    key: connection.key,
    type: connection.type,
    url: connection.url,
    aliases: [...connection.aliases],
    allowPrivateNetwork: connection.allowPrivateNetwork,
    timeoutSeconds: connection.timeoutSeconds === undefined ? '' : String(connection.timeoutSeconds),
    scheme: auth.scheme,
    headerName: auth.scheme === 'header' ? auth.name : '',
    username: auth.scheme === 'basic' ? auth.username : '',
    issuer: auth.scheme === 'oauth2ClientCredentials' ? auth.issuer : '',
    clientId: auth.scheme === 'oauth2ClientCredentials' ? auth.clientId : '',
    scopes: auth.scheme === 'oauth2ClientCredentials' || auth.scheme === 'delegatedUser' ? auth.scopes.join(' ') : '',
    audience: auth.scheme === 'delegatedUser' ? auth.audience : (auth.scheme === 'oauth2ClientCredentials' ? auth.audience ?? '' : ''),
    forwardUserToken: auth.scheme === 'delegatedUser' && auth.forwardUserToken,
    // References are no secrets: hosted forms show them for editing.
    secret: !desktop && stored?.ref ? `${stored.kind}:${stored.ref}` : '',
    stored,
    storedScheme: auth.scheme,
    organization: connection.type === 'influxdb2' ? connection.settings.organization ?? '' : '',
  }
}

/** Whether the form keeps the saved secret when no new one is entered. */
export function keepsStoredSecret (form: ConnectionForm): boolean {
  return form.stored !== null && form.savedKey === form.key.trim() && form.storedScheme === form.scheme
}

function authInput (form: ConnectionForm, desktop: boolean): ConnectionAuthInput {
  const entered = form.secret.trim()
  const secret = entered ? (desktop ? { value: form.secret } : { ref: entered }) : undefined
  const scopes = form.scopes.split(/\s+/).filter(Boolean)
  switch (form.scheme) {
    case 'none': {
      return { scheme: 'none' }
    }
    case 'token':
    case 'bearer': {
      return { scheme: form.scheme, token: secret }
    }
    case 'header': {
      return { scheme: 'header', name: form.headerName.trim(), value: secret }
    }
    case 'basic': {
      return { scheme: 'basic', username: form.username, password: secret }
    }
    case 'oauth2ClientCredentials': {
      return { scheme: 'oauth2ClientCredentials', issuer: form.issuer.trim(), clientId: form.clientId.trim(), clientSecret: secret, scopes, audience: form.audience.trim() || undefined }
    }
    case 'delegatedUser': {
      return { scheme: 'delegatedUser', audience: form.audience.trim(), scopes, forwardUserToken: form.forwardUserToken }
    }
  }
}

export function connectionInputOf (form: ConnectionForm, desktop: boolean): ConnectionInput {
  return {
    key: form.key.trim(),
    type: form.type,
    url: form.url.trim(),
    aliases: form.aliases.map(alias => alias.trim()).filter(Boolean),
    allowPrivateNetwork: form.allowPrivateNetwork,
    timeoutSeconds: form.timeoutSeconds.trim() ? Number(form.timeoutSeconds) : undefined,
    auth: authInput(form, desktop),
    settings: form.organization.trim() ? { organization: form.organization.trim() } : {},
  }
}
