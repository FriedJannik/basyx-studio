<template>
  <v-card class="mx-auto w-100" data-test="wizard" max-width="800">
    <v-card-item class="py-2" prepend-icon="mdi-server-plus-outline">
      <v-card-title class="text-title-medium">{{ heading }}</v-card-title>
    </v-card-item>

    <v-divider />

    <div :aria-label="t('wizard.progress')" class="d-flex flex-wrap align-center ga-2 px-3 pt-3 mb-2" role="group">
      <v-chip
        v-for="item in steps"
        :key="item.title"
        :aria-current="step === item.value ? 'step' : undefined"
        :color="step === item.value ? 'primary' : undefined"
        :prepend-icon="step > item.value ? 'mdi-check' : undefined"
        :text="`${item.value}. ${item.title}`"
      />
    </div>

    <v-card-text class="py-2">
      <!-- Step 1: preset and, for secured instances, the access model. -->
      <template v-if="step === 1">
        <v-radio-group v-model="preset" hide-details>
          <v-row density="compact">
            <v-col v-for="option in selectablePresets" :key="option" cols="12" sm="6">
              <v-card
                :class="{ 'border-primary': preset === option }"
                :color="preset === option ? 'primary' : undefined"
                height="100%"
                :variant="preset === option ? 'tonal' : undefined"
              >
                <v-radio class="align-start pa-3 w-100" :data-test="`preset-${option}`" :value="option">
                  <template #label>
                    <div class="ml-1">
                      <div class="d-flex flex-wrap align-center ga-2 mb-1">
                        <v-icon :icon="presetIcons[option]" size="small" />
                        <span class="font-weight-medium">{{ t(`preset.${option}`) }}</span>
                        <v-chip v-if="option === 'quick'" color="success" size="x-small" :text="t('preset.recommended')" />
                      </div>

                      <div class="text-body-small text-medium-emphasis text-wrap">{{ t(`preset.${option}Text`) }}</div>
                    </div>
                  </template>
                </v-radio>
              </v-card>
            </v-col>
          </v-row>
        </v-radio-group>

        <template v-if="spec.security.mode === 'keycloak'">
          <div class="mt-4 mb-3">
            <div class="text-subtitle-2">{{ t('access.title') }}</div>
            <div class="text-body-small text-medium-emphasis">{{ t('access.hint') }}</div>
          </div>

          <v-radio-group v-model="access" hide-details>
            <v-row density="compact">
              <v-col v-for="option in accessModels" :key="option" cols="12" sm="6">
                <v-card
                  :class="{ 'border-primary': access === option }"
                  :color="access === option ? 'primary' : undefined"
                  height="100%"
                  :variant="access === option ? 'tonal' : undefined"
                >
                  <v-radio class="align-start pa-3 w-100" :data-test="`access-${option}`" :value="option">
                    <template #label>
                      <div class="ml-1 w-100">
                        <div class="d-flex flex-wrap align-center ga-2 mb-1">
                          <v-icon :icon="accessModelDetails[option].icon" size="small" />
                          <span class="font-weight-medium">{{ t(`access.${option}`) }}</span>
                          <v-chip size="x-small" :text="t(`access.${option}Technology`)" />
                        </div>

                        <p class="text-body-small text-medium-emphasis text-wrap mb-3">
                          {{ t(`access.${option}Text`) }}
                        </p>

                        <v-divider class="mb-3" />

                        <dl>
                          <div class="mb-3">
                            <dt class="text-caption text-medium-emphasis mb-1">{{ t('access.includedUsers') }}</dt>
                            <dd class="text-body-small ms-0">{{ t(`access.${option}Users`) }}</dd>
                          </div>

                          <div class="mb-3">
                            <dt class="text-caption text-medium-emphasis mb-1">{{ t('access.permissions') }}</dt>

                            <dd
                              v-for="permission in accessModelDetails[option].permissions"
                              :key="permission"
                              class="d-flex align-start ga-2 text-body-small ms-0 mb-1"
                            >
                              <v-icon class="mt-1" icon="mdi-check" size="x-small" />
                              <span>{{ t(`access.${permission}`) }}</span>
                            </dd>
                          </div>

                          <div>
                            <dt class="text-caption text-medium-emphasis mb-1">{{ t('access.bestFor') }}</dt>
                            <dd class="text-body-small ms-0">{{ t(`access.${option}UseCase`) }}</dd>
                          </div>
                        </dl>
                      </div>
                    </template>
                  </v-radio>
                </v-card>
              </v-col>
            </v-row>
          </v-radio-group>
        </template>
      </template>

      <!-- Step 2: name and startup files; optional settings stay out of the main path. -->
      <template v-else-if="step === 2">
        <v-text-field
          v-model="spec.name"
          data-test="name"
          density="compact"
          :hint="t('wizard.nameHint')"
          :label="t('wizard.name')"
          persistent-hint
          :rules="[nameRule]"
        />

        <div class="text-subtitle-2 mt-4 mb-2">
          {{ t('wizard.aasx') }}
          <v-btn-secondary
            class="ml-2"
            data-test="add-aasx"
            density="compact"
            prepend-icon="mdi-plus"
            :text="t('wizard.aasxAdd')"
            @click="pickFiles"
          />
        </div>

        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <v-chip
            v-for="name in keptFiles"
            :key="name"
            closable
            prepend-icon="mdi-package-variant-closed"
            :text="name"
            @click:close="keptFiles = keptFiles.filter(item => item !== name)"
          />

          <v-chip
            v-for="file in pickedFiles"
            :key="file.handle"
            closable
            prepend-icon="mdi-package-variant-closed"
            :text="file.fileName"
            @click:close="pickedFiles = pickedFiles.filter(item => item !== file)"
          />

          <span v-if="keptFiles.length + pickedFiles.length === 0" class="text-body-2 text-medium-emphasis">{{ t('wizard.aasxNone') }}</span>

        </div>

        <v-expansion-panels class="mt-2">
          <v-expansion-panel data-test="advanced">
            <v-expansion-panel-title>
              <div>
                <div class="font-weight-medium">{{ t('wizard.advanced') }}</div>
                <div class="text-body-small text-medium-emphasis">{{ t('wizard.advancedHint') }}</div>
              </div>
            </v-expansion-panel-title>

            <v-expansion-panel-text>
              <v-row density="compact">
                <v-col cols="12">
                  <v-card>
                    <v-card-item class="pb-0" prepend-icon="mdi-server-network-outline">
                      <v-card-title class="text-subtitle-2">{{ t('wizard.services') }}</v-card-title>
                      <v-card-subtitle class="text-wrap">{{ t('wizard.servicesHint') }}</v-card-subtitle>
                    </v-card-item>

                    <v-card-text class="pt-2 pb-3">
                      <v-select
                        v-model="spec.topology"
                        :items="topologyOptions"
                        :label="t('wizard.topology')"
                      />

                      <div class="text-body-small text-medium-emphasis mt-2 mb-1">{{ t('wizard.features') }}</div>

                      <v-row density="compact">
                        <v-col class="py-0" cols="12" sm="6">
                          <v-checkbox v-model="spec.features.history" :label="t('wizard.history')" />
                        </v-col>

                        <v-col class="py-0" cols="12" sm="6">
                          <v-checkbox v-model="spec.features.eventFeed" :label="t('wizard.eventFeed')" />
                        </v-col>

                        <v-col class="py-0" cols="12" sm="6">
                          <v-checkbox
                            v-model="spec.features.registrySync"
                            :disabled="spec.topology === 'separate'"
                            :label="t('wizard.registrySync')"
                          />
                        </v-col>

                        <v-col class="py-0" cols="12" sm="6">
                          <v-checkbox v-model="spec.features.discoverySync" :label="t('wizard.discoverySync')" />
                        </v-col>
                      </v-row>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-card height="100%">
                    <v-card-item class="pb-0" prepend-icon="mdi-database-outline">
                      <v-card-title class="text-subtitle-2">{{ t('wizard.storage') }}</v-card-title>
                      <v-card-subtitle class="text-wrap">{{ t('wizard.storageHint') }}</v-card-subtitle>
                    </v-card-item>

                    <v-card-text class="pt-2 pb-3">
                      <v-checkbox v-model="persistentVolume" :label="t('wizard.persistentVolume')" />
                      <p class="text-body-small text-medium-emphasis mt-1">{{ t('wizard.persistentVolumeHint') }}</p>
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-card height="100%">
                    <v-card-item class="pb-0" prepend-icon="mdi-update">
                      <v-card-title class="text-subtitle-2">{{ t('wizard.runtime') }}</v-card-title>
                      <v-card-subtitle class="text-wrap">{{ t('wizard.runtimeHint') }}</v-card-subtitle>
                    </v-card-item>

                    <v-card-text class="pt-2 pb-3">
                      <v-select
                        v-model="spec.images.channel"
                        :items="imageOptions"
                        :label="t('wizard.images')"
                      />

                      <v-checkbox v-model="restartAlways" :label="t('wizard.restart')" />
                    </v-card-text>
                  </v-card>
                </v-col>

                <v-col cols="12">
                  <v-card>
                    <v-card-item class="pb-0" prepend-icon="mdi-lan">
                      <v-card-title class="text-subtitle-2">{{ t('wizard.network') }}</v-card-title>
                      <v-card-subtitle class="text-wrap">{{ t('wizard.networkHint') }}</v-card-subtitle>
                    </v-card-item>

                    <v-card-text class="pt-2 pb-3">
                      <v-row density="compact">
                        <v-col cols="12" sm="6">
                          <v-select
                            v-model="portMode"
                            :items="portOptions"
                            :label="t('wizard.ports')"
                          />

                          <v-number-input
                            v-if="portMode === 'fixed'"
                            v-model="basePort"
                            control-variant="hidden"
                            density="compact"
                            :hint="t('wizard.basePortHint')"
                            :label="t('wizard.basePort')"
                            :max="64000"
                            :min="1024"
                            persistent-hint
                          />
                        </v-col>

                        <v-col class="d-flex flex-column justify-center" cols="12" sm="6">
                          <v-checkbox v-model="network" :label="t('wizard.exposure')" />

                          <v-alert
                            v-if="network"
                            class="mt-2"
                            density="compact"
                            :text="t('wizard.exposureWarning')"
                            type="warning"
                          />
                        </v-col>
                      </v-row>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </template>

      <!-- Step 3: what will happen, in plain words. -->
      <template v-else>
        <v-alert v-if="importInfo?.notes.length" class="mb-4" :title="t('wizard.importNotes')" type="info">
          <ul class="ps-4">
            <li v-for="note in importInfo.notes" :key="note">{{ t(`wizard.note_${note}`) }}</li>
          </ul>
        </v-alert>

        <v-progress-linear v-if="planning" />

        <template v-else-if="plan">
          <p class="text-body-1 mb-2" data-test="summary">{{ summary }}</p>

          <p v-if="plan.portsInUse.length === 0" class="text-body-2 text-medium-emphasis mb-2">
            {{ plan.downloadMb ? t('wizard.download', { size: plan.downloadMb }) : t('wizard.downloadNone') }}
          </p>

          <v-alert v-else class="mb-2" :text="t('wizard.portsInUse', { ports: plan.portsInUse.join(', ') })" type="warning" />

          <div class="text-subtitle-2 mt-4">{{ t('wizard.addresses') }}</div>

          <v-list :lines="false">
            <v-list-item v-for="address in addresses" :key="address.url" :subtitle="address.url" :title="address.title" />
          </v-list>
        </template>

      </template>

      <ErrorAlert v-if="error" class="mt-2" :error="error">
        <template v-if="retry" #actions>
          <v-btn :text="t('problem.retry')" @click="retry" />
        </template>
      </ErrorAlert>
    </v-card-text>

    <v-card-actions class="pt-0">
      <v-btn :text="t('wizard.cancel')" @click="emit('cancel')" />
      <v-spacer />
      <v-btn v-if="step > 1" prepend-icon="mdi-chevron-left" :text="t('wizard.back')" @click="step--" />

      <v-btn-primary
        v-if="step < 3"
        append-icon="mdi-chevron-right"
        data-test="next"
        :disabled="step === 2 && Boolean(nameProblem)"
        :text="t('wizard.next')"
        @click="step++"
      />

      <v-btn-primary
        v-else
        data-test="submit"
        :disabled="!plan || plan.portsInUse.length > 0"
        :loading="submitting"
        prepend-icon="mdi-play"
        :text="stack ? t('wizard.apply') : t('wizard.start')"
        @click="submit"
      />
    </v-card-actions>
  </v-card>
