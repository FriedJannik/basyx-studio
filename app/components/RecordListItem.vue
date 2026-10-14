<template>
  <!-- A row of a record list, as in GitHub's notifications: its actions
       replace the meta information while the row is hovered or focused;
       devices without hover show both. Phones show the meta information
       below the title, where it does not squeeze it. -->
  <v-list-item
    :tabindex="interactive ? undefined : 0"
    @focusin="focused = true"
    @focusout="onFocusOut"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <!-- The same neutral icon tile in every record list. -->
    <template v-if="icon" #prepend>
      <v-avatar class="me-3" size="36" variant="tonal">
        <v-icon :icon="icon" size="20" />
      </v-avatar>
    </template>

    <template v-if="$slots.title" #title>
      <slot name="title" />
    </template>

    <template v-if="$slots.subtitle" #subtitle>
      <slot name="subtitle" />
    </template>

    <slot />

    <div v-if="!smAndUp && $slots.meta" class="d-flex flex-wrap align-center ga-1 mt-1">
      <slot name="meta" />
    </div>

    <template #append>
      <div class="d-flex align-center ga-1 ms-2">
        <slot v-if="smAndUp && (!revealed || touch)" name="meta" />
        <slot v-if="revealed" name="actions" />
      </div>
    </template>
  </v-list-item>
</template>

<script lang="ts" setup>
  import { useDisplay } from 'vuetify'

  defineProps<{ icon?: string }>()
  defineSlots<{
    title?: () => unknown
    subtitle?: () => unknown
    default?: () => unknown
    meta?: () => unknown
    actions?: () => unknown
  }>()

  const attrs = useAttrs()
  const { smAndUp } = useDisplay()
  const hovered = ref(false)
  const focused = ref(false)
  const touch = ref(false)
  onMounted(() => (touch.value = window.matchMedia('(hover: none)').matches))

  const revealed = computed(() => hovered.value || focused.value || touch.value)
  // Rows without a link or click handler take focus themselves, so keyboard
  // users reach the actions as well.
  const interactive = computed(() => Boolean(attrs.to || attrs.href || attrs.onClick || attrs.link))

  function onFocusOut (event: FocusEvent) {
    const row = event.currentTarget as HTMLElement
    focused.value = row.contains(event.relatedTarget as Node | null)
  }
</script>
