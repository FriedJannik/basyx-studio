<template>
  <v-form class="pa-4" @submit.prevent="apply()">
    <div class="d-flex align-center mb-2">
      <span class="text-title-small">{{ t('editor.title') }}</span>
      <v-spacer />
      <span v-if="valueType" class="text-body-small text-medium-emphasis">{{ valueType }}</span>
    </div>

    <v-text-field
      v-if="modelType === 'Property'"
      :error-messages="fieldErrors"
      :label="label"
      :model-value="propertyValue"
      :placeholder="t('editor.emptyValue')"
      @update:model-value="onPropertyInput"
    />

    <template v-else>
      <v-row v-for="(entry, index) in languageValues" :key="index" density="compact">
        <v-col cols="3">
          <v-text-field
            hide-details
            :label="t('editor.language')"
            :model-value="entry.language"
            @update:model-value="text => onLanguageInput(index, { language: text })"
          />
        </v-col>

        <v-col>
          <v-text-field
            hide-details
            :label="t('editor.text')"
            :model-value="entry.text"
            @update:model-value="text => onLanguageInput(index, { text })"
          >
            <template #append>
              <v-btn :aria-label="t('editor.remove')" icon="mdi-close" size="small" @click="removeLanguage(index)" />
            </template>
          </v-text-field>
        </v-col>
      </v-row>

      <v-btn
        class="mt-2"
        prepend-icon="mdi-plus"
        size="small"
        :text="t('editor.addLanguage')"
        @click="addLanguage"
      />

      <div v-if="fieldErrors.length > 0" class="text-error text-body-small mt-2">{{ fieldErrors.join(' ') }}</div>
    </template>

    <v-alert v-if="conflict" class="mt-4" :title="t('editor.conflictTitle')" type="warning">
      <div class="text-body-medium">{{ t('editor.conflictText') }}</div>

      <div class="text-body-medium mt-2">
        <span class="text-medium-emphasis">{{ t('editor.currentValue') }}:</span> {{ describe(conflict.value) }}
      </div>

      <div class="d-flex flex-wrap ga-2 mt-3">
        <v-btn :text="t('editor.overwrite')" @click="overwrite" />
        <v-btn :text="t('editor.discard')" @click="discard" />
      </div>
    </v-alert>

    <ProblemAlert v-else-if="error && fieldErrors.length === 0" class="mt-4" :error="error" />

    <v-alert
      v-if="detail.concurrency === 'best_effort'"
      class="mt-4"
      density="compact"
      icon="mdi-information-outline"
      type="info"
    >
      <div class="text-body-small">{{ t('editor.bestEffort') }}</div>
    </v-alert>

    <div class="d-flex align-center ga-2 mt-4">
      <span v-if="appliedMessage" class="text-body-small text-medium-emphasis">{{ appliedMessage }}</span>
      <v-spacer />
      <v-btn :disabled="!draft || applying" :text="t('editor.discard')" @click="discard" />
      <v-btn-primary :disabled="!draft || conflict !== null" :loading="applying" :text="t('editor.apply')" type="submit" />
    </div>
  </v-form>
</template>

