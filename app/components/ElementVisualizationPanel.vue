<template>
  <div class="d-flex flex-column h-100">
    <v-tabs
      v-if="tabs.length > 1"
      v-model="selected"
      class="flex-shrink-0"
      density="compact"
      show-arrows
    >
      <v-tab
        v-for="tab in tabs"
        :key="tab.id"
        :prepend-icon="tab.icon"
        :text="tab.title"
        :value="tab.id"
      />
    </v-tabs>

    <template v-if="activeBuiltIn">
      <ModelView
        v-if="activeBuiltIn.id === model3dViewId && model3d"
        :key="`${target.id}:${model3d.submodelKey}:${model3d.elementKey}`"
        :element="model3d.element"
        :element-key="model3d.elementKey"
        :format="model3d.format"
        :submodel-key="model3d.submodelKey"
        :target-id="target.id"
      />
    </template>

    <template v-else-if="active">
      <div class="d-flex align-center ga-2 px-4 py-2 text-body-small text-medium-emphasis">
        <span class="text-truncate">{{ t('overview.reason', { app: label(active.appTitle), submodel: submodelLabel }) }}</span>
        <v-chip v-if="active.unsigned" color="warning" size="x-small" :text="t('apps.unsigned')" />
      </div>

      <AppFrame
        :key="`${target.id}:${submodel.id}:${viewIdOf(active)}`"
        :contribution="active"
        :shell-id="shellId"
        :submodel="submodel"
        :target="target"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
  import type { SubmodelViewContributionInfo, Target } from '#shared/contract'
  import type { ModelFormat } from '@basyx/model-viewer'
  import type { BuiltInView } from '~/utils/visualizations'
  import { model3dViewId } from '~/utils/visualizations'

  // The selection's views, one at a time: Studio's own (the 3D view of a
  // File element) first, then the app views of its submodel (MVP-4 plan, T2).
  // The chosen view is in the URL as `view` (as in MVP-3).
  const props = defineProps<{
    target: Target
    shellId: string
    submodel: { id: string, semanticId: string | null }
    submodelLabel: string
    views: SubmodelViewContributionInfo[]
    builtIns: BuiltInView[]
    /** The File element the 3D view shows. */
    model3d: { submodelKey: string, elementKey: string, element: Record<string, unknown>, format: ModelFormat } | null
  }>()
  const view = defineModel<string | null>('view', { required: true })

  const { t } = useI18n()
  const label = useLocalizedLabel()

  const viewIdOf = (item: SubmodelViewContributionInfo) => `${item.installationId}:${item.id}`
  const tabs = computed(() => [
    ...props.builtIns,
    ...props.views.map(item => ({ id: viewIdOf(item), title: label(item.title), icon: undefined })),
  ])
  const activeId = computed(() => tabs.value.find(tab => tab.id === view.value)?.id ?? tabs.value[0]?.id ?? null)
  const activeBuiltIn = computed(() => props.builtIns.find(item => item.id === activeId.value) ?? null)
  const active = computed(() => props.views.find(item => viewIdOf(item) === activeId.value) ?? null)
  const selected = computed({
    get: () => activeId.value,
    set: (id: string | null) => (view.value = id),
  })
</script>
