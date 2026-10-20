<template>
  <div class="d-flex flex-column ga-3">
    <PageHeader :subtitle="t('app.subtitle')" :title="t('app.title')">
      <template v-if="engines && engineRunning && list && !wizard" #actions>
        <EngineStatus :engines="engines" @select="selectEngine" />
        <v-btn-secondary data-test="import" prepend-icon="mdi-import" :text="t('list.import')" @click="importStack" />
        <v-btn-primary data-test="new" prepend-icon="mdi-plus" :text="t('list.new')" @click="openWizard()" />
      </template>
    </PageHeader>

    <v-progress-linear v-if="!engines" />

    <template v-else-if="!engineRunning">
      <ErrorAlert v-if="engineError" closable :error="engineError" @close="engineError = null">
        <template #actions>
          <v-btn :text="t('problem.retry')" @click="checkEngines(true)" />
        </template>
      </ErrorAlert>

      <EngineMissing :checking="checking" :engines="engines" @check="checkEngines(true)" />
    </template>

    <NewInstanceWizard
      v-else-if="wizard"
      :key="wizard.key"
      :existing="existingNames"
      :import-info="wizard.importInfo"
      :stack="wizard.stack"
      @cancel="closeWizard"
      @done="onWizardDone"
    />

    <template v-else-if="list">
      <ErrorAlert
        v-if="actionError"
        closable
        :error="actionError"
        @close="actionError = null"
      />

      <ErrorAlert
        v-if="listError"
        closable
        :error="listError"
        @close="listError = null"
      >
        <template #actions>
          <v-btn :text="t('problem.retry')" @click="refresh" />
        </template>
      </ErrorAlert>

      <v-card v-if="list.items.length === 0" class="pa-4 text-center">
        <v-icon color="medium-emphasis" icon="mdi-server-plus-outline" size="40" />
        <div class="text-title-medium font-weight-medium mt-2">{{ t('list.emptyTitle') }}</div>
        <div class="text-body-medium text-medium-emphasis mt-1 mb-4">{{ t('list.emptyText') }}</div>
        <v-btn-primary prepend-icon="mdi-plus" :text="t('list.new')" @click="openWizard()" />
      </v-card>

      <v-row v-else density="compact">
        <v-col
          v-for="stack in list.items"
          :key="stack.id"
          cols="12"
          sm="6"
        >
          <InstanceCard
            :job="jobs.get(stack.id) ?? null"
            :stack="stack"
            @change="openWizard(stack)"
            @dismiss-job="dismissJob(stack.id)"
            @job="track"
          />
        </v-col>
      </v-row>
    </template>

    <ErrorAlert
      v-else-if="listError"
      closable
      :error="listError"
      @close="listError = null"
    >
      <template #actions>
        <v-btn :text="t('problem.retry')" @click="refresh" />
      </template>
    </ErrorAlert>

    <v-progress-linear v-else-if="engineRunning" />
  </div>
</template>

