import type { Preferences } from '#shared/contract'
import type { StudioDeps } from './deps'
import { eq } from 'drizzle-orm'
import { defaultPreferences, preferencesSchema } from '#shared/contract'
import { userPreferences } from '../database/schema'
import { StudioProblem } from './problem'

/** The user's preferences; stored values that no longer validate fall back to the defaults. */
export async function getPreferences (deps: Pick<StudioDeps, 'db'>, subject: string): Promise<Preferences> {
  const [row] = await deps.db.select().from(userPreferences).where(eq(userPreferences.subject, subject))
  const parsed = preferencesSchema.safeParse(row?.preferences ?? {})
  return parsed.success ? parsed.data : defaultPreferences
}

/** Replaces the user's preferences. */
export async function savePreferences (deps: Pick<StudioDeps, 'db'>, subject: string, raw: unknown): Promise<Preferences> {
  const parsed = preferencesSchema.safeParse(raw)
  if (!parsed.success) {
    throw new StudioProblem('invalid_request', 'The preferences are invalid.', {
      violations: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
    })
  }
  const preferences = parsed.data
  await deps.db.insert(userPreferences)
    .values({ subject, preferences })
    .onConflictDoUpdate({ target: userPreferences.subject, set: { preferences, updatedAt: new Date() } })
  return preferences
}
