<template>
  <v-list class="py-0" density="compact" :lines="false">
    <v-list-item v-for="step in job.steps" :key="step.id" :data-test="`step-${step.id}`">
      <template #prepend>
        <v-progress-circular
          v-if="step.state === 'running'"
          class="me-4"
          indeterminate
          size="18"
          width="2"
        />

        <v-icon
          v-else
          class="me-4"
          :color="icons[step.state].color"
          :icon="icons[step.state].icon"
          size="18"
        />
      </template>

      <v-list-item-title :class="step.state === 'pending' ? 'text-medium-emphasis' : undefined">{{ label(step) }}</v-list-item-title>

      <v-list-item-subtitle v-if="step.note">{{ note(step) }}</v-list-item-subtitle>

      <v-progress-linear
        v-if="step.state === 'running' && step.progress"
        class="mt-1"
        :indeterminate="false"
        :max="step.progress.total"
        :model-value="step.progress.current"
        rounded
      />
    </v-list-item>
  </v-list>
</template>

<script lang="ts" setup>
  import type { Job, JobStep } from '@basyx/studio-sdk'
  import { useI18n } from './i18n'

  defineProps<{ job: Job }>()
  const { t } = useI18n()

  const icons: Record<JobStep['state'], { icon: string, color?: string }> = {
    pending: { icon: 'mdi-circle-outline' },
    running: { icon: 'mdi-progress-clock' },
    done: { icon: 'mdi-check-circle', color: 'success' },
    skipped: { icon: 'mdi-check-circle-outline', color: 'success' },
    failed: { icon: 'mdi-close-circle', color: 'error' },
  }

  /** `docker.io/eclipsebasyx/aasenvironment-go@sha256:…` → `aasenvironment-go`. */
  function imageName (reference: string): string {
    return reference.split('/').pop()!.split(/[@:]/, 1)[0]!
  }

  function label (step: JobStep): string {
    const [kind, value = ''] = step.id.split(/:(.*)/s)
    switch (kind) {
      case 'download': {
        return t(step.state === 'skipped' ? 'job.downloadSkipped' : 'job.download', { image: imageName(value) })
      }
      case 'start': {
        return t('job.startComponent', { component: t(`component.${value}`) })
      }
      case 'create': {
        return t('job.created')
      }
      case 'stop': {
        return t('job.stopAll')
      }
      case 'remove': {
        return t('job.removeAll')
      }
      default: {
        return t(`job.${kind}`)
      }
    }
  }

  /** Optional steps that failed say what is left to do by hand. */
  function note (step: JobStep): string {
    if (step.id === 'register') {
      return t('job.registerFailed')
    }
    return step.id === 'unregister' ? t('job.unregisterFailed') : step.note ?? ''
  }
</script>
