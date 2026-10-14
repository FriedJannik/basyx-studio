<template>
  <!-- Plain chips, not a chip group: a group makes them selectable. Neutral
       when available, outlined and dimmed when not. -->
  <div class="d-flex flex-wrap ga-2">
    <v-chip
      v-for="feature in features"
      :key="feature.key"
      v-tooltip="t(`capabilities.${feature.key}Hint`)"
      :class="feature.on ? undefined : 'text-disabled'"
      :prepend-icon="feature.on ? feature.icon : 'mdi-minus-circle-outline'"
      :text="t(`capabilities.${feature.key}`)"
      :variant="feature.on ? 'tonal' : 'outlined'"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { TargetCapabilities } from '#shared/contract'

  const props = defineProps<{ capabilities: TargetCapabilities }>()
  const { t } = useI18n()

  // The optional features users notice; basic browsing is always there.
  const features = computed(() => {
    const c = props.capabilities
    return [
      { key: 'export', icon: 'mdi-download', on: c.export },
      { key: 'upload', icon: 'mdi-upload', on: c.upload },
      { key: 'search', icon: 'mdi-database-search-outline', on: c.search !== 'filter' },
      { key: 'elementSearch', icon: 'mdi-text-search', on: c.elementSearch },
      { key: 'discovery', icon: 'mdi-barcode-scan', on: c.discovery },
      { key: 'history', icon: 'mdi-history', on: c.history },
      { key: 'changeFeed', icon: 'mdi-timeline-clock-outline', on: c.changeFeed },
      { key: 'sharing', icon: 'mdi-account-multiple-plus-outline', on: c.sharing },
    ]
  })
</script>
