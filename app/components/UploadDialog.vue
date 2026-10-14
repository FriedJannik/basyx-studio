<template>
  <v-dialog v-model="open" max-width="520">
    <DialogCard :title="t('upload.title')">
      <p class="text-body-medium text-medium-emphasis mt-0 mb-3">{{ t('upload.into', { name: target.name }) }}</p>

      <v-file-upload
        v-model="file"
        accept=".aasx,.json,.xml"
        :browse-text="t('upload.browse')"
        clearable
        density="comfortable"
        :divider-text="t('upload.or')"
        :title="t('upload.drop')"
      />

      <div class="text-body-small text-medium-emphasis mt-2">{{ t('upload.hint') }}</div>
      <ProblemAlert v-if="error" class="mt-4" :error="error" />
      <v-alert v-if="added" class="mt-4" :text="t('upload.added', added.length)" type="success" />
      <SyncReport class="mt-4" :steps="syncSteps" />

      <template #actions>
        <v-btn :text="t('common.close')" @click="open = false" />
        <v-btn-primary :disabled="!file" :loading="uploading" :text="t('upload.upload')" @click="upload" />
      </template>
    </DialogCard>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { ShellSummary, SyncStep, Target, UploadResult } from '#shared/contract'

  const props = defineProps<{ target: Target }>()
  const emit = defineEmits<{ uploaded: [shells: ShellSummary[]] }>()
  const open = defineModel<boolean>({ required: true })

  const { t } = useI18n()
  const api = useStudioApi()
  const invalidate = useInvalidate()

  const file = shallowRef<File | File[] | undefined>()
  const uploading = ref(false)
  const error = ref<unknown>(null)
  const added = ref<ShellSummary[] | null>(null)
  const syncSteps = ref<SyncStep[]>([])

  watch(open, isOpen => {
    if (isOpen) {
      file.value = undefined
      error.value = null
      added.value = null
      syncSteps.value = []
    }
  })

  async function upload () {
    const chosen = Array.isArray(file.value) ? file.value[0] : file.value
    if (!chosen) {
      return
    }
    uploading.value = true
    error.value = null
    try {
      const result = await api<UploadResult>(`/targets/${props.target.id}/uploads`, {
        method: 'POST',
        query: { fileName: chosen.name },
        headers: { 'Content-Type': chosen.type || 'application/octet-stream' },
        body: chosen,
      })
      added.value = result.shells
      syncSteps.value = result.sync
      file.value = undefined
      await invalidate(['targets', props.target.id, 'shells'])
      emit('uploaded', result.shells)
    } catch (error_) {
      error.value = error_
    } finally {
      uploading.value = false
    }
  }
</script>
