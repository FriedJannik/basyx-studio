<template>
  <CodeView :file-name="fileName" :label="label" language="json" :model-value="text" />
</template>

<script lang="ts" setup>
  // JSON of a shell, submodel or element, in a read-only code view with find.
  const props = defineProps<{ value: unknown, label: string, fileName?: string }>()

  const text = computed(() => JSON.stringify(props.value, null, 2))
</script>
