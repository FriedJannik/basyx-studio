import { z } from 'zod'

export const deploymentModeSchema = z.enum(['hosted', 'desktop'])
export type DeploymentMode = z.infer<typeof deploymentModeSchema>

export const studioContextSchema = z.object({
  apiVersion: z.literal('1'),
  deploymentMode: deploymentModeSchema,
  /** Whether users must sign in to Studio (hosted) or are the local OS user (desktop). */
  loginRequired: z.boolean(),
  /** Hosted without login: everyone is the shared anonymous user (STUDIO_AUTH_MODE=none). */
  anonymous: z.boolean(),
  /** Whether administrators may add, change and remove infrastructures (STUDIO_INFRASTRUCTURES_EDITABLE). */
  infrastructuresEditable: z.boolean(),
  product: z.object({ name: z.string(), version: z.string(), commit: z.string().nullable(), buildDate: z.string().nullable() }),
  /**
   * The deployment's logos (an absolute URL, or a Studio path under the base
   * path) and default accent; `null` keeps the BaSyx ones.
   */
  branding: z.object({
    logoLight: z.string().nullable(),
    logoDark: z.string().nullable(),
    accentLight: z.string().nullable(),
    accentDark: z.string().nullable(),
  }),
  legal: z.object({ copyrightName: z.string().nullable(), legalNoticeUrl: z.string().nullable(), privacyPolicyUrl: z.string().nullable() }),
  /** Deployment-wide switches; they only ever narrow what roles allow. */
  features: z.object({ readOnly: z.boolean(), uploads: z.boolean(), appInstalls: z.boolean() }),
})
export type StudioContext = z.infer<typeof studioContextSchema>

export const studioSessionSchema = z.object({
  user: z.object({
    subject: z.string(),
    name: z.string(),
    roles: z.array(z.string()),
  }),
  isAdmin: z.boolean(),
  csrfToken: z.string(),
  expiresAt: z.string().nullable(),
})
export type StudioSession = z.infer<typeof studioSessionSchema>

/** Relative in-app path only; prevents open redirects after login. */
export const returnToSchema = z
  .string()
  .max(2000)
  .regex(/^\/(?![/\\])/, 'must be an absolute path within Studio')

export const loginRequestSchema = z.object({
  returnTo: returnToSchema.optional(),
})

export const authorizationStartSchema = z.object({
  authorizationUrl: z.string(),
  /** `navigate`: redirect this window; `external`: open in the system browser and poll. */
  mode: z.enum(['navigate', 'external']),
})
export type AuthorizationStart = z.infer<typeof authorizationStartSchema>

export const logoutResultSchema = z.object({
  logoutUrl: z.string().nullable(),
})
export type LogoutResult = z.infer<typeof logoutResultSchema>
