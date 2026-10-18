import { getQuery } from 'nuxt/server'
import { exportInfrastructures } from '~~/server/lib/infrastructures'
import { requireAdmin } from '~~/server/utils/auth'
import { defineStudioHandler } from '~~/server/utils/handler'
import { useStudio } from '~~/server/utils/studio'

/**
 * The infrastructures in the file format (YAML): all, or `?ids=a,b`.
 * `?download` saves it as a file instead of showing it.
 */
export default defineStudioHandler(async (event): Promise<string> => {
  await requireAdmin(event)
  const studio = await useStudio()
  const query = getQuery(event)
  const ids = typeof query.ids === 'string' ? query.ids.split(',').filter(Boolean) : undefined
  const yaml = await exportInfrastructures(studio, ids)
  event.res.headers.set('Content-Type', 'application/yaml; charset=utf-8')
  if (query.download !== undefined) {
    event.res.headers.set('Content-Disposition', 'attachment; filename="infrastructures.yaml"')
  }
  return yaml
})
