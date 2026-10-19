<template>
  <!-- Port of the Web UI's AutoRefreshSelector; Studio refreshes at most
       every 5 seconds (time series plan U5). -->
  <v-menu
    v-model="menuOpen"
    :close-on-content-click="false"
    location="bottom end"
    width="min(340px, calc(100vw - 32px))"
  >
    <template #activator="{ props: menuProps }">
      <v-btn
        :aria-label="t('autoRefresh.button', { label: buttonLabel })"
        :color="validationError ? 'error' : undefined"
        data-test="auto-refresh"
        prepend-icon="mdi-refresh"
        v-bind="menuProps"
      >
        {{ buttonLabel }}
        <v-icon end icon="mdi-menu-down" />
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center text-title-small">
        <span>{{ t('autoRefresh.title') }}</span>
        <v-spacer />

        <v-btn
          :aria-label="t('autoRefresh.close')"
          icon="mdi-close"
          size="x-small"
          @click="menuOpen = false"
        />
      </v-card-title>

      <v-card-text>
        <v-switch
          v-model="enabled"
          class="mb-3"
          :label="t('autoRefresh.enabled')"
        />

        <v-row density="compact">
          <v-col cols="7">
            <div class="text-caption mb-1">{{ t('autoRefresh.every') }}</div>

            <v-text-field
              v-model.number="value"
              :aria-label="t('autoRefresh.every')"
              density="compact"
              :disabled="!enabled"
              hide-details
              :min="unit === 'seconds' ? MIN_SECONDS : 1"
              step="1"
              type="number"
            />
          </v-col>

          <v-col cols="5">
            <div class="text-caption mb-1">{{ t('autoRefresh.unit') }}</div>

            <v-btn-toggle v-model="unit" class="d-flex" :disabled="!enabled" mandatory>
              <v-btn
                v-for="unitOption in AUTO_REFRESH_UNITS"
                :key="unitOption"
                :aria-label="t(`units.${unitOption}`)"
                class="flex-grow-1"
                min-width="0"
                :value="unitOption"
              >
                {{ AUTO_REFRESH_UNIT_SHORT[unitOption] }}
              </v-btn>
            </v-btn-toggle>
          </v-col>
        </v-row>

        <div v-if="validationError" class="text-error text-caption mt-2" role="alert">
          {{ t(`validation.${validationError}`) }}
        </div>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script lang="ts" setup>
  import type { AutoRefreshSelection, AutoRefreshUnit } from './autoRefresh'
  import { computed, ref, watch } from 'vue'
  import {
    AUTO_REFRESH_UNIT_SHORT,
    AUTO_REFRESH_UNITS,
    MIN_AUTO_REFRESH_MS,
    validateAutoRefreshSelection,
  } from './autoRefresh'
  import { useI18n } from './i18n'

  const props = defineProps<{
    modelValue: AutoRefreshSelection
  }>()

  const emit = defineEmits<{
    'update:model-value': [value: AutoRefreshSelection]
  }>()

  const { t } = useI18n()

  const MIN_SECONDS = MIN_AUTO_REFRESH_MS / 1000

  const enabled = ref(props.modelValue.enabled)
  const menuOpen = ref(false)
  const value = ref(props.modelValue.value)
  const unit = ref<AutoRefreshUnit>(props.modelValue.unit)

  const selection = computed<AutoRefreshSelection>(() => ({
    enabled: enabled.value,
    value: Number(value.value),
    unit: unit.value,
  }))
  const validationError = computed(() => validateAutoRefreshSelection(selection.value))
  const buttonLabel = computed(() => (enabled.value ? `${value.value}${AUTO_REFRESH_UNIT_SHORT[unit.value]}` : t('autoRefresh.off')))

  watch(
    () => props.modelValue,
    nextValue => {
      enabled.value = nextValue.enabled
      value.value = nextValue.value
      unit.value = nextValue.unit
    },
    { deep: true },
  )

  watch(
    selection,
    nextValue => emit('update:model-value', nextValue),
    { deep: true },
  )
</script>
