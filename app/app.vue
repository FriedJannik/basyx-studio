<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script lang="ts" setup>
  import { useTheme } from 'vuetify'

  // The user's theme preference (Settings); "system" follows the OS. It is
  // applied only after hydration: a theme change while the page hydrates
  // leaves server-rendered parts in the server's theme, because Vue keeps
  // mismatching attributes. Vuetify's color-scheme cookie then lets the next
  // server render start in the same theme.
  const theme = useTheme()
  const preferences = usePreferences()
  onMounted(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const value = preferences.query.data.value?.theme
      if (value) {
        theme.change(value === 'system' ? (dark.matches ? 'dark' : 'light') : value)
      }
    }
    watch(() => preferences.query.data.value?.theme, apply, { immediate: true })
    dark.addEventListener('change', apply)
  })
</script>
