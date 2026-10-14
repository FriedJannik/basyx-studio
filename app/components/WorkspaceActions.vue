<template>
  <div class="d-flex flex-wrap align-center ga-2">
    <!-- The package's state next to its actions (UX-005). -->
    <v-chip
      :color="target.workspace?.unsavedChanges ? 'warning' : 'success'"
      :prepend-icon="target.workspace?.unsavedChanges ? 'mdi-content-save-alert-outline' : 'mdi-content-save-check-outline'"
      :text="t(target.workspace?.unsavedChanges ? 'workspace.unsaved' : 'workspace.saved')"
    />

    <v-btn-primary
      :disabled="!target.workspace?.unsavedChanges || busy !== null"
      :loading="busy === 'save'"
      prepend-icon="mdi-content-save-outline"
      size="small"
      :text="t('workspace.save')"
      @click="save"
    />

    <v-btn
      v-if="bridge"
      :disabled="busy !== null"
      :loading="busy === 'saveAs'"
      prepend-icon="mdi-content-save-edit-outline"
      size="small"
      :text="t('workspace.saveAs')"
      @click="saveAs"
    />

    <v-btn
      :disabled="busy !== null"
      :loading="busy === 'close'"
      prepend-icon="mdi-close"
      size="small"
      :text="t('workspace.close')"
      @click="close(false)"
    />

    <v-dialog v-model="confirmClose" max-width="480">
      <DialogCard :title="t('workspace.closeTitle', { name: target.name })">
        {{ t('workspace.closeText') }}

        <template #actions>
          <v-btn :text="t('workspace.cancel')" @click="confirmClose = false" />
          <v-btn-primary color="error" :text="t('workspace.closeWithoutSaving')" @click="close(true)" />
        </template>
      </DialogCard>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
  import type { Target } from '#shared/contract'
  import type { DesktopBridge } from '~/composables/useDesktopBridge'
  import { useQueryCache } from '@pinia/colada'
  import { StudioApiError } from '~/composables/useStudioApi'

  const props = defineProps<{ target: Target }>()
  const emit = defineEmits<{ error: [error: unknown] }>()

  const { t } = useI18n()
  const api = useStudioApi()
  // The bridge exists only in the Electron renderer, so read it after mounting.
  const bridge = ref<DesktopBridge | null>(null)
  onMounted(() => (bridge.value = useDesktopBridge()))
  const drafts = useDraftStore()
  const queryCache = useQueryCache()

  const busy = ref<'save' | 'saveAs' | 'close' | null>(null)
  const confirmClose = ref(false)

  async function run (action: 'save' | 'saveAs' | 'close', task: () => Promise<void>) {
    busy.value = action
    emit('error', null)
    try {
      await task()
    } catch (error) {
      emit('error', error)
    } finally {
      busy.value = null
    }
  }

  function updateTarget (target: Target) {
    queryCache.setQueryData(['targets', target.id], target)
    void queryCache.invalidateQueries({ key: ['targets'], exact: true })
  }

  function save () {
    return run('save', async () => {
      updateTarget(await api<Target>(`/workspaces/${props.target.id}/saves`, { method: 'POST' }))
    })
  }

  function saveAs () {
    return run('saveAs', async () => {
      const grant = await bridge.value?.chooseSaveLocation(props.target.name)
      if (!grant) {
        return
      }
      updateTarget(await api<Target>(`/workspaces/${props.target.id}/exports`, { method: 'POST', body: { fileHandle: grant.handle } }))
    })
  }

  function close (force: boolean) {
    return run('close', async () => {
      try {
        await api(`/workspaces/${props.target.id}`, { method: 'DELETE', query: { force: String(force) } })
      } catch (error) {
        if (error instanceof StudioApiError && error.code === 'workspace_unsaved_changes') {
          confirmClose.value = true
          return
        }
        throw error
      }
      confirmClose.value = false
      drafts.discardTarget(props.target.id)
      for (const entry of queryCache.getEntries({ key: ['targets', props.target.id] })) {
        queryCache.remove(entry)
      }
      void queryCache.invalidateQueries({ key: ['targets'], exact: true })
      await navigateTo('/')
    })
  }
</script>
