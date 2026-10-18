import type { MethodName, Methods } from '@basyx/studio-sdk/protocol'
import { permissions, protocolVersion, stackFileKinds } from '@basyx/studio-sdk/protocol'
import { z } from 'zod'
import { displayBreakpoints } from '../overview'
import { engineHostSchema, stackComponentIdSchema, stackSpecSchema } from './containers'
import { langStringSchema, listQuerySchema } from './target'
import { fileHandleSchema } from './workspace'

// Runtime-installable apps (ADR 0004, MVP-3). The `studio-sdk/0` message
// types are defined by @basyx/studio-sdk; these schemas validate what Studio
// receives from app frames and serves through `/app-installations`,
// `/app-contributions` and `/app-calls`.

export const appPermissionSchema = z.enum(permissions)
export type AppPermission = z.infer<typeof appPermissionSchema>

export const localizedTextSchema = z.record(z.string(), z.string())
export type LocalizedText = z.infer<typeof localizedTextSchema>

export const appInstallationSchema = z.object({
  id: z.string(),
  appId: z.string(),
  version: z.string(),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  publisher: z.string(),
  /** `sha256:<hex>` of the uploaded package. */
  digest: z.string(),
  /** Installed through developer mode, without a marketplace signature. */
  unsigned: z.boolean(),
  /** Shipped with Studio and installed at startup (ADR 0023). */
  bundled: z.boolean(),
  permissions: z.array(appPermissionSchema),
  submodelViews: z.number().int(),
  modules: z.number().int(),
  backend: z.boolean(),
  installedAt: z.string(),
  installedBy: z.string(),
})
export type AppInstallation = z.infer<typeof appInstallationSchema>

const contributionBase = {
  installationId: z.string(),
  appId: z.string(),
  appTitle: localizedTextSchema,
  id: z.string(),
  title: localizedTextSchema,
  /** URL of the sandboxed entry document on the app origin. */
  entryUrl: z.string(),
  permissions: z.array(appPermissionSchema),
  unsigned: z.boolean(),
  bundled: z.boolean(),
}

export const submodelViewContributionSchema = z.object({
  kind: z.literal('submodelView'),
  ...contributionBase,
  /** Why the view is offered, e.g. the semantic ID that matched. */
  reason: z.object({ semanticId: z.string() }),
  /** Default widths on the Overview per breakpoint, in columns of 12 (manifest `columns`). */
  columns: z.partialRecord(z.enum(displayBreakpoints), z.number().int().min(3).max(12)).default({}),
})
export type SubmodelViewContributionInfo = z.infer<typeof submodelViewContributionSchema>

export const moduleContributionSchema = z.object({
  kind: z.literal('module'),
  ...contributionBase,
  icon: z.string().nullable(),
  route: z.string(),
  context: z.enum(['global', 'target', 'shell']),
})
export type ModuleContributionInfo = z.infer<typeof moduleContributionSchema>

export type AppContributionInfo = SubmodelViewContributionInfo | ModuleContributionInfo

export const appContributionsQuerySchema = z.object({
  /**
   * Submodel semantic IDs; submodel views are returned only for given IDs.
   * Repeat the parameter for several submodels, e.g. a shell's overview.
   */
  semanticId: z.union([z.string().min(1).max(2048), z.array(z.string().min(1).max(2048)).max(100)]).optional().transform(value => value === undefined ? [] : (Array.isArray(value) ? value : [value])),
})

export const appContributionsSchema = z.object({
  submodelViews: z.array(submodelViewContributionSchema),
  modules: z.array(moduleContributionSchema),
})
export type AppContributions = z.infer<typeof appContributionsSchema>

// ---------------------------------------------------------------------------
// Bridge messages from app frames (validated by the host renderer)

export const appHelloSchema = z.object({
  protocol: z.literal(protocolVersion),
  type: z.literal('hello'),
})

export const appRequestMessageSchema = z.object({
  type: z.literal('request'),
  id: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  method: z.string().max(100),
  params: z.unknown(),
})
export type AppRequestMessage = z.infer<typeof appRequestMessageSchema>

// ---------------------------------------------------------------------------
// Capability calls

const identifier = z.string().min(1).max(2048)

