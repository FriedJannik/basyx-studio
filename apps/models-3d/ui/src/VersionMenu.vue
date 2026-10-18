<template>
  <v-menu v-if="versions.length > 1">
    <template #activator="{ props: activator }">
      <v-btn
        v-bind="activator"
        append-icon="mdi-chevron-down"
        data-test="version-menu"
        prepend-icon="mdi-source-branch"
        size="small"
        :text="label(selected)"
        variant="tonal"
      />
    </template>

    <v-list density="compact" min-width="240">
      <v-list-item
        v-for="entry in sorted"
        :key="entry.version.key"
        :active="entry.version.key === selected?.key"
        :subtitle="entry.version.setDate || undefined"
        :title="label(entry.version)"
        @click="emit('select', entry.version.key)"
      >
        <template #append>
          <v-chip
            v-if="entry.version.key === latestKey"
            class="me-1"
            color="primary"
            size="x-small"
            :text="t('model.latest')"
          />

          <v-chip v-if="entry.version.status" size="x-small" :text="listValue(t, 'status', entry.version.status)" />
        </template>
      </v-list-item>
    </v-list>
  </v-menu>

  <v-chip v-else-if="selected" prepend-icon="mdi-source-branch" :text="label(selected)" />
</template>

<script lang="ts" setup>
  import type { Model3DVersion } from './models3d'
  import { computed } from 'vue'
  import { useI18n } from './i18n'
  import { latestVersion } from './models3d'
  import { listValue, versionLabel } from './presentation'

  // The model's file versions, newest first; one version is a chip.
  const props = defineProps<{
    versions: Model3DVersion[]
    selected: Model3DVersion | undefined
  }>()
  const emit = defineEmits<{ select: [key: string] }>()

  const { t } = useI18n()

  const latestKey = computed(() => latestVersion(props.versions)?.key)
  /** Newest first; equal dates keep the listed order, last first. */
  const sorted = computed(() => props.versions
    .map((version, index) => ({ version, index }))
    .toSorted((a, b) => b.version.setDate.localeCompare(a.version.setDate) || b.index - a.index))

  function label (version: Model3DVersion | undefined): string {
    return version ? versionLabel(t, version, props.versions.indexOf(version)) : ''
  }
</script>
