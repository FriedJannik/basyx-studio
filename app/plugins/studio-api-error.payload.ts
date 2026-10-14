import type { Problem } from '#shared/contract'
import { StudioApiError } from '~/composables/useStudioApi'

// A query that fails while the server renders keeps its error
// (colada.options.ts: ssrCatchError); it crosses to the browser as its
// problem and becomes a StudioApiError again, so ProblemAlert shows it.
export default definePayloadPlugin(() => {
  definePayloadReducer('StudioApiError', (value: unknown) => value instanceof StudioApiError && { problem: value.problem })
  definePayloadReviver('StudioApiError', (data: { problem: Problem | null }) => new StudioApiError(data.problem))
})
