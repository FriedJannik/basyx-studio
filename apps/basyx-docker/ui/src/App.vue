<template>
  <v-app>
    <div class="pa-4 d-flex flex-column ga-4">
      <div class="d-flex flex-wrap align-center ga-3">
        <v-icon color="primary" icon="mdi-docker" size="36" />

        <div class="flex-grow-1">
          <div class="text-h6">{{ t('app.title') }}</div>
          <div class="text-body-2 text-medium-emphasis">{{ t('app.subtitle') }}</div>
        </div>

        <EngineStatus v-if="engines" :engines="engines" @select="selectEngine" />
      </div>

      <v-progress-linear v-if="!engines" />

      <EngineMissing v-else-if="!engineRunning" :checking="checking" :engines="engines" @check="checkEngines(true)" />

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
        <div class="d-flex flex-wrap align-center ga-2">
          <div class="text-subtitle-1 flex-grow-1">{{ t('list.title') }}</div>
          <v-btn data-test="import" prepend-icon="mdi-import" :text="t('list.import')" @click="importStack" />
          <v-btn-primary data-test="new" prepend-icon="mdi-plus" :text="t('list.new')" @click="openWizard()" />
        </div>

        <v-alert
          v-if="actionError"
          closable
          :text="actionError"
          type="error"
          @click:close="actionError = null"
        />

        <v-empty-state
          v-if="list.items.length === 0"
          :headline="t('list.emptyTitle')"
          icon="mdi-server-plus-outline"
          :text="t('list.emptyText')"
        >
          <template #actions>
            <v-btn-primary prepend-icon="mdi-plus" size="large" :text="t('list.new')" @click="openWizard()" />
          </template>
        </v-empty-state>

        <InstanceCard
          v-for="stack in list.items"
          :key="stack.id"
          :job="jobs.get(stack.id) ?? null"
          :stack="stack"
          @change="openWizard(stack)"
          @dismiss-job="dismissJob(stack.id)"
          @job="track"
        />
      </template>
    </div>
  </v-app>
</template>

<script lang="ts" setup>
  import type { Engines, Job, Stack, StackImport, StackList, StudioClient } from '@basyx/studio-sdk'
  import { computed, onBeforeUnmount, onMounted, provide, reactive, ref } from 'vue'
  import EngineMissing from './EngineMissing.vue'
  import EngineStatus from './EngineStatus.vue'
  import { provideI18n } from './i18n'
  import InstanceCard from './InstanceCard.vue'
  import NewInstanceWizard from './NewInstanceWizard.vue'
  import { clientKey, problemOf, problemText } from './support'

  // BaSyx Docker (ADR 0033): finds Docker or Podman, lists the instances,
  // and follows their jobs. All work happens in the Studio Service.
  const props = defineProps<{ client: StudioClient }>()
  provide(clientKey, props.client)
  const { t } = provideI18n(props.client)
  const containers = props.client.containers

  const engines = ref<Engines | null>(null)
  const checking = ref(false)
  const list = ref<StackList | null>(null)
  const actionError = ref<string | null>(null)
  /** The running or last finished job per stack. */
  const jobs = reactive(new Map<string, Job>())
  const wizard = ref<{ key: number, stack: Stack | null, importInfo: StackImport | null } | null>(null)

  const engineRunning = computed(() => Boolean(engines.value?.selected?.running))
  const existingNames = computed(() => list.value?.items.map(stack => stack.name) ?? [])

  async function checkEngines (fresh = false) {
    checking.value = true
    try {
      engines.value = fresh || !engines.value ? await containers.listEngines() : engines.value
    } catch {
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
      actionError.value = problemText(t, problemOf(error))
    }
  }

  async function refresh () {
    if (!engineRunning.value) {
      return
    }
    try {
      list.value = await containers.listStacks()
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
      } catch {
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
      actionError.value = problemText(t, problemOf(error))
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