/** URLs an app may open in the system browser: https, or http of this computer, where local BaSyx instances answer. */
export function isExternalUrl (value: string): boolean {
  const url = URL.parse(value)
  return url?.protocol === 'https:' || (url?.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
}
const stackId = z.string().regex(/^[\w-]{1,64}$/)
const idShortPath = z.string().min(1).max(4000)

/** Parameters of every capability method; anything else is rejected. */
export const appMethodParamsSchemas = {
  'studio.ui.getContext': z.object({}).strict(),
  'studio.ui.notify': z.object({
    message: z.string().min(1).max(500),
    level: z.enum(['info', 'success', 'warning', 'error']).default('info'),
  }).strict(),
  'studio.ui.navigate': z.object({
    subPath: z.string().max(500).regex(/^(?:[\w.~-]+(?:\/[\w.~-]+)*)?$/, 'must be a relative path'),
  }).strict(),
  'studio.ui.setHeight': z.object({ height: z.number().int().min(0).max(20_000) }).strict(),
  'studio.ui.openFile': z.object({ submodelId: identifier, idShortPath, download: z.boolean().default(false) }).strict(),
  'studio.ui.openFullscreen': z.object({}).strict(),
  'studio.aas.listShells': listQuerySchema.strict(),
  'studio.aas.getShell': z.object({ shellId: identifier }).strict(),
  'studio.aas.listSubmodels': z.object({ shellId: identifier }).strict(),
  'studio.aas.getSubmodel': z.object({ submodelId: identifier }).strict(),
  'studio.aas.getElement': z.object({ submodelId: identifier, idShortPath }).strict(),
  'studio.aas.setElementValue': z.object({
    submodelId: identifier,
    idShortPath,
    value: z.union([
      z.string().max(1_000_000).nullable(),
      z.array(langStringSchema.extend({ language: z.string().min(1).max(64), text: z.string().max(1_000_000) })).max(200),
    ]),
    revision: z.string().min(1).max(200),
  }).strict(),
  'studio.backend.call': z.object({
    method: z.string().regex(/^[A-Z]\w{0,63}$/i, 'must be the name of an exported function'),
    params: z.unknown().optional(),
  }).strict(),
  'studio.ui.openTarget': z.object({ targetId: z.string().min(1).max(200) }).strict(),
  'studio.ui.openExternal': z.object({ url: z.url({ protocol: /^https?$/ }).max(2000).refine(isExternalUrl, 'must be an https URL, or an http URL of this computer') }).strict(),
  'studio.ui.copyText': z.object({ text: z.string().max(10_000) }).strict(),
  'studio.containers.listEngines': z.object({}).strict(),
  'studio.containers.selectEngine': z.object({ host: engineHostSchema.nullable() }).strict(),
  'studio.containers.listStacks': z.object({}).strict(),
  'studio.containers.getStack': z.object({ stackId }).strict(),
  'studio.containers.planStack': z.object({ spec: stackSpecSchema, stackId: stackId.optional() }).strict(),
  'studio.containers.createStack': z.object({
    spec: stackSpecSchema,
    aasxFiles: z.array(fileHandleSchema).max(20).optional(),
    importId: z.string().max(64).optional(),
  }).strict(),
  'studio.containers.changeStack': z.object({ stackId, spec: stackSpecSchema, aasxFiles: z.array(fileHandleSchema).max(20).optional() }).strict(),
  'studio.containers.startStack': z.object({ stackId }).strict(),
  'studio.containers.stopStack': z.object({ stackId }).strict(),
  'studio.containers.updateStack': z.object({ stackId }).strict(),
  'studio.containers.removeStack': z.object({ stackId, deleteData: z.boolean(), removeInfrastructure: z.boolean() }).strict(),
  'studio.containers.getJob': z.object({ jobId: z.string().min(1).max(64) }).strict(),
  'studio.containers.getLogs': z.object({ stackId, component: stackComponentIdSchema, tail: z.number().int().min(1).max(5000).default(500) }).strict(),
  'studio.containers.saveLogs': z.object({ stackId, component: stackComponentIdSchema, fileHandle: fileHandleSchema }).strict(),
  'studio.containers.getSignIn': z.object({ stackId }).strict(),
  // Studio authorizes the pick; then the host shows the native dialog (ADR 0015).
  'studio.containers.pickFiles': z.object({ kind: z.enum(stackFileKinds), suggestedName: z.string().max(200).optional() }).strict(),
  'studio.containers.exportStack': z.object({ stackId, fileHandle: fileHandleSchema }).strict(),
  'studio.containers.importStack': z.object({ fileHandle: fileHandleSchema }).strict(),
} satisfies Record<MethodName, z.ZodType>

export type AppMethodParams<M extends MethodName> = Methods[M]['params']

export const appMethodNameSchema = z.enum(Object.keys(appMethodParamsSchemas) as [MethodName, ...MethodName[]])

/** A capability call from the host bridge (session) or a backend app (capability token). */
export const appCallInputSchema = z.object({
  /** Required for host calls; implied by the token for backend calls. */
  installationId: z.string().max(64).optional(),
  /** The target the frame is bound to; `null` for a global module outside a target. */
  targetId: z.string().max(200).nullable().optional(),
  /** The shell the frame shows, if any; some infrastructures reach submodels only through it. */
  shellId: z.string().max(4000).nullable().optional(),
  method: appMethodNameSchema,
  params: z.unknown(),
})
export type AppCallInput = z.infer<typeof appCallInputSchema>

export const appCallResultSchema = z.object({
  result: z.unknown(),
})
export type AppCallResult = z.infer<typeof appCallResultSchema>

export { type AppContext, type MethodName as AppMethodName, protocolVersion as appProtocol, methodPermissions } from '@basyx/studio-sdk/protocol'