<script lang="ts" setup>
  import type { DockerClient } from './support'
  import type { Engines, Job, Stack, StackImport, StackList } from '@basyx/studio-sdk'
  import { computed, onBeforeUnmount, onMounted, provide, reactive, ref } from 'vue'
  import EngineMissing from './EngineMissing.vue'
  import EngineStatus from './EngineStatus.vue'
  import ErrorAlert from './ErrorAlert.vue'
  import { provideI18n } from './i18n'
  import InstanceCard from './InstanceCard.vue'
  import NewInstanceWizard from './NewInstanceWizard.vue'
  import { clientKey, problemOf } from './support'

  // BaSyx Docker (ADR 0033): finds Docker or Podman, lists the instances,
  // and follows their jobs. All work happens in the Studio Service.
  const props = defineProps<{ client: DockerClient }>()
  provide(clientKey, props.client)
  const { t } = provideI18n()
  const containers = props.client.containers

  const engines = ref<Engines | null>(null)
  const checking = ref(false)
  const list = ref<StackList | null>(null)
  const engineError = ref<unknown | null>(null)
  const actionError = ref<unknown | null>(null)
  const listError = ref<unknown | null>(null)
  /** The running or last finished job per stack. */
  const jobs = reactive(new Map<string, Job>())
  const wizard = ref<{ key: number, stack: Stack | null, importInfo: StackImport | null } | null>(null)

  const engineRunning = computed(() => Boolean(engines.value?.selected?.running))
  const existingNames = computed(() => list.value?.items.map(stack => stack.name) ?? [])

  async function checkEngines (fresh = false) {
    checking.value = true
    try {
      engines.value = fresh || !engines.value ? await containers.listEngines() : engines.value
      engineError.value = null
    } catch (error) {
      engineError.value = error
      engines.value = { selected: null, candidates: [], configured: null }
    } finally {
      checking.value = false
    }
  }

  async function selectEngine (host: string | null) {
    try {
      engines.value = await containers.selectEngine(host)
      await refresh()
    } catch (error) {
      actionError.value = error
    }
  }

  async function refresh () {
    if (!engineRunning.value) {
      return
    }
    try {
      list.value = await containers.listStacks()
      listError.value = null
      for (const stack of list.value.items) {
        if (stack.jobId && jobs.get(stack.id)?.id !== stack.jobId) {
          jobs.set(stack.id, await containers.getJob(stack.jobId))
        }
      }
      if (!list.value.engineAvailable) {
        await checkEngines(true)
      }
    } catch (error) {
      if (problemOf(error)?.code === 'container_engine_unavailable') {
        await checkEngines(true)
      } else {
        listError.value = error
      }
    }
  }

  function track (job: Job) {
    jobs.set(job.stackId, job)
  }

  function dismissJob (stackId: string) {
    jobs.delete(stackId)
  }

  /** Follows running jobs and tells Studio when one ends. */
  async function followJobs () {
    for (const [stackId, job] of jobs) {
      if (job.state !== 'running') {
        continue
      }
      try {
        const next = await containers.getJob(job.id)
        jobs.set(stackId, next)
        if (next.state !== 'running') {
          const name = list.value?.items.find(stack => stack.id === stackId)?.name ?? ''
          if (next.state === 'succeeded') {
            const key = next.kind === 'stop' ? 'job.succeededStop' : (next.kind === 'remove' ? 'job.succeededRemove' : 'job.succeededCreate')
            void props.client.ui.notify(t(key, { name }), 'success')
            if (next.kind === 'stop' || next.kind === 'remove') {
              jobs.delete(stackId)
            }
          }
          await refresh()
        }
      } catch (error) {
        actionError.value = error
        jobs.delete(stackId)
      }
    }
  }

  function openWizard (stack: Stack | null = null, importInfo: StackImport | null = null) {
    wizard.value = { key: Date.now(), stack, importInfo }
  }

  function closeWizard () {
    wizard.value = null
  }

  async function onWizardDone (job: Job) {
    wizard.value = null
    track(job)
    await refresh()
  }

  async function importStack () {
    actionError.value = null
    try {
      const imported = await containers.importStack()
      if (imported) {
        openWizard(null, imported)
      }
    } catch (error) {
      actionError.value = error
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let ticks = 0
  async function tick () {
    ticks++
    if (document.visibilityState === 'visible') {
      if (engineRunning.value) {
        const running = [...jobs.values()].some(job => job.state === 'running')
        if (running) {
          await followJobs()
        }
        // The list every five seconds, faster while something happens.
        if (running || ticks % 4 === 0) {
          await refresh()
        }
      } else {
        await checkEngines(true)
        await refresh()
      }
    }
    timer = setTimeout(() => void tick(), engineRunning.value ? 1500 : 3000)
  }

  onMounted(async () => {
    await checkEngines(true)
    await refresh()
    timer = setTimeout(() => void tick(), 1500)
  })

  onBeforeUnmount(() => clearTimeout(timer))
</script>
