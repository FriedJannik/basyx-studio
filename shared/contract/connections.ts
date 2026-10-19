import { z } from 'zod'
import { scopesSchema, secretInputSchema, secretSummarySchema } from './credentials'

// Connections of an infrastructure to services that are not AAS services
// (ADR 0040). `type` names the API the service speaks and selects the
// adapter in the Studio Service; `auth` says how Studio authenticates there.
// A connection never serves as a generic proxy.

/** What a connection can be used for; capabilities are named by purpose. */
export const connectionPurposes = ['timeseries'] as const
export type ConnectionPurpose = (typeof connectionPurposes)[number]

export const connectionAuthSchemes = ['none', 'token', 'bearer', 'header', 'basic', 'oauth2ClientCredentials', 'delegatedUser'] as const
export type ConnectionAuthScheme = (typeof connectionAuthSchemes)[number]

export interface ConnectionTypeInfo {
  purposes: readonly ConnectionPurpose[]
  /** The schemes the adapter accepts. */
  authSchemes: readonly ConnectionAuthScheme[]
  /** Used unless the connection sets `timeoutSeconds`. */
  defaultTimeoutSeconds: number
}

export const connectionTypes = {
  /** InfluxDB 2.x: Flux over `/api/v2/query`. */
  influxdb2: { purposes: ['timeseries'], authSchemes: ['token'], defaultTimeoutSeconds: 15 },
} as const satisfies Record<string, ConnectionTypeInfo>
export type ConnectionType = keyof typeof connectionTypes
export const connectionTypeNames = Object.keys(connectionTypes) as [ConnectionType, ...ConnectionType[]]

/** The longest timeout a connection may set (MVP-7 plan, K7). */
export const maxConnectionTimeoutSeconds = 120

/** The secret field of each scheme, if it has one. */
export const connectionSecretFields = {
  none: null,
  token: 'token',
  bearer: 'token',
  header: 'value',
  basic: 'password',
  oauth2ClientCredentials: 'clientSecret',
  delegatedUser: null,
} as const satisfies Record<ConnectionAuthScheme, string | null>

export const connectionKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'use 1 to 63 lowercase letters, digits and hyphens, starting with a letter or digit')

/** Headers Studio sets itself or that would change how the request is transported. */
const reservedHeaders = new Set(['host', 'content-length', 'content-type', 'accept', 'transfer-encoding', 'connection', 'keep-alive', 'upgrade', 'te', 'trailer', 'expect', 'proxy-authorization', 'proxy-connection'])

