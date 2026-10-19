import { z } from 'zod'
import { connectionInputSchema, connectionSchema } from './connections'
import { scopesSchema, secretInputSchema, secretRefSchema, secretSummarySchema } from './credentials'

export { type SecretInput, secretInputSchema, type SecretSummary, secretSummarySchema } from './credentials'

/**
 * Service endpoints of an infrastructure. An `aasEnvironment` serves several
 * services from one base URL (which ones, the template decides) and adds the
 * environment-only operations (serialization, upload).
 */
export const endpointTypes = [
  'aasEnvironment',
  'aasRegistry',
  'submodelRegistry',
  'aasDiscovery',
  'aasRepository',
  'submodelRepository',
  'conceptDescriptionRepository',
] as const
export const endpointTypeSchema = z.enum(endpointTypes)
export type EndpointType = z.infer<typeof endpointTypeSchema>

/** The service types that answer AAS API requests (everything but the environment itself). */
export type ServiceType = Exclude<EndpointType, 'aasEnvironment'>
export const serviceTypes = endpointTypes.filter((type): type is ServiceType => type !== 'aasEnvironment')

/**
 * How an infrastructure is deployed, as in the BaSyx AAS Web UI (MVP-4 plan, I1):
 * - `full`: every service has its own URL;
 * - `mono-all`: one AAS environment URL serves every service;
 * - `mono-repo`: an AAS environment serves the repositories, registries and
 *   discovery have their own URLs;
 * - `identifiable`: an AAS repository only; submodels are reached through the
 *   shells that reference them.
 */
export const infrastructureTemplates = ['full', 'mono-all', 'mono-repo', 'identifiable'] as const
export const infrastructureTemplateSchema = z.enum(infrastructureTemplates)
export type InfrastructureTemplate = z.infer<typeof infrastructureTemplateSchema>

interface TemplateRules {
  /** Endpoint types the template accepts. */
  allowed: readonly EndpointType[]
  /** Groups of alternatives; each group needs at least one endpoint. */
  required: ReadonlyArray<readonly EndpointType[]>
  /** Services the AAS environment serves unless they have an endpoint of their own. */
  environmentServes: readonly ServiceType[]
}

export const templateRules: Record<InfrastructureTemplate, TemplateRules> = {
  'full': {
    allowed: serviceTypes,
    required: [['aasRepository', 'aasRegistry'], ['submodelRepository', 'submodelRegistry']],
    environmentServes: [],
  },
  'mono-all': {
    allowed: ['aasEnvironment'],
    required: [['aasEnvironment']],
    environmentServes: serviceTypes,
  },
  'mono-repo': {
    allowed: ['aasEnvironment', 'aasRegistry', 'submodelRegistry', 'aasDiscovery'],
    required: [['aasEnvironment']],
    environmentServes: ['aasRepository', 'submodelRepository', 'conceptDescriptionRepository'],
  },
  'identifiable': {
    allowed: ['aasRepository', 'conceptDescriptionRepository', 'aasDiscovery'],
    required: [['aasRepository']],
    environmentServes: [],
  },
}

/**
 * The base URL that serves a service type: its own endpoint, else the AAS
 * environment where the template lets it serve that type.
 */
export function serviceUrl (
  infrastructure: { template: InfrastructureTemplate, endpoints: ReadonlyArray<{ type: EndpointType, url: string }> },
  type: ServiceType,
): string | undefined {
  const own = infrastructure.endpoints.find(endpoint => endpoint.type === type)
  const environment = templateRules[infrastructure.template].environmentServes.includes(type)
    ? infrastructure.endpoints.find(endpoint => endpoint.type === 'aasEnvironment')
    : undefined
  return (own ?? environment)?.url.replace(/\/+$/, '')
}

/** Where the shell list comes from when both an AAS registry and an AAS repository are there (I3). */
export const listSources = ['registry', 'repository'] as const
export type ListSource = (typeof listSources)[number]

/** What Studio does about registry descriptors and discovery links the server does not maintain (I5). */
export const syncModes = ['autoCreate', 'dontCreate'] as const
export type SyncMode = (typeof syncModes)[number]

export const syncSettingsSchema = z.object({
  /** The server keeps its registries in step with its repositories (BaSyx Go registry integration). */
  serverSyncsRegistry: z.boolean().default(true),
  /** The server keeps the discovery's asset links in step with its shells. */
  serverSyncsDiscovery: z.boolean().default(true),
  /** Where the server does not: Studio writes descriptors and asset links after uploads and deletes, or not. */
  studioDefault: z.enum(syncModes).default('autoCreate'),
  /** Whether users may choose differently for themselves (in Settings). */
  userOverride: z.boolean().default(false),
  /** How Studio generates identifiers of new shells and submodels (MVP-5 plan, W5). */
  idScheme: z.enum(['iri', 'uuid']).default('iri'),
  /** The IRI prefix for `idScheme: iri`; the kind and a UUID follow. */
  idPrefix: z.string().trim().min(1).max(200).default('https://example.com/ids/'),
})
export type SyncSettings = z.infer<typeof syncSettingsSchema>
export const defaultSyncSettings: SyncSettings = syncSettingsSchema.parse({})

