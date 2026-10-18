<template>
  <v-dialog v-model="open" max-width="760" persistent scrollable>
    <DialogCard flush :title="t('admin.importTitle')">
      <FileDropZone :text="t('admin.importDropHint')" :title="t('admin.importDrop')" @file="readFile">
        <v-sheet color="transparent" height="300">
          <CodeView
            v-model="text"
            editable
            :label="t('admin.importHint')"
            language="yaml"
            model-namespace="infrastructure-import"
          />
        </v-sheet>
      </FileDropZone>

      <v-divider />

      <div class="pa-3 d-flex flex-column ga-2">
        <v-alert v-if="result && result.problems.length > 0" density="compact" :title="t('admin.importInvalid')" type="error">
          <ul class="ps-4 text-body-small">
            <li v-for="problem in result.problems" :key="problem">{{ problem }}</li>
          </ul>
        </v-alert>

        <v-list v-else-if="result && result.entries.length > 0">
          <v-list-item
            v-for="entry in result.entries"
            :key="entry.index"
            :lines="false"
            :subtitle="describe(entry)"
            :title="entry.name ?? t('admin.importUnnamed', { index: entry.index + 1 })"
          >
            <template #prepend>
              <v-icon :color="status(entry).color" :icon="status(entry).icon" />
            </template>

            <template v-if="entry.conflict && entry.outcome === null" #append>
              <v-select
                density="compact"
                hide-details
                :items="resolutionItems(entry)"
                :model-value="entry.resolution"
                width="200"
                @update:model-value="resolve(entry.index, $event)"
              />
            </template>
          </v-list-item>
        </v-list>

        <ProblemAlert v-if="error" :error="error" />
      </div>

      <template #actions>
        <v-btn :text="done ? t('common.close') : t('common.cancel')" @click="close" />

        <v-btn-primary
          v-if="!done"
          :disabled="importable === 0 || checking || busy"
          :loading="busy"
          :text="t('admin.importAction', importable)"
          @click="commit"
        />
      </template>
    </DialogCard>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { ImportResolution, InfrastructureImportEntry, InfrastructureImportResult } from '#shared/contract'

  // Import of infrastructures in the file format (ADR 0037): pasted, or
  // dropped as a file. The server checks the text while the user types (a dry
  // run), lists every entry with its problems and name conflicts, and imports
  // the entries one by one.
  const emit = defineEmits<{ imported: [] }>()
  const open = defineModel<boolean>({ required: true })

  const { t } = useI18n()
  const api = useStudioApi()

  const text = ref('')
  const resolutions = ref<Record<string, ImportResolution>>({})
  const result = ref<InfrastructureImportResult | null>(null)
  const checking = ref(false)
  const busy = ref(false)
  const done = ref(false)
  const error = ref<unknown>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let sequence = 0

  /** Entries the import would create or replace. */
  const importable = computed(() => result.value?.problems.length
    ? 0
    : (result.value?.entries ?? []).filter(entry => entry.problems.length === 0 && entry.resolution !== 'skip').length)

  /** Checks the text (a dry run); only the latest check may show its result. */
  async function preview () {
    const current = ++sequence
    error.value = null
    try {
      const response = await api<InfrastructureImportResult>('/infrastructures/import', {
        method: 'POST',
        body: { yaml: text.value, dryRun: true, resolutions: resolutions.value },
      })
      if (current === sequence) {
        result.value = response
      }
    } catch (error_) {
      if (current === sequence) {
        error.value = error_
      }
    } finally {
      if (current === sequence) {
        checking.value = false
      }
    }
  }

  /** Imports. A scheduled or running check never replaces what the import did. */
  async function commit () {
    clearTimeout(timer)
    sequence++
    checking.value = false
    busy.value = true
    error.value = null
    try {
      result.value = await api<InfrastructureImportResult>('/infrastructures/import', {
        method: 'POST',
        body: { yaml: text.value, dryRun: false, resolutions: resolutions.value },
      })
      done.value = true
      emit('imported')
    } catch (error_) {
      error.value = error_
    } finally {
      busy.value = false
    }
  }

  /** Schedules a check; until it answers, the shown result may not match the text. */
  function check () {
    clearTimeout(timer)
    sequence++
    done.value = false
    if (text.value.trim() === '') {
      result.value = null
      checking.value = false
      return
    }
    checking.value = true
    timer = setTimeout(preview, 350)
  }

  // Choices belong to the entries they were made for, which are matched by
  // position: new text, new choices, so a choice never moves to another entry.
  watch(text, () => {
    resolutions.value = {}
    check()
  })

  function resolve (index: number, resolution: ImportResolution) {
    resolutions.value = { ...resolutions.value, [String(index)]: resolution }
    check()
  }

  function resolutionItems (entry: InfrastructureImportEntry) {
    const choices: ImportResolution[] = entry.conflict?.managed ? ['skip', 'create'] : ['skip', 'replace', 'create']
    return choices.map(value => ({ value, title: t(`admin.importResolutions.${value}`) }))
  }

  function describe (entry: InfrastructureImportEntry): string {
    if (entry.problems.length > 0) {
      return entry.problems.join(' · ')
    }
    if (entry.outcome) {
      return t(`admin.importOutcomes.${entry.outcome}`)
    }
    return entry.conflict ? t('admin.importConflict', { name: entry.conflict.name }) : t('admin.importReady')
  }

  function status (entry: InfrastructureImportEntry): { icon: string, color: string | undefined } {
    if (entry.problems.length > 0) {
      return { icon: 'mdi-alert-circle-outline', color: 'error' }
    }
    if (entry.outcome === 'created' || entry.outcome === 'replaced') {
      return { icon: 'mdi-check-circle-outline', color: 'success' }
    }
    if (entry.outcome === 'skipped' || entry.resolution === 'skip') {
      return { icon: 'mdi-debug-step-over', color: undefined }
    }
    return { icon: entry.resolution === 'replace' ? 'mdi-swap-horizontal' : 'mdi-server-plus-outline', color: 'primary' }
  }

  async function readFile (file: File) {
    text.value = await file.text()
  }

  watch(open, value => {
    if (value) {
      text.value = ''
      resolutions.value = {}
      result.value = null
      done.value = false
      error.value = null
    }
  })

  function close () {
    clearTimeout(timer)
    open.value = false
  }
</script>
