<template>
  <v-avatar :color="shell.assetKind === 'Type' ? 'warning' : 'primary'" :size="size" variant="tonal">
    <v-img
      v-if="showImage"
      :alt="shell.idShort ?? ''"
      cover
      :referrerpolicy="shell.thumbnailUrl ? 'no-referrer' : undefined"
      :src="shell.thumbnailUrl ?? `${apiBasePath}/targets/${targetId}/shells/${shell.key}/thumbnail`"
      @error="failed = true"
    />

    <v-icon v-else :icon="shell.assetKind === 'Type' ? 'mdi-shape-outline' : '$aas'" :size="iconSize" />
  </v-avatar>
</template>

<script lang="ts" setup>
  import type { ShellSummary } from '#shared/contract'
  import { apiBasePath } from '#shared/contract'

  const props = defineProps<{
    shell: Pick<ShellSummary, 'key' | 'idShort' | 'assetKind' | 'thumbnail'> & { thumbnailUrl?: string | null }
    targetId: string
    size: string | number
    /** Whether the target serves thumbnails (`files` capability). */
    thumbnails: boolean
    iconSize?: string | number
  }>()

  // An external thumbnail loads from its own address, as BaSyx Go answers it
  // with a redirect that Studio does not follow (no referrer is sent).
  // The image is requested only for shells that name a thumbnail, and only
  // after mounting: an image that loads or fails while the page hydrates
  // would report it before Vuetify listens, and the avatar would stay empty.
  const mounted = ref(false)
  const failed = ref(false)
  onMounted(() => (mounted.value = true))
  watch(() => props.shell.key, () => (failed.value = false))
  const showImage = computed(() => mounted.value && (props.thumbnails || Boolean(props.shell.thumbnailUrl)) && props.shell.thumbnail && !failed.value)
</script>
