<template>
  <!-- The recent numeric values of an element, in the theme's colours. -->
  <v-sparkline
    :gradient="gradient"
    height="56"
    line-width="3"
    :model-value="values"
    padding="8"
    smooth="10"
  />
</template>

<script lang="ts" setup>
  import { useTheme } from 'vuetify'

  defineProps<{ values: number[] }>()

  const theme = useTheme()
  const gradient = computed(() => {
    const colors = theme.current.value.colors
    return [String(colors.secondary), String(colors.primary)]
  })
</script>