const headerNameSchema = z.string()
  .regex(/^[!#$%&'*+.^\w`|~-]{1,100}$/, 'must be an HTTP header name')
  .refine(name => !reservedHeaders.has(name.toLowerCase()), 'Studio sets this header itself')

/** A base URL without credentials, query or fragment. */
const serviceUrlSchema = z.url({ protocol: /^https?$/ }).max(2000).refine(value => {
  const url = new URL(value)
  return !url.username && !url.password && !url.search && !url.hash
}, 'must not contain credentials, a query or a fragment')

const audienceSchema = z.string().trim().min(1).max(500)
const issuerSchema = z.url({ protocol: /^https?$/ }).max(2000)

export const connectionAuthInputSchema = z.discriminatedUnion('scheme', [
  z.object({ scheme: z.literal('none') }),
  /** `Authorization: Token …`, e.g. InfluxDB API tokens. Omit the secret on update to keep it. */
  z.object({ scheme: z.literal('token'), token: secretInputSchema.optional() }),
  z.object({ scheme: z.literal('bearer'), token: secretInputSchema.optional() }),
  z.object({ scheme: z.literal('header'), name: headerNameSchema, value: secretInputSchema.optional() }),
  z.object({ scheme: z.literal('basic'), username: z.string().min(1).max(500).regex(/^[^:]*$/, 'must not contain a colon'), password: secretInputSchema.optional() }),
  z.object({
    scheme: z.literal('oauth2ClientCredentials'),
    issuer: issuerSchema,
    clientId: z.string().min(1).max(500),
    clientSecret: secretInputSchema.optional(),
    scopes: scopesSchema.default([]),
    /** Sent as `audience` in the token request, for issuers that need it. */
    audience: audienceSchema.optional(),
  }),
  z.object({
    scheme: z.literal('delegatedUser'),
    /** The service's audience; the token Studio sends must be issued for it. */
    audience: audienceSchema,
    scopes: scopesSchema.default([]),
    /** Forward the user's token unchanged instead of exchanging it (RFC 8693); only if its `aud` contains `audience`. */
    forwardUserToken: z.boolean().default(false),
  }),
])
export type ConnectionAuthInput = z.input<typeof connectionAuthInputSchema>

export const connectionAuthSummarySchema = z.discriminatedUnion('scheme', [
  z.object({ scheme: z.literal('none') }),
  z.object({ scheme: z.literal('token'), token: secretSummarySchema.nullable() }),
  z.object({ scheme: z.literal('bearer'), token: secretSummarySchema.nullable() }),
  z.object({ scheme: z.literal('header'), name: z.string(), value: secretSummarySchema.nullable() }),
  z.object({ scheme: z.literal('basic'), username: z.string(), password: secretSummarySchema.nullable() }),
  z.object({
    scheme: z.literal('oauth2ClientCredentials'),
    issuer: z.string(),
    clientId: z.string(),
    clientSecret: secretSummarySchema.nullable(),
    scopes: z.array(z.string()),
    audience: z.string().optional(),
  }),
  z.object({ scheme: z.literal('delegatedUser'), audience: z.string(), scopes: z.array(z.string()), forwardUserToken: z.boolean() }),
])
export type ConnectionAuthSummary = z.infer<typeof connectionAuthSummarySchema>

export const influxdb2SettingsSchema = z.object({
  /** Replaces the `org`/`orgID` of the endpoints named in AAS content. */
  organization: z.string().trim().min(1).max(200).optional(),
}).strict()

const connectionFields = {
  key: connectionKeySchema,
  /** How the Studio Service reaches the service, e.g. `http://influxdb:8086`. */
  url: serviceUrlSchema,
  /** Other origins under which AAS content refers to the service, e.g. `http://localhost:8086`; never contacted. */
  aliases: z.array(serviceUrlSchema).max(10).default([]),
  /** Permit loopback and private-network addresses; subject to the deployment policy. */
  allowPrivateNetwork: z.boolean().default(false),
  /** Overrides the adapter's default timeout. */
  timeoutSeconds: z.number().int().min(1).max(maxConnectionTimeoutSeconds).optional(),
}

export const connectionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('influxdb2'), ...connectionFields, auth: connectionAuthInputSchema, settings: influxdb2SettingsSchema.default({}) }),
]).superRefine((connection, context) => {
  const accepted: readonly ConnectionAuthScheme[] = connectionTypes[connection.type].authSchemes
  if (!accepted.includes(connection.auth.scheme)) {
    context.addIssue({ code: 'custom', path: ['auth', 'scheme'], message: `${connection.type} connections accept ${accepted.join(', ')}` })
  }
})
export type ConnectionInput = z.input<typeof connectionInputSchema>
export type ParsedConnectionInput = z.output<typeof connectionInputSchema>

/** A connection as stored and returned; secrets as summaries only. */
export const connectionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('influxdb2'),
    key: z.string(),
    url: z.string(),
    aliases: z.array(z.string()),
    allowPrivateNetwork: z.boolean(),
    timeoutSeconds: z.number().int().optional(),
    auth: connectionAuthSummarySchema,
    settings: influxdb2SettingsSchema,
  }),
])
export type Connection = z.infer<typeof connectionSchema>

/** Checks of *Test connection* (CON-005), in the order they run. */
export const connectionChecks = ['token', 'health', 'query'] as const

export const connectionTestRequestSchema = z.object({
  /** An edited connection to test before saving; its omitted secret is the stored one of the same key. Without it, the stored connection is tested. */
  connection: z.unknown().optional(),
}).strict()

export const connectionTestResultSchema = z.object({
  checkedAt: z.string(),
  ok: z.boolean(),
  checks: z.array(z.object({
    check: z.enum(connectionChecks),
    ok: z.boolean(),
    status: z.number().int().nullable(),
    latencyMs: z.number().nullable(),
    /** What went wrong; never contains the secret. */
    message: z.string().nullable(),
  })),
})
export type ConnectionTestResult = z.infer<typeof connectionTestResultSchema>
