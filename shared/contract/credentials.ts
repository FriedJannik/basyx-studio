import { z } from 'zod'

// Secret material of infrastructures and their connections (ADR 0020,
// ADR 0040). The API takes secrets in and answers with summaries only.

/** OAuth scopes (RFC 6749, section 3.3). */
export const scopesSchema = z.array(z.string().regex(/^[\u0021\u0023-\u005B\u005D-\u007E]+$/, 'invalid scope')).max(20)

/** A reference to deployment-provided secret material. */
export const secretRefSchema = z.string().regex(/^(?:env:[A-Z_][A-Z0-9_]*|file:\/\S+)$/, 'use env:NAME or file:/absolute/path')

/**
 * A secret is either a reference to deployment-provided secret material
 * (`env:NAME`, `file:/path`; hosted) or a value that the desktop Studio stores
 * encrypted with a key held in the OS credential store.
 */
export const secretInputSchema = z.union([
  z.object({ ref: secretRefSchema }),
  z.object({ value: z.string().min(1).max(4096) }),
])
export type SecretInput = z.infer<typeof secretInputSchema>

export const secretSummarySchema = z.object({
  kind: z.enum(['env', 'file', 'stored']),
  /** The reference for env/file secrets; never the secret value. */
  ref: z.string().nullable(),
})
export type SecretSummary = z.infer<typeof secretSummarySchema>
