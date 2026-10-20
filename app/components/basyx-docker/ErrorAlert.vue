<template>
  <v-alert
    :closable="closable"
    data-test="docker-error"
    density="compact"
    type="error"
    @click:close="emit('close')"
  >
    <v-alert-title>{{ t('error.title') }}</v-alert-title>
    <div class="text-body-2">{{ presentation.message }}</div>

    <div class="mt-2 text-body-2">
      <span class="font-weight-medium">{{ t('error.nextStep') }}</span>
      {{ presentation.action }}
    </div>

    <v-expansion-panels class="mt-2">
      <v-expansion-panel>
        <v-expansion-panel-title>
          {{ t('error.technicalDetails') }}
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <v-list :lines="false">
            <v-list-item :subtitle="presentation.cause" :title="t('error.cause')" />
            <v-list-item :subtitle="presentation.code" :title="t('error.code')" />
            <v-list-item v-if="presentation.status !== null" :subtitle="String(presentation.status)" :title="t('error.status')" />
            <v-list-item v-if="presentation.detail" :subtitle="presentation.detail" :title="t('error.detail')" />

            <v-list-item
              v-for="violation in presentation.violations"
              :key="`${violation.path}:${violation.message}`"
              :subtitle="violation.message"
              :title="violation.path"
            />
          </v-list>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <div v-if="$slots.actions" class="d-flex flex-wrap justify-end ga-2 mt-2">
      <slot name="actions" />
    </div>
  </v-alert>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useI18n } from './i18n'
  import { errorPresentation } from './support'

  const props = withDefaults(defineProps<{ error: unknown, closable?: boolean }>(), { closable: false })
  const emit = defineEmits<{ close: [] }>()
  const { t } = useI18n()
  const presentation = computed(() => errorPresentation(t, props.error))
</script>