<script lang="ts" setup>
  import type { ElementDetail, ElementValueInput, LangString } from '#shared/contract'
  import { StudioApiError } from '~/composables/useStudioApi'

  const props = defineProps<{
    targetId: string
    submodelKey: string
    detail: ElementDetail
    /** Applied changes need an explicit save of the workspace. */
    explicitSave: boolean
  }>()
  const emit = defineEmits<{
    /** The element changed at its source; reload what shows it. */
    changed: [detail: ElementDetail]
  }>()

  type Value = ElementValueInput['value']

  const { t } = useI18n()
  const api = useStudioApi()
  const drafts = useDraftStore()

  const element = computed(() => props.detail.value as Record<string, unknown>)
  const modelType = computed(() => element.value.modelType as 'Property' | 'MultiLanguageProperty')
  const label = computed(() => String(element.value.idShort ?? props.detail.path))
  const valueType = computed(() => typeof element.value.valueType === 'string' ? element.value.valueType : null)

  function sourceValue (value: Record<string, unknown>): Value {
    if (value.modelType === 'Property') {
      return typeof value.value === 'string' ? value.value : null
    }
    return Array.isArray(value.value) ? (value.value as LangString[]).map(entry => ({ language: entry.language, text: entry.text })) : []
  }

  const draft = computed(() => drafts.get(props.targetId, props.submodelKey, props.detail.key))
  const value = computed<Value>(() => draft.value ? draft.value.value : sourceValue(element.value))
  const propertyValue = computed(() => typeof value.value === 'string' ? value.value : '')
  const languageValues = computed(() => Array.isArray(value.value) ? value.value : [])

  const applying = ref(false)
  const error = ref<unknown>(null)
  const conflict = ref<ElementDetail | null>(null)
  const appliedMessage = ref<string | null>(null)

  const fieldErrors = computed(() => {
    const problem = error.value instanceof StudioApiError ? error.value.problem : null
    return problem?.code === 'validation_failed' ? [problem.detail ?? problem.title] : []
  })

  function update (next: Value) {
    appliedMessage.value = null
    error.value = null
    // The draft keeps the revision it started from, even if the element is reloaded.
    const revision = draft.value?.revision ?? props.detail.revision!
    if (revision === props.detail.revision && JSON.stringify(next) === JSON.stringify(sourceValue(element.value))) {
      drafts.discard(props.targetId, props.submodelKey, props.detail.key)
      return
    }
    drafts.set(props.targetId, props.submodelKey, props.detail.key, { revision, value: next })
  }

  function onPropertyInput (text: string) {
    update(text)
  }

  function onLanguageInput (index: number, change: Partial<LangString>) {
    update(languageValues.value.map((entry, position) => position === index ? { ...entry, ...change } : entry))
  }

  function addLanguage () {
    update([...languageValues.value, { language: '', text: '' }])
  }

  function removeLanguage (index: number) {
    update(languageValues.value.filter((_, position) => position !== index))
  }

  function describe (current: unknown): string {
    const text = sourceValue(current as Record<string, unknown>)
    if (Array.isArray(text)) {
      return text.length > 0 ? text.map(entry => `${entry.language}: ${entry.text}`).join(', ') : t('editor.emptyValue')
    }
    return text ?? t('editor.emptyValue')
  }

  function elementUrl () {
    return `/targets/${props.targetId}/submodels/${props.submodelKey}/elements/${props.detail.key}`
  }

  async function apply () {
    if (!draft.value) {
      return
    }
    applying.value = true
    error.value = null
    try {
      const result = await api<ElementDetail>(`${elementUrl()}/value`, {
        method: 'PUT',
        headers: { 'If-Match': `"${draft.value.revision}"` },
        body: { value: draft.value.value },
      })
      drafts.discard(props.targetId, props.submodelKey, props.detail.key)
      appliedMessage.value = t(props.explicitSave ? 'editor.appliedUnsaved' : 'editor.applied')
      emit('changed', result)
    } catch (error_) {
      if (error_ instanceof StudioApiError && error_.code === 'revision_conflict') {
        conflict.value = await api<ElementDetail>(elementUrl()).catch(() => null)
        if (conflict.value) {
          emit('changed', conflict.value)
          return
        }
      }
      error.value = error_
    } finally {
      applying.value = false
    }
  }

  /** Bases the draft on the current revision and applies it deliberately. */
  async function overwrite () {
    if (!conflict.value?.revision || !draft.value) {
      return
    }
    drafts.set(props.targetId, props.submodelKey, props.detail.key, { revision: conflict.value.revision, value: draft.value.value })
    conflict.value = null
    await apply()
  }

  function discard () {
    drafts.discard(props.targetId, props.submodelKey, props.detail.key)
    conflict.value = null
    error.value = null
  }

  watch(() => props.detail.key, () => {
    conflict.value = null
    error.value = null
    appliedMessage.value = null
  })
</script>
