<template>
  <v-row>
    <v-col
      v-for="view in views"
      :key="`${view.submodel.key}:${view.contribution.installationId}:${view.contribution.id}`"
      cols="12"
      lg="6"
    >
      <div class="d-flex align-center ga-2 mb-1 px-1 text-body-small text-medium-emphasis">
        <span class="text-truncate">{{ t('overview.reason', { app: label(view.contribution.appTitle), submodel: view.submodel.idShort ?? view.submodel.submodelId }) }}</span>
        <v-chip v-if="view.contribution.unsigned" color="warning" size="x-small" :text="t('apps.unsigned')" />
        <v-tooltip activator="parent" :text="t('apps.matchReason', { semanticId: view.contribution.reason.semanticId })" />
      </div>

      <AppFrame
        :contribution="view.contribution"
        fit
        :shell-id="shellId"
        :submodel="{ id: view.submodel.submodelId, semanticId: view.submodel.semanticId }"
        :target="target"
      />
    </v-col>

    <v-col v-if="contributions.isPending.value" cols="12">
      <v-skeleton-loader type="card" />
    </v-col>

    <v-col v-else-if="views.length === 0" cols="12">
      <v-empty-state
        icon="mdi-puzzle-outline"
        size="64"
        :text="t('overview.noneText')"
        :title="t('overview.none')"
      />
    </v-col>
  </v-row>
</template>

<script lang="ts" setup>
  import type { SubmodelRef, SubmodelViewContributionInfo, Target } from '#shared/contract'

  // The views of installed apps (plan D3, D14) for every submodel of the
  // shell, one card each. Each runs in its own sandboxed frame.
  const props = defineProps<{ target: Target, shellId: string, refs: SubmodelRef[] }>()

  const { t } = useI18n()
  const label = useLocalizedLabel()

  const available = computed(() => props.refs.filter(ref => ref.status === 'available' && ref.semanticId))
  const contributions = useAppContributions(() => available.value.map(ref => ref.semanticId!))

  // Every matching view; the apps shipped with Studio come first.
  const views = computed(() => available.value.flatMap(submodel => (contributions.data.value?.submodelViews ?? [])
    .filter(view => view.reason.semanticId === submodel.semanticId)
    .toSorted((a, b) => Number(b.bundled) - Number(a.bundled))
    .map(contribution => ({ submodel, contribution }) satisfies { submodel: SubmodelRef, contribution: SubmodelViewContributionInfo })))
</script>
