<template>
  <v-img
    v-if="url && !failed"
    :alt="alt"
    class="h-100 w-100"
    :cover="!contain"
    :src="url"
    @error="failed = true"
  />

  <div v-else class="d-flex align-center justify-center h-100 w-100 text-medium-emphasis">
    <v-icon icon="mdi-cube-outline" :size="iconSize" />
  </div>
</template>

<script lang="ts" setup>
  import type { FileRef } from './models3d'
  import type { StudioClient } from '@basyx/studio-sdk'
  import { onBeforeUnmount, ref, watch } from 'vue'

  // A version's preview image (PNG, JPG or BMP, IDTA 02026), read through
  // Studio and shown from a blob: URL; the cube icon where there is none.
  const props = withDefaults(defineProps<{
    client: StudioClient
    submodelId: string
    file: FileRef | null
    alt?: string
    contain?: boolean
    iconSize?: string | number
  }>(), { alt: '', contain: false, iconSize: 'large' })

  const url = ref('')
  const failed = ref(false)

  function release () {
    if (url.value) {
      URL.revokeObjectURL(url.value)
    }
    url.value = ''
  }

  watch(() => props.file?.path, async () => {
    release()
    failed.value = false
    const file = props.file
    if (!file) {
      return
    }
    try {
      const content = await props.client.ui.readFile(props.submodelId, file.path)
      if (file === props.file) {
        url.value = URL.createObjectURL(new Blob([content.bytes as BlobPart], { type: content.contentType || file.contentType }))
      }
    } catch {
      failed.value = true
    }
  }, { immediate: true })

  onBeforeUnmount(release)
</script>
