<template>
  <!-- Live values: numeric properties whose values changed while auto-refresh re-read them. -->
  <div class="d-flex flex-wrap ga-3 pa-3">
    <v-card
      v-for="signal in signals"
      :key="signal.id"
      class="flex-1-1-0"
      max-width="280"
      min-width="180"
      @click="emit('select', signal.id)"
    >
      <v-card-item>
        <v-card-subtitle class="text-label-medium">{{ signal.title }}</v-card-subtitle>

        <v-card-title class="text-headline-small font-weight-medium">
          {{ signal.value }}
          <span v-if="signal.unit && signal.value !== null" class="text-body-large text-medium-emphasis">{{ signal.unit }}</span>
        </v-card-title>

        <template #append>
          <v-btn-widget-icon
            v-tooltip="pinLabel(signal)"
            :aria-label="pinLabel(signal)"
            :color="isPinned(signal) ? 'primary' : undefined"
            :disabled="!isPinned(signal) && pinsFull"
            :icon="isPinned(signal) ? 'mdi-pin' : 'mdi-pin-outline'"
            @click.stop="emit('pin', signal)"
          />
        </template>
      </v-card-item>

      <ValueSparkline v-tooltip="t('overview.liveHint', { submodel: signal.submodel, count: signal.history.length })" :values="signal.history" />
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  import type { LiveSignal } from '~/composables/useShellOverview'

  const props = defineProps<{
    signals: LiveSignal[]
    isPinned: (signal: LiveSignal) => boolean
    /** No further value can be pinned. */
    pinsFull: boolean
  }>()
  const emit = defineEmits<{
    select: [id: string]
    /** Pins or unpins the signal's element. */
    pin: [signal: LiveSignal]
  }>()

  const { t } = useI18n()

  function pinLabel (signal: LiveSignal) {
    if (props.isPinned(signal)) {
      return t('overview.unpin')
    }
    return props.pinsFull ? t('overview.pinsFull') : t('overview.pin')
  }
</script>
