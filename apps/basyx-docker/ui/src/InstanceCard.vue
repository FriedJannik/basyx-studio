<template>
  <v-card :data-test="`stack-${stack.id}`">
    <v-card-item :prepend-icon="stack.spec ? presetIcons[stack.spec.preset] : 'mdi-help-box-outline'">
      <v-card-title class="text-wrap">{{ stack.name }}</v-card-title>

      <v-card-subtitle class="d-flex flex-wrap align-center ga-2 text-wrap">
        <span>{{ subtitle }}</span>
        <v-chip :color="statusLook.color" data-test="status" :prepend-icon="statusLook.icon" :text="t(`status.${stack.status}`)" />
      </v-card-subtitle>

      <template #append>
        <div class="d-flex align-center ga-1">
          <v-menu v-if="stack.spec">
            <template #activator="{ props: activator }">
              <v-btn
                v-bind="activator"
                :aria-label="t('card.change')"
                data-test="menu"
                icon="mdi-dots-vertical"
                size="small"
              />
            </template>

            <v-list :lines="false">
              <v-list-item v-if="stack.urls.environment" prepend-icon="mdi-open-in-new" :title="t('card.openInBrowser')" @click="openExternal(`${stack.urls.environment}/description`)" />
              <v-list-item prepend-icon="mdi-text-box-outline" :title="t('card.logs')" @click="toggle('logs')" />
              <v-list-item v-if="secured" prepend-icon="mdi-account-key-outline" :title="t('card.signIn')" @click="toggle('signIn')" />
              <v-list-item :disabled="busy" prepend-icon="mdi-tune-variant" :title="t('card.change')" @click="emit('change')" />
              <v-list-item :disabled="busy" prepend-icon="mdi-export" :title="t('card.export')" @click="toggle('export')" />

              <v-list-item
                v-if="stack.updateAvailable || stack.spec?.images.channel === 'latest'"
                :disabled="busy"
                prepend-icon="mdi-update"
                :title="t('card.update')"
                @click="run(() => containers.updateStack(stack.id))"
              />

              <v-divider />

              <v-list-item
                base-color="error"
                :disabled="busy"
                prepend-icon="mdi-delete-outline"
                :title="t('card.remove')"
                @click="toggle('remove')"
              />
            </v-list>
          </v-menu>

          <v-btn
            v-else
            :aria-label="t('card.remove')"
            icon="mdi-delete-outline"
            size="small"
            @click="toggle('remove')"
          />
        </div>
      </template>
    </v-card-item>

    <v-card-text class="d-flex flex-column ga-3">
      <v-alert
        v-if="error"
        closable
        :text="error"
        type="error"
        @click:close="error = null"
      />

      <template v-if="job">
        <div v-if="job.state === 'running'" class="text-subtitle-2">{{ t(`job.${job.kind}`) }}</div>

        <v-alert
          v-else-if="job.state === 'failed'"
          closable
          data-test="job-failed"
          type="error"
          @click:close="emit('dismiss-job')"
        >
          {{ problemText(t, job.problem) }}

          <v-expansion-panels v-if="job.problem?.detail" class="mt-2" flat>
            <v-expansion-panel :title="t('problem.details')">
              <v-expansion-panel-text>
                <div class="text-caption text-pre-wrap">{{ job.problem.detail }}</div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <template #append>
            <v-btn :text="t('card.logs')" @click="toggle('logs')" />
          </template>
        </v-alert>

        <JobProgress v-if="job.state !== 'succeeded'" :job="job" />
      </template>

      <v-alert v-if="stack.status === 'orphan'" :text="t('card.orphanText')" type="info" />

      <v-alert v-else-if="stack.status === 'missing' && !busy" :text="t('card.missingText')" type="warning">
        <template #append>
          <v-btn :text="t('card.recreate')" @click="run(() => containers.startStack(stack.id))" />
        </template>
      </v-alert>

      <v-alert v-if="stack.updateAvailable && !busy" :text="t('card.updateAvailable')" type="info">
        <template #append>
          <v-btn :text="t('card.update')" @click="run(() => containers.updateStack(stack.id))" />
        </template>
      </v-alert>

      <template v-if="stack.status === 'running'">
        <v-list class="py-0" density="compact" :lines="false">
          <v-list-subheader>{{ t('card.addresses') }}</v-list-subheader>

          <v-list-item v-for="address in addresses" :key="address.url" :subtitle="address.url" :title="address.title">
            <template #append>
              <v-btn :aria-label="t('card.copy')" icon="mdi-content-copy" size="small" @click="client.ui.copyText(address.url)" />
            </template>
          </v-list-item>
        </v-list>

        <v-alert v-if="!stack.infrastructureId" :text="t('card.notInStudio')" type="info" />
      </template>

      <v-expand-transition>
        <v-alert v-if="panel === 'export'" :text="t('card.exportWarning')" type="warning">
          <template #append>
            <v-btn :text="t('remove.cancel')" @click="panel = null" />
            <v-btn-primary :text="t('card.export')" @click="exportStack" />
          </template>
        </v-alert>
      </v-expand-transition>

      <v-expand-transition>
        <LogsPanel v-if="panel === 'logs'" :stack="stack" @close="panel = null" />
      </v-expand-transition>

      <v-expand-transition>
        <SignInDetails v-if="panel === 'signIn'" :stack="stack" @close="panel = null" />
      </v-expand-transition>

      <v-expand-transition>
        <v-alert v-if="panel === 'remove'" data-test="remove-confirm" :title="t('remove.title', { name: stack.name })" type="warning">
          <div>{{ t('remove.text') }}</div>

          <v-checkbox
            v-model="deleteData"
            data-test="remove-data"
            density="compact"
            hide-details
            :label="t('remove.data')"
          />

          <v-checkbox
            v-if="stack.infrastructureId"
            v-model="removeInfrastructure"
            density="compact"
            hide-details
            :label="t('remove.infrastructure')"
          />

          <div class="d-flex justify-end ga-2 mt-2">
            <v-btn :text="t('remove.cancel')" @click="panel = null" />

            <v-btn
              color="error"
              data-test="remove-confirm-button"
              :text="t('remove.confirm')"
              variant="flat"
              @click="remove"
            />
          </div>
        </v-alert>
      </v-expand-transition>
    </v-card-text>

    <v-card-actions v-if="stack.spec && stack.status !== 'missing'">
      <v-btn-primary
        v-if="stack.infrastructureId"
        data-test="open"
        :disabled="stack.status !== 'running'"
        prepend-icon="mdi-open-in-app"
        :text="t('card.open')"
        @click="client.ui.openTarget(stack.infrastructureId)"
      />

      <v-spacer />

      <v-btn
        v-if="stack.status === 'stopped' || stack.status === 'error' || stack.status === 'partial' || stack.status === 'unknown'"
        data-test="start"
        :disabled="busy"
        prepend-icon="mdi-play"
        :text="t('card.start')"
        @click="run(() => containers.startStack(stack.id))"
      />

      <v-btn
        v-if="stack.status === 'running' || stack.status === 'partial' || stack.status === 'error'"
        data-test="stop"
        :disabled="busy"
        prepend-icon="mdi-stop"
        :text="t('card.stop')"
        @click="run(() => containers.stopStack(stack.id))"
      />
    </v-card-actions>
  </v-card>
