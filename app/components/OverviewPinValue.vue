<template>
  <!-- A value pinned to the Overview (ADR 0032): read on its own, so it shows
       without opening the tree, and re-read while auto-refresh is on. -->
  <v-sheet class="d-flex flex-column h-100 cursor-pointer" color="transparent" @click="emit('select')">
    <ProblemAlert
      v-if="detail.error.value"
      class="ma-2"
      :error="detail.error.value"
      retry
      @retry="detail.refetch()"
    />

    <v-skeleton-loader v-else-if="!detail.data.value" type="heading" />

    <template v-else>
      <div class="px-4 pt-3 text-headline-small font-weight-medium text-truncate" data-test="overview-pin-value">
        {{ value ?? '–' }}
        <span v-if="unit && value !== null" class="text-body-large text-medium-emphasis">{{ unit }}</span>
      </div>

      <ValueSparkline v-if="history.length > 1" class="mt-auto" :values="history" />
    </template>
  </v-sheet>
</template>

<script lang="ts" setup>
  import type { ElementDetail } from '#shared/contract'
  import type { OverviewPin } from '#shared/overview'
  import { useQuery } from '@pinia/colada'
  import { langText } from '~/utils/aas'

  const props = defineProps<{
    targetId: string
    pin: OverviewPin
    /** Seconds between re-reads, or `null` to read once. */
    refreshSeconds: number | null
    at: string | null
    unitOf: (semanticId: string | null | undefined) => string | null
  }>()
  const emit = defineEmits<{ select: [] }>()

  const api = useStudioApi()
  const preferences = usePreferences()
  const historyLength = 30

  // Under the drawer's key prefix, so writes to the element (`['targets', id, 'details']`) refresh it too.
  const detail = useQuery({
    key: () => ['targets', props.targetId, 'details', 'pin', props.pin.submodelKey, props.pin.elementKey, props.at ?? ''],
    query: ({ signal }) => api<ElementDetail>(`/targets/${props.targetId}/submodels/${props.pin.submodelKey}/elements/${props.pin.elementKey}`, {
      query: { at: props.at ?? undefined },
      signal,
    }),
  })

  /** The fields of the pinnable model types (Property, Range, MultiLanguageProperty) this tile reads. */
  interface PinnedElement {
    modelType?: string
    value?: string | null | { language: string, text: string }[]
    min?: string
    max?: string
    semanticId?: { keys?: { value?: string }[] }
  }
  const element = computed(() => (detail.data.value?.value ?? {}) as PinnedElement)
  const value = computed<string | null>(() => {
    const json = element.value
    switch (json.modelType) {
      case 'Property': {
        return typeof json.value === 'string' ? json.value : null
      }
      case 'Range': {
        return json.min === undefined && json.max === undefined ? null : `${json.min ?? '…'} – ${json.max ?? '…'}`
      }
      case 'MultiLanguageProperty': {
        return langText(Array.isArray(json.value) ? json.value : [], preferences.preferences.value.valueLanguage)
      }
      default: {
        return json.modelType ?? null
      }
    }
  })
  const unit = computed(() => props.unitOf(element.value.semanticId?.keys?.[0]?.value))

  // The numeric values read in this session, for the sparkline; Studio stores none.
  const history = ref<number[]>([])
  // A past state (`at`) starts a history of its own.
  watch(() => props.at, () => (history.value = []))
  watch(() => detail.data.value, () => {
    const next = value.value
    const number = Number(next)
    if (next !== null && next !== '' && Number.isFinite(number)) {
      history.value = [...history.value, number].slice(-historyLength)
    }
  })

  // Re-reads while the page is visible, like the tree's refresh.
  let timer: ReturnType<typeof setInterval> | undefined
  watch(() => props.refreshSeconds, seconds => {
    clearInterval(timer)
    if (seconds && import.meta.client) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          void detail.refetch()
        }
      }, seconds * 1000)
    }
  }, { immediate: true })
  onBeforeUnmount(() => clearInterval(timer))
</script>
