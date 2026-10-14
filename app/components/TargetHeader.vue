<template>
  <div class="d-flex flex-wrap align-center ga-4 mb-4">
    <v-breadcrumbs :items="crumbs" />
    <v-spacer />
    <TargetStatus v-if="target" :target="target" />
  </div>
</template>

<script lang="ts" setup>
  import type { Target } from '#shared/contract'

  const props = defineProps<{
    target: Target | undefined
    trail?: Array<{ title: string, to?: string }>
  }>()

  const { t } = useI18n()

  const crumbs = computed(() => [
    { title: t('home.title'), to: '/' },
    ...(props.target ? [{ title: props.target.name, to: `/targets/${props.target.id}`, exact: true }] : []),
    ...(props.trail ?? []),
  ])
</script>
