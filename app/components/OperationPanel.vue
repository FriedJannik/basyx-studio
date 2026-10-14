<template>
  <v-card border="0" color="surface-light">
    <v-card-item>
      <v-card-subtitle class="text-label-medium">{{ t('operation.inputs') }}</v-card-subtitle>
    </v-card-item>

    <v-card-text class="pt-0">
      <v-text-field
        v-for="variable in inputs"
        :key="variable.idShort"
        v-model="values[variable.idShort]"
        class="mb-2"
        :disabled="!canInvoke"
        :hint="variable.valueType ?? undefined"
        :label="variable.idShort"
        persistent-hint
      />

      <div v-if="inputs.length === 0" class="text-body-medium text-medium-emphasis">{{ t('operation.noInputs') }}</div>
      <v-switch v-model="async" class="mt-2" :disabled="!canInvoke" :label="t('operation.async')" />
    </v-card-text>

    <v-card-actions>
      <span v-if="!canInvoke" class="text-label-small text-medium-emphasis ms-2">{{ t('operation.notAllowed') }}</span>
      <v-spacer />

      <v-btn-primary
        color="success"
        :disabled="!canInvoke"
        :loading="running"
        prepend-icon="mdi-play"
        :text="t('operation.invoke')"
        @click="invoke"
      />
    </v-card-actions>

    <v-expand-transition>
      <v-card-text v-if="result || error" class="pt-0">
        <ProblemAlert v-if="error" :error="error" />

        <v-alert
          v-else-if="result"
          :title="result.state === 'completed' ? t('operation.completed') : (result.state === 'running' ? t('operation.running') : t('operation.failed'))"
          :type="result.state === 'completed' ? 'success' : (result.state === 'running' ? 'info' : 'error')"
        >
          <div v-if="result.message" class="text-body-small">{{ result.message }}</div>

          <v-list v-if="result.outputs.length > 0">
            <v-list-item
              v-for="output in result.outputs"
              :key="output.idShort"
              class="px-0"
              :subtitle="`${output.idShort}${output.valueType ? ` · ${output.valueType}` : ''}`"
              :title="format(output.value)"
            />
          </v-list>
        </v-alert>
      </v-card-text>
    </v-expand-transition>
  </v-card>
</template>

<script lang="ts" setup>
  import type { Invocation } from '#shared/contract'

  const props = defineProps<{
    targetId: string
    submodelKey: string
    elementKey: string
    element: Record<string, any>
    canInvoke: boolean
  }>()

  const { t } = useI18n()
  const api = useStudioApi()

  interface Variable { idShort: string, valueType: string | null, value: string }

  function variables (group: string): Variable[] {
    return ((props.element[group] ?? []) as Array<{ value?: Record<string, unknown> }>)
      .map(variable => variable.value)
      .filter((value): value is Record<string, unknown> => typeof value?.idShort === 'string')
      .map(value => ({ idShort: String(value.idShort), valueType: typeof value.valueType === 'string' ? value.valueType : null, value: typeof value.value === 'string' ? value.value : '' }))
  }

  // In-out variables are sent as inputs as well; only their simple values can be typed in.
  const inputs = computed(() => [...variables('inputVariables'), ...variables('inoutputVariables').filter(variable => variable.valueType)])
  const values = ref<Record<string, string>>({})
  const async = ref(false)
  const running = ref(false)
  const result = ref<Invocation | null>(null)
  const error = ref<unknown>(null)
  let poll: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  watch(() => props.elementKey, () => {
    clearTimeout(poll)
    values.value = Object.fromEntries(inputs.value.map(variable => [variable.idShort, variable.value]))
    result.value = null
    error.value = null
    running.value = false
  }, { immediate: true })

  function url () {
    return `/targets/${props.targetId}/submodels/${props.submodelKey}/elements/${props.elementKey}/invocations`
  }

  function format (value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value)
  }

  async function follow (handle: string) {
    try {
      const state = await api<Invocation>(`${url()}/${encodeURIComponent(handle)}`)
      if (disposed) {
        return
      }
      result.value = state
      if (state.state === 'running') {
        poll = setTimeout(() => void follow(handle), 1000)
        return
      }
    } catch (error_) {
      error.value = error_
    }
    running.value = false
  }

  async function invoke () {
    running.value = true
    result.value = null
    error.value = null
    try {
      const invocation = await api<Invocation>(url(), {
        method: 'POST',
        body: { arguments: inputs.value.map(variable => ({ idShort: variable.idShort, value: values.value[variable.idShort] ?? null })), async: async.value },
      })
      result.value = invocation
      if (invocation.state === 'running' && invocation.handle) {
        poll = setTimeout(() => void follow(invocation.handle!), 1000)
        return
      }
    } catch (error_) {
      error.value = error_
    }
    running.value = false
  }

  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(poll)
  })
</script>
