import type * as Sdk from '@basyx/studio-sdk/protocol'
import { presetSpec as sdkPresetSpec } from '@basyx/studio-sdk/protocol'
import { z } from 'zod'
import { problemSchema } from './problem'

// Local BaSyx instances on the user's Docker or Podman engine (ADR 0033).
// The BaSyx Docker app sends declarative stack specs; the Studio Service maps
// them onto a fixed catalogue and never accepts images, commands or mounts.

export const stackSpecFormat = 'basyx-stack/1'

export const stackPresets = ['quick', 'full', 'secured'] as const
export const stackPresetSchema = z.enum(stackPresets)
export type StackPreset = z.infer<typeof stackPresetSchema>

/**
 * `single`: one AAS environment serves every service (infrastructure template
 * `mono-all`); `separate`: the environment serves the repositories, and the
 * registries and discovery run as services of their own (`mono-repo`).
 */
export const stackTopologies = ['single', 'separate'] as const
export const stackTopologySchema = z.enum(stackTopologies)
export type StackTopology = z.infer<typeof stackTopologySchema>

/** `roles`: ABAC rules per role; `sharing`: ABAC plus ReBAC, users share what they own. */
export const stackAccessModels = ['roles', 'sharing'] as const
export const stackAccessModelSchema = z.enum(stackAccessModels)
export type StackAccessModel = z.infer<typeof stackAccessModelSchema>

/** Components of a stack; one container each. */
export const stackComponents = ['database', 'schema', 'keycloak', 'environment', 'aasRegistry', 'submodelRegistry', 'discovery'] as const
export const stackComponentIdSchema = z.enum(stackComponents)
export type StackComponentId = z.infer<typeof stackComponentIdSchema>

/** Offsets of the published ports from a stack's base port. */
export const componentPortOffsets: Partial<Record<StackComponentId, number>> = {
  environment: 0,
  keycloak: 1,
  aasRegistry: 2,
  submodelRegistry: 3,
  discovery: 4,
}

export const stackPortBlock = 5
export const firstStackPort = 18_100
export const lastStackPort = 64_000

/** File name of an AASX file loaded at startup. */
export const aasxFileNameSchema = z.string().min(1).max(200).regex(/^[\w.() -]+\.aasx$/i, 'must be the name of an .aasx file')

/** The `basyx-stack/1` document: what the user chose, without secrets. */
export const stackSpecSchema = z.object({
  format: z.literal(stackSpecFormat),
  // Shown in Studio and written into the export's compose file and README:
  // one line, without control characters.
  name: z.string().trim().min(1).max(80).regex(/^\P{Cc}*$/u, 'must be one line without control characters'),
  preset: stackPresetSchema,
  topology: stackTopologySchema,
  security: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }),
    z.object({ mode: z.literal('keycloak'), access: stackAccessModelSchema }),
  ]),
  /** `keep`: a named database volume; `ephemeral`: the database starts empty on every start. */
  persistence: z.enum(['keep', 'ephemeral']),
  features: z.object({
    history: z.boolean(),
    eventFeed: z.boolean(),
    /** Repositories keep the registries filled; always on with separate registries. */
    registrySync: z.boolean(),
    /** Repositories keep the discovery's asset links filled. */
    discoverySync: z.boolean(),
  }),
  network: z.object({
    /** `local`: ports on 127.0.0.1 only; `network`: reachable from other computers. */
    exposure: z.enum(['local', 'network']),
    /** First of five consecutive ports; `null` picks free ones. */
    basePort: z.number().int().min(1024).max(lastStackPort).nullable(),
  }),
  images: z.object({
    /** `tested`: the digests this Studio was tested with; `latest`: the newest snapshot. */
    channel: z.enum(['tested', 'latest']),
    /** Exported locks contain only digests; repositories still come from the catalogue. */
    digests: z.partialRecord(stackComponentIdSchema, z.string().regex(/^sha256:[a-f0-9]{64}$/)).optional(),
  }),
  /** `always`: comes back with the engine unless stopped; `manual`: only when started here. */
  restart: z.enum(['always', 'manual']),
  aasxFiles: z.array(aasxFileNameSchema).max(20),
})
export type StackSpec = z.infer<typeof stackSpecSchema>