</template>

<script lang="ts" setup>
  import type { Job, PickedFile, Stack, StackImport, StackPlan, StackSpec } from '@basyx/studio-sdk'
  import { computed, reactive, ref, watch } from 'vue'
  import ErrorAlert from './ErrorAlert.vue'
  import { useI18n } from './i18n'
  import { cloneSpec, nextStackName, presetIcons, presetSpec, selectablePresets, stackNameProblem, useClient } from './support'

  const props = defineProps<{ existing: string[], stack: Stack | null, importInfo: StackImport | null }>()
  const emit = defineEmits<{ done: [job: Job], cancel: [] }>()
  const { t } = useI18n()
  const client = useClient()

  const accessModels = ['roles', 'sharing'] as const
  const accessModelDetails = {
    roles: {
      icon: 'mdi-account-key-outline',
      permissions: ['rolesAdmin', 'rolesViewer'],
    },
    sharing: {
      icon: 'mdi-share-variant-outline',
      permissions: ['sharingOwner', 'sharingAdmin'],
    },
  } as const
  const initial: StackSpec = props.stack?.spec ?? props.importInfo?.spec ?? presetSpec('quick', nextStackName(props.existing))
  const spec = reactive<StackSpec>(cloneSpec(initial))
  const step = ref(props.importInfo ? 3 : 1)
  const keptFiles = ref<string[]>(props.stack ? [...initial.aasxFiles] : [])
  const pickedFiles = ref<PickedFile[]>([])
  const plan = ref<StackPlan | null>(null)
  const planning = ref(false)
  const submitting = ref(false)
  const error = ref<unknown | null>(null)
  const retry = ref<(() => Promise<void>) | null>(null)
  const steps = computed(() => [
    { value: 1, title: t('wizard.stepWhat') },
    { value: 2, title: t('wizard.stepName') },
    { value: 3, title: t('wizard.stepCheck') },
  ])
  const nameProblem = computed(() => stackNameProblem(spec.name, props.existing, props.stack?.name))
  const topologyOptions = computed(() => [
    { title: t('wizard.topologySingle'), value: 'single' },
    { title: t('wizard.topologySeparate'), value: 'separate' },
  ])
  const portOptions = computed(() => [
    { title: t('wizard.portsAuto'), value: 'auto' },
    { title: t('wizard.portsFixed'), value: 'fixed' },
  ])
  const imageOptions = computed(() => [
    { title: t('wizard.imagesTested'), value: 'tested' },
    { title: t('wizard.imagesLatest'), value: 'latest' },
  ])

  function nameRule (): string | true {
    return nameProblem.value ? t(`wizard.name${nameProblem.value === 'required' ? 'Required' : 'Duplicate'}`) : true
  }

  const heading = computed(() => {
    if (props.stack) {
      return t('wizard.changeTitle', { name: props.stack.name })
    }
    return props.importInfo ? t('wizard.importTitle', { name: initial.name }) : t('list.new')
  })

  // Choosing a preset sets its services and sign-in; name, data and files stay.
  const preset = computed({
    get: () => spec.preset,
    set: (value: StackSpec['preset']) => {
      const defaults = presetSpec(value, spec.name)
      spec.preset = value
      spec.topology = defaults.topology
      spec.security = defaults.security
    },
  })
  const access = computed({
    get: () => spec.security.mode === 'keycloak' ? spec.security.access : 'roles',
    set: (value: 'roles' | 'sharing') => {
      spec.security = { mode: 'keycloak', access: value }
    },
  })
  const portMode = ref<'auto' | 'fixed'>(initial.network.basePort !== null && !props.stack ? 'fixed' : 'auto')
  const basePort = ref<number>(initial.network.basePort ?? 18_100)
  const network = computed({
    get: () => spec.network.exposure === 'network',
    set: (value: boolean) => {
      spec.network.exposure = value ? 'network' : 'local'
    },
  })
  const restartAlways = computed({
    get: () => spec.restart === 'always',
    set: (value: boolean) => {
      spec.restart = value ? 'always' : 'manual'
    },
  })
  const persistentVolume = computed({
    get: () => spec.persistence === 'keep',
    set: (value: boolean) => {
      spec.persistence = value ? 'keep' : 'ephemeral'
    },
  })

  /** The spec as sent: ports per the chosen mode, the files that stay. */
  function currentSpec (): StackSpec {
    const keepPorts = props.stack && portMode.value === 'auto' ? props.stack.spec?.network.basePort ?? null : null
    return {
      ...cloneSpec(spec),
      name: spec.name.trim(),
      network: { exposure: spec.network.exposure, basePort: portMode.value === 'fixed' ? basePort.value : keepPorts },
      aasxFiles: props.stack ? [...keptFiles.value] : [],
    }
  }

  const addresses = computed(() => {
    const urls = plan.value?.urls
    if (!urls) {
      return []
    }
    return ([
      ['environment', urls.environment],
      ['aasRegistry', urls.aasRegistry],
      ['submodelRegistry', urls.submodelRegistry],
      ['discovery', urls.discovery],
      ['keycloak', urls.keycloak],
    ] as const).filter(([, url]) => url).map(([component, url]) => ({ title: t(`component.${component}`), url: url! }))
  })

  const summary = computed(() => {
    const sentences = [t(spec.topology === 'separate' ? 'wizard.summaryFull' : 'wizard.summaryQuick', { name: spec.name.trim() })]
    if (spec.security.mode === 'keycloak') {
      sentences.push(t('wizard.summarySecured', { access: t(spec.security.access === 'roles' ? 'wizard.summaryRoles' : 'wizard.summarySharing') }))
    }
    sentences.push(t(spec.persistence === 'keep' ? 'wizard.summaryData' : 'wizard.summaryEphemeral'))
    const files = keptFiles.value.length + pickedFiles.value.length + (props.importInfo?.aasxFiles.length ?? 0)
    if (files > 0) {
      sentences.push(t('wizard.summaryAasx', { count: files }))
    }
    return sentences.join(' ')
  })

  async function loadPlan () {
    planning.value = true
    error.value = null
    retry.value = null
    plan.value = null
    try {
      plan.value = await client.containers.planStack(currentSpec(), props.stack?.id)
    } catch (error_) {
      error.value = error_
      retry.value = loadPlan
    } finally {
      planning.value = false
    }
  }

  watch(step, value => {
    if (value === 3) {
      void loadPlan()
    }
  }, { immediate: true })

  async function pickFiles () {
    error.value = null
    retry.value = null
    try {
      const { files } = await client.containers.pickAasxFiles()
      pickedFiles.value = [...pickedFiles.value, ...files]
    } catch (error_) {
      error.value = error_
      retry.value = pickFiles
    }
  }

  async function submit () {
    if (!plan.value) {
      return
    }
    submitting.value = true
    error.value = null
    retry.value = null
    try {
      // The planned spec carries the ports Studio picked.
      const next = { ...cloneSpec(plan.value.spec), aasxFiles: currentSpec().aasxFiles }
      const handles = pickedFiles.value.map(file => file.handle)
      const result = props.stack
        ? await client.containers.changeStack({ stackId: props.stack.id, spec: next, aasxFiles: handles })
        : await client.containers.createStack({ spec: next, aasxFiles: handles, ...(props.importInfo ? { importId: props.importInfo.importId } : {}) })
      emit('done', result.job)
    } catch (error_) {
      error.value = error_
      retry.value = submit
    } finally {
      submitting.value = false
    }
  }
</script>
