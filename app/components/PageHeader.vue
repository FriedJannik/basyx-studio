<template>
  <!-- Heading and subtitle of a page, close together: Vuetify 4 no longer
       resets the browser margins of headings and paragraphs. -->
  <div class="d-flex flex-wrap align-center ga-3 mb-4">
    <div class="flex-grow-1">
      <h1 class="text-headline-small font-weight-semibold my-0">{{ title }}</h1>
      <p v-if="subtitle" class="text-body-medium text-medium-emphasis mb-0 mt-1">{{ subtitle }}</p>
    </div>

    <div v-if="$slots.actions" class="d-flex flex-wrap ga-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  defineProps<{
    title: string
    subtitle?: string | null
  }>()
  defineSlots<{ actions?: () => unknown }>()
</script>