/** The defaults of a preset; the wizard starts from these. Defined in the SDK, which the BaSyx Docker app uses too. */
export const presetSpec: (preset: StackPreset, name: string) => StackSpec = sdkPresetSpec

// ---------------------------------------------------------------------------
// Engines

export const engineKindSchema = z.enum(['docker', 'podman'])
export type EngineKind = z.infer<typeof engineKindSchema>

/** A socket or named pipe Studio can talk to: `unix:///path` or `npipe:////./pipe/name`. */
export const engineHostSchema = z.string().max(1000).regex(/^(?:unix:\/\/\/\S+|npipe:\/\/\/\/\.\/pipe\/[\w.-]+)$/, 'must be unix:///path or npipe:////./pipe/name')

export const engineInfoSchema = z.object({
  host: z.string(),
  kind: engineKindSchema,
  /** Product name for people, e.g. `Docker Desktop`, `Podman`, `Colima`. */
  name: z.string(),
  /** Where the candidate came from: settings, `DOCKER_HOST`, a Docker context, a well-known socket. */
  source: z.enum(['settings', 'environment', 'context', 'default']),
  running: z.boolean(),
  version: z.string().nullable(),
  apiVersion: z.string().nullable(),
  os: z.string().nullable(),
  arch: z.string().nullable(),
  error: z.string().nullable(),
})
export type EngineInfo = z.infer<typeof engineInfoSchema>

export const enginesSchema = z.object({
  /** The engine in use: the chosen one, else the first running candidate. */
  selected: engineInfoSchema.nullable(),
  candidates: z.array(engineInfoSchema),
  /** The engine chosen in settings; `null` picks automatically. */
  configured: z.string().nullable(),
})
export type Engines = z.infer<typeof enginesSchema>

// ---------------------------------------------------------------------------
// Stacks

export const componentStateSchema = z.enum(['running', 'starting', 'unhealthy', 'stopped', 'exited', 'missing'])
export type ComponentState = z.infer<typeof componentStateSchema>

export const stackComponentSchema = z.object({
  id: stackComponentIdSchema,
  state: componentStateSchema,
  /** Exit code of a stopped container, if any. */
  exitCode: z.number().int().nullable(),
  /** Published URL on this computer, for components with a port. */
  url: z.string().nullable(),
  image: z.string(),
})
export type StackComponent = z.infer<typeof stackComponentSchema>

/**
 * `busy`: a job runs; `partial`: some components run; `error`: a component
 * failed; `missing`: the containers were removed outside Studio; `orphan`:
 * containers with Studio's label but no stored instance; `unknown`: the
 * engine cannot be reached.
 */
export const stackStatusSchema = z.enum(['running', 'busy', 'partial', 'stopped', 'error', 'missing', 'orphan', 'unknown'])
export type StackStatus = z.infer<typeof stackStatusSchema>

export const stackUrlsSchema = z.object({
  environment: z.string().nullable(),
  aasRegistry: z.string().nullable(),
  submodelRegistry: z.string().nullable(),
  discovery: z.string().nullable(),
  keycloak: z.string().nullable(),
})
export type StackUrls = z.infer<typeof stackUrlsSchema>

export const stackSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `null` for orphans. */
  spec: stackSpecSchema.nullable(),
  status: stackStatusSchema,
  components: z.array(stackComponentSchema),
  urls: stackUrlsSchema,
  /** The infrastructure Studio created for the stack, if it still exists. */
  infrastructureId: z.string().nullable(),
  /** The engine the stack was created on. */
  engineHost: z.string().nullable(),
  /** The job that currently runs for the stack. */
  jobId: z.string().nullable(),
  /** Newer tested images exist than the stack uses. */
  updateAvailable: z.boolean(),
  createdAt: z.string().nullable(),
})
export type Stack = z.infer<typeof stackSchema>

export const stackListSchema = z.object({
  engineAvailable: z.boolean(),
  items: z.array(stackSchema),
})
export type StackList = z.infer<typeof stackListSchema>

export const stackImageSchema = z.object({
  reference: z.string(),
  present: z.boolean(),
  /** Approximate download size in MB. */
  downloadMb: z.number(),
})