export const securityModes = ['unsecured', 'deployment_client_credentials', 'delegated_user'] as const
export const securityModeSchema = z.enum(securityModes)
export type SecurityMode = z.infer<typeof securityModeSchema>

/** Largest accepted PKCS#12 bundle, base64-encoded (about 96 KiB of DER). */
export const maxClientCertificateLength = 131_072

/**
 * A TLS client certificate (mutual TLS) as a PKCS#12 bundle, like a client
 * secret either a reference to deployment-provided files (hosted) or an
 * uploaded bundle that the desktop Studio stores encrypted.
 */
export const clientCertificateInputSchema = z.union([
  z.object({
    ref: z.string().regex(/^file:\/\S+$/, 'use file:/absolute/path'),
    /** `env:NAME` or `file:/path`; omit for a bundle without passphrase. */
    passphraseRef: secretRefSchema.optional(),
  }),
  z.object({
    /** The .p12/.pfx file, base64-encoded. */
    value: z.base64().min(1).max(maxClientCertificateLength),
    passphrase: z.string().max(4096).default(''),
  }),
])
export type ClientCertificateInput = z.input<typeof clientCertificateInputSchema>

/** The stored client certificate; never the bundle or its passphrase. */
export const clientCertificateSummarySchema = z.object({
  kind: z.enum(['file', 'stored']),
  /** The bundle's path for `file` certificates. */
  ref: z.string().nullable(),
  /** The passphrase reference (`env:NAME`, `file:/path`) for `file` certificates. */
  passphraseRef: z.string().nullable(),
  subject: z.string(),
  issuer: z.string(),
  notAfter: z.string(),
})
export type ClientCertificateSummary = z.infer<typeof clientCertificateSummarySchema>

const oidcFields = {
  issuer: z.url({ protocol: /^https?$/ }).max(2000),
  clientId: z.string().min(1).max(500),
  scopes: scopesSchema,
}

export const securityInputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('unsecured') }),
  z.object({
    mode: z.literal('deployment_client_credentials'),
    ...oidcFields,
    /** Omit on update to keep the stored secret. */
    clientSecret: secretInputSchema.optional(),
  }),
  z.object({
    mode: z.literal('delegated_user'),
    ...oidcFields,
    /** Confidential hosted clients only; desktop clients are public (RFC 8252). */
    clientSecret: secretInputSchema.optional(),
    /** Loopback host registered at the IdP for the desktop client. */
    desktopLoopbackHost: z.enum(['127.0.0.1', 'localhost']).default('127.0.0.1'),
  }),
])
export type SecurityInput = z.infer<typeof securityInputSchema>

export const securitySummarySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('unsecured') }),
  z.object({
    mode: z.literal('deployment_client_credentials'),
    ...oidcFields,
    clientSecret: secretSummarySchema.nullable(),
  }),
  z.object({
    mode: z.literal('delegated_user'),
    ...oidcFields,
    clientSecret: secretSummarySchema.nullable(),
    desktopLoopbackHost: z.enum(['127.0.0.1', 'localhost']),
  }),
])
export type SecuritySummary = z.infer<typeof securitySummarySchema>

export const endpointInputSchema = z.object({
  type: endpointTypeSchema,
  url: z.url({ protocol: /^https?$/ }).max(2000),
})
export type EndpointInput = z.infer<typeof endpointInputSchema>

