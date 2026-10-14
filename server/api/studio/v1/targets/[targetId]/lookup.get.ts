import type { ShellSummary } from '#shared/contract'
import { defineStudioHandler, queryValidated } from '~~/server/utils/handler'
import { openTarget } from '~~/server/utils/target'
import { lookupQuerySchema } from '#shared/contract'

/** Shells of an asset, found by its global asset ID: through discovery where there is one, else by query. */
export default defineStudioHandler(async (event): Promise<{ items: ShellSummary[] }> => {
  const { assetId } = queryValidated(event, lookupQuerySchema)
  const { target } = await openTarget(event)
  return { items: await target.lookupShells(assetId) }
})