/** What a spec would create, for the review step. */
export const stackPlanSchema = z.object({
  spec: stackSpecSchema,
  components: z.array(stackComponentIdSchema),
  urls: stackUrlsSchema,
  images: z.array(stackImageSchema),
  /** Approximate download in MB for the images not present yet; `null` when the engine is unreachable. */
  downloadMb: z.number().nullable(),
  /** Ports of the spec that are in use; only for fixed ports. */
  portsInUse: z.array(z.number().int()),
})
export type StackPlan = z.infer<typeof stackPlanSchema>

// ---------------------------------------------------------------------------
// Jobs

export const jobKinds = ['create', 'start', 'stop', 'update', 'change', 'remove'] as const
export const jobKindSchema = z.enum(jobKinds)
export type JobKind = z.infer<typeof jobKindSchema>

export const jobStepSchema = z.object({
  /** `prepare`, `download:<image>`, `create`, `start:<component>` (started and ready), `register`, `unregister`, `stop`, `remove`. */
  id: z.string(),
  state: z.enum(['pending', 'running', 'done', 'failed', 'skipped']),
  /** Bytes for downloads; `null` where unknown. */
  progress: z.object({ current: z.number(), total: z.number() }).nullable(),
  /** A short note: the problem code of an optional step that failed (`register`, `unregister`), which does not fail the job. */
  note: z.string().nullable(),
})
export type JobStep = z.infer<typeof jobStepSchema>

export const jobSchema = z.object({
  id: z.string(),
  stackId: z.string(),
  kind: jobKindSchema,
  state: z.enum(['running', 'succeeded', 'failed']),
  steps: z.array(jobStepSchema),
  problem: problemSchema.nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
})
export type Job = z.infer<typeof jobSchema>

export const stackWithJobSchema = z.object({ stack: stackSchema, job: jobSchema })
export type StackWithJob = z.infer<typeof stackWithJobSchema>

// ---------------------------------------------------------------------------
// Sign-in, logs, import

export const stackSignInSchema = z.object({
  issuer: z.string(),
  /** Keycloak's account page, where users change their password. */
  accountUrl: z.string(),
  users: z.array(z.object({
    username: z.string(),
    password: z.string(),
    /** `admin`, `viewer` (roles) or `admin`, `user` (sharing). */
    role: z.enum(['admin', 'viewer', 'user']),
  })),
  /** Keycloak's own administrator (master realm). */
  console: z.object({ url: z.string(), username: z.string(), password: z.string() }),
})
export type StackSignIn = z.infer<typeof stackSignInSchema>

export const stackLogsSchema = z.object({
  component: stackComponentIdSchema,
  text: z.string(),
  truncated: z.boolean(),
})
export type StackLogs = z.infer<typeof stackLogsSchema>

export const importNotes = ['ports_reassigned', 'secrets_generated', 'compose_ignored', 'aasx_missing'] as const

export const stackImportSchema = z.object({
  /** Pass to `createStack` to use the imported secrets and AASX files. */
  importId: z.string(),
  spec: stackSpecSchema,
  aasxFiles: z.array(z.string()),
  notes: z.array(z.enum(importNotes)),
})
export type StackImport = z.infer<typeof stackImportSchema>

/** A file the user picked through the host dialog. */
export const pickedFileSchema = z.object({ handle: z.string(), fileName: z.string() })
export type PickedFile = z.infer<typeof pickedFileSchema>

// ---------------------------------------------------------------------------
// The SDK writes these shapes out by hand for app authors. This fails to
// compile when they and the schemas above drift apart.

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

export type ContainerTypesMatchSdk = [
  Expect<Same<StackSpec, Sdk.StackSpec>>,
  Expect<Same<EngineInfo, Sdk.EngineInfo>>,
  Expect<Same<Engines, Sdk.Engines>>,
  Expect<Same<StackComponent, Sdk.StackComponent>>,
  Expect<Same<Stack, Sdk.Stack>>,
  Expect<Same<StackList, Sdk.StackList>>,
  Expect<Same<StackPlan, Sdk.StackPlan>>,
  Expect<Same<JobStep, Sdk.JobStep>>,
  Expect<Same<Omit<Job, 'problem'>, Omit<Sdk.Job, 'problem'>>>,
  Expect<Same<StackSignIn, Sdk.StackSignIn>>,
  Expect<Same<StackLogs, Sdk.StackLogs>>,
  Expect<Same<StackImport, Sdk.StackImport>>,
  Expect<Same<PickedFile, Sdk.PickedFile>>,
]
