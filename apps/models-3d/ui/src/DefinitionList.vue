<template>
  <v-table class="bg-transparent" density="compact">
    <tbody>
      <tr v-for="entry in rows" :key="`${entry.label}:${entry.value}`">
        <td class="text-medium-emphasis text-no-wrap align-top py-1">
          <v-icon v-if="entry.icon" class="me-2" :icon="entry.icon" size="16" />
          {{ entry.label }}
        </td>

        <td class="text-break align-top py-1">
          <!-- The frame cannot open links itself; Studio opens them in the browser. -->
          <v-btn
            v-if="entry.url"
            append-icon="mdi-open-in-new"
            class="px-0"
            size="small"
            :text="entry.value"
            @click="emit('open', entry.url)"
          />

          <template v-else>{{ entry.value }}</template>
        </td>
      </tr>
    </tbody>
  </v-table>
</template>

<script lang="ts" setup>
  import type { DetailRow } from './presentation'

  // Label and value rows; the Web UI's definition list as a Vuetify table.
  defineProps<{ rows: DetailRow[] }>()
  const emit = defineEmits<{ open: [url: string] }>()
</script>