</template>

<script lang="ts" setup>
  import type { Job, Stack } from '@basyx/studio-sdk'
  import { computed, ref } from 'vue'
  import { useI18n } from './i18n'
  import JobProgress from './JobProgress.vue'
  import LogsPanel from './LogsPanel.vue'
  import SignInDetails from './SignInDetails.vue'
  import { presetIcons, problemOf, problemText, useClient } from './support'

  const props = defineProps<{ stack: Stack, job: Job | null }>()
  const emit = defineEmits<{ 'job': [job: Job], 'change': [], 'dismiss-job': [] }>()
  const { t } = useI18n()
  const client = useClient()
  const containers = client.containers

  const panel = ref<'logs' | 'signIn' | 'remove' | 'export' | null>(null)
  const error = ref<string | null>(null)
  const deleteData = ref(false)
  const removeInfrastructure = ref(true)

  const busy = computed(() => props.stack.status === 'busy' || props.job?.state === 'running')
  const secured = computed(() => props.stack.spec?.security.mode === 'keycloak')

  const statusLook = computed(() => ({
    running: { color: 'success', icon: 'mdi-check-circle-outline' },
    busy: { color: 'info', icon: 'mdi-progress-clock' },
    partial: { color: 'warning', icon: 'mdi-alert-outline' },
    stopped: { color: undefined, icon: 'mdi-stop-circle-outline' },
    error: { color: 'error', icon: 'mdi-alert-circle-outline' },
    missing: { color: 'warning', icon: 'mdi-help-circle-outline' },
    orphan: { color: undefined, icon: 'mdi-help-circle-outline' },
    unknown: { color: 'warning', icon: 'mdi-lan-disconnect' },
  })[props.stack.status])

  const subtitle = computed(() => {
    const spec = props.stack.spec
    if (!spec) {
      return props.stack.id
    }
    const parts = [t(`preset.${spec.preset}`), spec.persistence === 'keep' ? t('card.dataKept') : t('card.dataEphemeral')]
    if (spec.security.mode === 'keycloak') {
      parts.push(t(`access.${spec.security.access}`))
    }
    return parts.join(' · ')
  })

  const addresses = computed(() => {
    const urls = props.stack.urls
    return ([
      ['environment', urls.environment],
      ['aasRegistry', urls.aasRegistry],
      ['submodelRegistry', urls.submodelRegistry],
      ['discovery', urls.discovery],
      ['keycloak', urls.keycloak],
    ] as const).filter(([, url]) => url).map(([component, url]) => ({ title: t(`component.${component}`), url: url! }))
  })

  function toggle (next: 'logs' | 'signIn' | 'remove' | 'export') {
    panel.value = panel.value === next ? null : next
  }

  function openExternal (url: string) {
    void client.ui.openExternal(url)
  }

  async function run (action: () => Promise<Job>) {
    error.value = null
    try {
      emit('job', await action())
    } catch (error_) {
      error.value = problemText(t, problemOf(error_))
    }
  }

  async function remove () {
    panel.value = null
    await run(() => containers.removeStack({ stackId: props.stack.id, deleteData: deleteData.value, removeInfrastructure: removeInfrastructure.value && Boolean(props.stack.infrastructureId) }))
  }

  async function exportStack () {
    panel.value = null
    error.value = null
    try {
      const saved = await containers.exportStack(props.stack.id, props.stack.name)
      if (saved) {
        void client.ui.notify(saved.fileName, 'success')
      }
    } catch (error_) {
      error.value = problemText(t, problemOf(error_))
    }
  }
</script>
