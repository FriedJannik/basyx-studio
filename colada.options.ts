import type { PiniaColadaOptions } from '@pinia/colada'

// Pinia Colada options, read by @pinia/colada-nuxt.
export default {
  queryOptions: {
    // A query that fails while the server renders keeps its error for the
    // page (ProblemAlert, retry) instead of failing the whole page with a
    // 500, e.g. for a deleted target or an unreachable infrastructure.
    ssrCatchError: true,
  },
} satisfies PiniaColadaOptions
