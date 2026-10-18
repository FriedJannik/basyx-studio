<template>
  <!-- The card of every dialog, as in the BaSyx AAS Web UI: a tinted header (v-card-header)
       with the title only, and dividers that set the header, the body and the
       actions apart. Every dialog closes the same way, from its actions:
       further actions on the left (`actions-start`, v-btn-secondary), cancel
       or close and the main action on the right (`actions`). -->
  <!-- On phones every dialog is full screen (app.vue): edge to edge then, as v-card-fullscreen. -->
  <v-card :border="xs ? false : undefined" :rounded="xs ? 0 : undefined">
    <v-card-header class="flex-shrink-0">
      <v-card-title>{{ title }}</v-card-title>
    </v-card-header>

    <v-divider />

    <!-- The same 16 px on every side. -->
    <v-card-text :class="flush ? 'pa-0' : 'pa-4'">
      <slot />
    </v-card-text>

    <template v-if="$slots.actions || $slots['actions-start']">
      <v-divider />

      <!-- Vuetify's 8 px on every side around the buttons. -->
      <v-card-actions>
        <slot name="actions-start" />
        <v-spacer />
        <slot name="actions" />
      </v-card-actions>
    </template>
  </v-card>
</template>

<script lang="ts" setup>
  import { useDisplay } from 'vuetify'

  defineProps<{
    title: string
    /** The body without padding, e.g. for a list or an editor. */
    flush?: boolean
  }>()
  defineSlots<{
    'default'?: () => unknown
    'actions'?: () => unknown
    'actions-start'?: () => unknown
  }>()

  const { xs } = useDisplay()
</script>
