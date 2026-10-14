<template>
  <div class="d-flex flex-column h-100">
    <v-tabs v-if="views.length > 1" v-model="selected" density="compact" show-arrows>
      <v-tab v-for="entry in views" :key="viewIdOf(entry)" :text="label(entry.title)" :value="viewIdOf(entry)" />
    </v-tabs>

    <div v-if="active" class="d-flex align-center ga-2 px-4 py-2 text-body-small text-medium-emphasis">
      <span class="text-truncate">{{ t('overview.reason', { app: label(active.appTitle), submodel: submodelLabel }) }}</span>
      <v-chip v-if="active.unsigned" color="warning" size="x-small" :text="t('apps.unsigned')" />
    </div>

    <AppFrame
      v-if="active"
      :key="`${target.id}:${submodel.id}:${viewIdOf(active)}`"
      :contribution="active"
      :shell-id="shellId"
      :submodel="submodel"
      :target="target"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { SubmodelViewContributionInfo, Target } from '#shared/contract'

  // The selected submodel's app views (MVP-4 plan, T2), one at a time; the
  // chosen view is in the URL as `view` (as in MVP-3).
  const props = defineProps<{
    target: Target
    shellId: string
    submodel: { id: string, semanticId: string | null }
    submodelLabel: string
    views: SubmodelViewContributionInfo[]
  }>()
  const view = defineModel<string | null>('view', { required: true })

  const { t } = useI18n()
  const label = useLocalizedLabel()

  const viewIdOf = (item: SubmodelViewContributionInfo) => `${item.installationId}:${item.id}`
  const active = computed(() => props.views.find(item => viewIdOf(item) === view.value) ?? props.views[0] ?? null)
  const selected = computed({
    get: () => (active.value ? viewIdOf(active.value) : null),
    set: (id: string | null) => (view.value = id),
  })
</script>