export const infrastructureInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  template: infrastructureTemplateSchema.default('full'),
  endpoints: z
    .array(endpointInputSchema)
    .min(1)
    .max(endpointTypes.length)
    .refine(endpoints => new Set(endpoints.map(endpoint => endpoint.type)).size === endpoints.length, 'each endpoint type may occur only once'),
  listSource: z.enum(listSources).default('registry'),
  sync: syncSettingsSchema.default(defaultSyncSettings),
  security: securityInputSchema,
  /** Presented on every HTTPS connection, including the IdP's. Omit on update to keep the stored certificate; `null` removes it. */
  clientCertificate: clientCertificateInputSchema.nullish(),
  /** Permit loopback and private-network addresses; subject to the deployment policy. */
  allowPrivateNetwork: z.boolean().default(false),
  /** Third-party services that content of this infrastructure refers to (ADR 0040). */
  connections: z.array(connectionInputSchema).max(20).default([]),
}).superRefine((input, context) => {
  const keys = new Set<string>()
  for (const [index, connection] of input.connections.entries()) {
    if (keys.has(connection.key)) {
      context.addIssue({ code: 'custom', path: ['connections', index, 'key'], message: 'each connection key may occur only once' })
    }
    keys.add(connection.key)
    if (connection.auth.scheme === 'delegatedUser' && input.security.mode !== 'delegated_user') {
      context.addIssue({ code: 'custom', path: ['connections', index, 'auth', 'scheme'], message: 'the user\'s identity needs an infrastructure whose users sign in (delegated_user)' })
    }
  }
  const rules = templateRules[input.template]
  for (const [index, endpoint] of input.endpoints.entries()) {
    if (!rules.allowed.includes(endpoint.type)) {
      context.addIssue({ code: 'custom', path: ['endpoints', index, 'type'], message: `the template ${input.template} has no ${endpoint.type} endpoint` })
    }
  }
  for (const group of rules.required) {
    if (!input.endpoints.some(endpoint => group.includes(endpoint.type))) {
      context.addIssue({ code: 'custom', path: ['endpoints'], message: `the template ${input.template} needs ${group.join(' or ')}` })
    }
  }
})
export type InfrastructureInput = z.input<typeof infrastructureInputSchema>

/** What an import does with an entry whose name an infrastructure already has. */
export const importResolutions = ['skip', 'replace', 'create'] as const
export type ImportResolution = (typeof importResolutions)[number]

/** Infrastructures in the file format (YAML), checked (`dryRun`) or imported as ordinary infrastructures. */
export const infrastructureImportRequestSchema = z.object({
  yaml: z.string().max(1_000_000),
  dryRun: z.boolean().default(true),
  /** Per entry index; entries with a conflict are skipped unless resolved otherwise. */
  resolutions: z.record(z.string().regex(/^\d+$/), z.enum(importResolutions)).default({}),
})
export type InfrastructureImportRequest = z.input<typeof infrastructureImportRequestSchema>

export const infrastructureImportEntrySchema = z.object({
  index: z.number().int(),
  key: z.string().nullable(),
  name: z.string().nullable(),
  /** Why the entry cannot be imported as it is; empty when it can. */
  problems: z.array(z.string()),
  /** The infrastructure that already has this name. */
  conflict: z.object({ id: z.string(), name: z.string(), managed: z.boolean() }).nullable(),
  resolution: z.enum(importResolutions),
  /** What the import did; `null` in a dry run. */
  outcome: z.enum(['created', 'replaced', 'skipped', 'failed']).nullable(),
  infrastructureId: z.string().nullable(),
})
export type InfrastructureImportEntry = z.infer<typeof infrastructureImportEntrySchema>

export const infrastructureImportResultSchema = z.object({
  /** Problems of the file as a whole; nothing is imported while there are any. */
  problems: z.array(z.string()),
  entries: z.array(infrastructureImportEntrySchema),
})
export type InfrastructureImportResult = z.infer<typeof infrastructureImportResultSchema>

/** Stable identity of an infrastructure in the deployment's infrastructure file (ADR 0037). */
export const managedInfrastructureKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'use 1 to 63 lowercase letters, digits and hyphens, starting with a letter or digit')

/** The `/description` profiles of each endpoint at the last probe; `null` where the endpoint did not answer with them. */
export const serviceProfilesSchema = z.partialRecord(endpointTypeSchema, z.array(z.string()).nullable())
export type ServiceProfiles = z.infer<typeof serviceProfilesSchema>

export const infrastructureSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  template: infrastructureTemplateSchema,
  endpoints: z.array(endpointInputSchema),
  listSource: z.enum(listSources),
  sync: syncSettingsSchema,
  serviceProfiles: serviceProfilesSchema,
  /** When the profiles were read; `null` before the first successful probe. */
  probedAt: z.string().nullable(),
  /** The optional features the services announce in their profiles. */
  announced: z.object({ history: z.boolean(), changeFeed: z.boolean(), rebac: z.boolean() }),
  security: securitySummarySchema,
  clientCertificate: clientCertificateSummarySchema.nullable(),
  allowPrivateNetwork: z.boolean(),
  connections: z.array(connectionSchema),
  /** Declared in the deployment's infrastructure file: read-only in Studio. */
  managed: z.boolean(),
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Infrastructure = z.infer<typeof infrastructureSchema>

export const probeResultSchema = z.object({
  checkedAt: z.string(),
  endpoints: z.array(z.object({
    type: endpointTypeSchema,
    reachable: z.boolean(),
    status: z.number().int().nullable(),
    latencyMs: z.number().nullable(),
    error: z.string().nullable(),
    /** The service profiles from `/description`, if it answered with them. */
    profiles: z.array(z.string()).nullable(),
  })),
})
export type ProbeResult = z.infer<typeof probeResultSchema>
