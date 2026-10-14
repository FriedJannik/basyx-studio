<template>
  <v-card>
    <v-card-item>
      <template #prepend>
        <v-avatar color="primary" variant="tonal">
          <v-icon icon="mdi-timeline-clock-outline" />
        </v-avatar>
      </template>

      <v-card-title>{{ t('changes.title') }}</v-card-title>
      <v-card-subtitle class="text-wrap">{{ t('changes.subtitle') }}</v-card-subtitle>
    </v-card-item>

    <v-divider />

    <v-card-text>
      <ProblemAlert v-if="changes.error.value" :error="changes.error.value" retry @retry="changes.refetch()" />
      <v-skeleton-loader v-else-if="changes.isPending.value" type="list-item-two-line@4" />

      <v-timeline
        v-else-if="items.length > 0"
        align="start"
        density="compact"
        side="end"
        truncate-line="both"
      >
        <v-timeline-item
          v-for="group in groups"
          :key="group.event.id"
          :dot-color="changeMeta[group.event.action].color"
          :icon="changeMeta[group.event.action].icon"
          size="small"
        >
          <!-- A link within this page, never shown as the active one. -->
          <v-list-item
            :active="false"
            class="px-0"
            :to="group.event.entity === 'submodel' && refKeys[group.event.subject] ? { query: { ...route.query, tab: undefined, submodel: refKeys[group.event.subject], element: undefined } } : undefined"
          >
            <v-list-item-title class="text-wrap">
              {{ t(`changes.${group.event.entity}.${group.event.action}`, { name: labels[group.event.subject] ?? group.event.subject }) }}
              <v-chip v-if="group.count > 1" class="ms-1" size="x-small" :text="t('changes.times', group.count)" />
            </v-list-item-title>

            <v-list-item-subtitle>
              <span v-tooltip="new Date(group.event.time).toLocaleString(locale)">{{ timeAgo(group.event.time) }}</span>
              <template v-if="group.count > 1"> · {{ t('changes.since', { time: timeAgo(group.oldest) }) }}</template>
            </v-list-item-subtitle>
          </v-list-item>
        </v-timeline-item>
      </v-timeline>

      <v-empty-state
        v-else
        icon="mdi-timeline-remove-outline"
        size="56"
        :text="t('changes.noneText')"
        :title="t('changes.none')"
      />

      <p v-if="items.length > 0" class="text-body-small text-medium-emphasis mt-2 mb-0">{{ t('changes.feedLimits') }}</p>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  import type { ChangeEvent, ChangePage, SubmodelRef } from '#shared/contract'
  import { useQuery } from '@pinia/colada'
  import { changeMeta } from '~/utils/aas'

  const props = defineProps<{ targetId: string, shellId: string, shellLabel: string, refs: SubmodelRef[] }>()

  const { t, locale } = useI18n()
  const route = useRoute()
  const api = useStudioApi()
  const timeAgo = useTimeAgo()

  const subjects = computed(() => [props.shellId, ...props.refs.map(ref => ref.submodelId)])
  const labels = computed<Record<string, string>>(() => ({
    [props.shellId]: props.shellLabel,
    ...Object.fromEntries(props.refs.map(ref => [ref.submodelId, ref.idShort ?? ref.submodelId])),
  }))
  const refKeys = computed<Record<string, string>>(() => Object.fromEntries(props.refs.filter(ref => ref.status === 'available').map(ref => [ref.submodelId, ref.key])))

  const changes = useQuery({
    key: () => ['targets', props.targetId, 'changes', ...subjects.value],
    query: ({ signal }) => api<ChangePage>(`/targets/${props.targetId}/changes`, { query: { subjects: subjects.value, limit: 50 }, signal }),
    refetchOnWindowFocus: true,
  })
  const items = computed(() => changes.data.value?.items ?? [])

  // Runs of the same change of the same resource (newest first) as one row,
  // e.g. a value that a device writes every second.
  const groups = computed(() => {
    const result: Array<{ event: ChangeEvent, count: number, oldest: string }> = []
    for (const event of items.value) {
      const last = result.at(-1)
      if (last && last.event.subject === event.subject && last.event.action === event.action && last.event.entity === event.entity) {
        last.count++
        last.oldest = event.time
      } else {
        result.push({ event, count: 1, oldest: event.time })
      }
    }
    return result
  })
</script>
