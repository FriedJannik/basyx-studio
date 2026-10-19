<template>
  <v-card data-test="wizard">
    <v-card-item prepend-icon="mdi-server-plus-outline">
      <v-card-title>{{ heading }}</v-card-title>
    </v-card-item>

    <v-stepper v-model="step" flat hide-actions mobile-breakpoint="sm">
      <v-stepper-header>
        <v-stepper-item :complete="step > 1" :title="t('wizard.stepWhat')" :value="1" />
        <v-divider />
        <v-stepper-item :complete="step > 2" :title="t('wizard.stepName')" :value="2" />
        <v-divider />
        <v-stepper-item :title="t('wizard.stepCheck')" :value="3" />
      </v-stepper-header>
    </v-stepper>

    <v-card-text>
      <!-- Step 1: preset and, for secured instances, the access model. -->
      <template v-if="step === 1">
        <v-item-group v-model="preset" mandatory>
          <v-row>
            <v-col v-for="option in presets" :key="option" cols="12" md="4">
              <v-item v-slot="{ isSelected, toggle }" :value="option">
                <v-card
                  class="h-100"
                  :color="isSelected ? 'primary' : undefined"
                  :data-test="`preset-${option}`"
                  :variant="isSelected ? 'tonal' : undefined"
                  @click="toggle"
                >
                  <v-card-item :prepend-icon="presetIcons[option]">
                    <v-card-title>{{ t(`preset.${option}`) }}</v-card-title>

                    <template v-if="option === 'quick'" #append>
                      <v-chip color="success" :text="t('preset.recommended')" />
                    </template>
                  </v-card-item>

                  <v-card-text>{{ t(`preset.${option}Text`) }}</v-card-text>
                </v-card>
              </v-item>
            </v-col>
          </v-row>
        </v-item-group>

        <template v-if="spec.security.mode === 'keycloak'">
          <div class="text-subtitle-1 mt-6 mb-2">{{ t('access.title') }}</div>

          <v-item-group v-model="access" mandatory>
            <v-row>
              <v-col v-for="option in accessModels" :key="option" cols="12" md="6">
                <v-item v-slot="{ isSelected, toggle }" :value="option">
                  <v-card
                    class="h-100"
                    :color="isSelected ? 'primary' : undefined"
                    :data-test="`access-${option}`"
                    :variant="isSelected ? 'tonal' : undefined"
                    @click="toggle"
                  >
                    <v-card-item :prepend-icon="option === 'roles' ? 'mdi-account-group-outline' : 'mdi-share-variant-outline'">
                      <v-card-title>{{ t(`access.${option}`) }}</v-card-title>
                    </v-card-item>

                    <v-card-text>{{ t(`access.${option}Text`) }}</v-card-text>
                  </v-card>
                </v-item>
              </v-col>
            </v-row>
          </v-item-group>
        </template>
      </template>

      <!-- Step 2: name, data and files; the rest under Advanced. -->
      <template v-else-if="step === 2">
        <v-text-field
          v-model="spec.name"
          data-test="name"
          :hint="t('wizard.nameHint')"
          :label="t('wizard.name')"
          persistent-hint
          :rules="[value => Boolean(value?.trim()) || t('wizard.nameRequired')]"
        />

        <v-radio-group v-model="spec.persistence" class="mt-4">
          <v-radio v-for="option in persistenceOptions" :key="option" :value="option">
            <template #label>
              <div>
                <div>{{ t(`persistence.${option}`) }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ t(`persistence.${option}Text`) }}</div>
              </div>
            </template>
          </v-radio>
        </v-radio-group>

        <div class="text-subtitle-2 mb-2">{{ t('wizard.aasx') }}</div>

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

          <v-btn
            data-test="add-aasx"
            prepend-icon="mdi-plus"
            :text="t('wizard.aasxAdd')"
            variant="outlined"
            @click="pickFiles"
          />
        </div>

        <v-expansion-panels>
          <v-expansion-panel data-test="advanced" :title="t('wizard.advanced')">
            <v-expansion-panel-text>
              <div class="text-subtitle-2">{{ t('wizard.topology') }}</div>

              <v-radio-group v-model="spec.topology" density="compact" hide-details>
                <v-radio :label="t('wizard.topologySingle')" value="single" />
                <v-radio :label="t('wizard.topologySeparate')" value="separate" />
              </v-radio-group>

              <v-switch
                v-model="spec.features.history"
                :label="t('wizard.history')"
              />

              <v-switch
                v-model="spec.features.eventFeed"
                :label="t('wizard.eventFeed')"
              />

              <v-switch
                v-model="spec.features.registrySync"
                :disabled="spec.topology === 'separate'"
                :label="t('wizard.registrySync')"
              />

              <v-switch
                v-model="spec.features.discoverySync"
                :label="t('wizard.discoverySync')"
              />

              <div class="text-subtitle-2 mt-4">{{ t('wizard.ports') }}</div>

              <v-radio-group v-model="portMode" density="compact" hide-details inline>
                <v-radio :label="t('wizard.portsAuto')" value="auto" />
                <v-radio :label="t('wizard.portsFixed')" value="fixed" />
              </v-radio-group>

              <v-number-input
                v-if="portMode === 'fixed'"
                v-model="basePort"
                class="mt-2"
                control-variant="hidden"
                density="compact"
                :hint="t('wizard.basePortHint')"
                :label="t('wizard.basePort')"
                :max="64000"
                max-width="240"
                :min="1024"
                persistent-hint
              />

              <v-switch
                v-model="network"
                :label="t('wizard.exposure')"
              />

              <v-alert
                v-if="network"
                class="my-2"
                density="compact"
                :text="t('wizard.exposureWarning')"
                type="warning"
              />

              <div class="text-subtitle-2 mt-4">{{ t('wizard.images') }}</div>

              <v-radio-group v-model="spec.images.channel" density="compact" hide-details>
                <v-radio :label="t('wizard.imagesTested')" value="tested" />
                <v-radio :label="t('wizard.imagesLatest')" value="latest" />
              </v-radio-group>

              <v-switch
                v-model="restartAlways"
                :label="t('wizard.restart')"
              />
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

          <v-list density="compact" :lines="false">
            <v-list-item v-for="address in addresses" :key="address.url" :subtitle="address.url" :title="address.title" />
          </v-list>
        </template>

        <v-alert v-if="error" class="mt-2" :text="error" type="error" />
      </template>
    </v-card-text>

    <v-card-actions>
      <v-btn :text="t('wizard.cancel')" @click="emit('cancel')" />
      <v-spacer />
      <v-btn v-if="step > 1" prepend-icon="mdi-chevron-left" :text="t('wizard.back')" @click="step--" />

      <v-btn-primary
        v-if="step < 3"
        append-icon="mdi-chevron-right"
        data-test="next"
        :disabled="step === 2 && !spec.name.trim()"
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
  import { useI18n } from './i18n'
  import { cloneSpec, presetIcons, presetSpec, problemOf, problemText, useClient } from './support'

  const props = defineProps<{ existing: string[], stack: Stack | null, importInfo: StackImport | null }>()
  const emit = defineEmits<{ done: [job: Job], cancel: [] }>()
  const { t } = useI18n()
  const client = useClient()

  const presets = ['quick', 'full', 'secured'] as const
  const accessModels = ['roles', 'sharing'] as const
  const persistenceOptions = ['keep', 'ephemeral'] as const

  function defaultName (): string {
    for (let index = 1; ; index++) {
      const name = `BaSyx ${index}`
      if (!props.existing.includes(name)) {
        return name
      }
    }
  }

  const initial: StackSpec = props.stack?.spec ?? props.importInfo?.spec ?? presetSpec('quick', defaultName())
  const spec = reactive<StackSpec>(cloneSpec(initial))
  const step = ref(props.importInfo ? 3 : 1)
  const keptFiles = ref<string[]>(props.stack ? [...initial.aasxFiles] : [])
  const pickedFiles = ref<PickedFile[]>([])
  const plan = ref<StackPlan | null>(null)
  const planning = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)

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
    plan.value = null
    try {
      plan.value = await client.containers.planStack(currentSpec(), props.stack?.id)
    } catch (error_) {
      error.value = problemText(t, problemOf(error_))
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
    const { files } = await client.containers.pickAasxFiles()
    pickedFiles.value = [...pickedFiles.value, ...files]
  }

  async function submit () {
    if (!plan.value) {
      return
    }
    submitting.value = true
    error.value = null
    try {
      // The planned spec carries the ports Studio picked.
      const next = { ...cloneSpec(plan.value.spec), aasxFiles: currentSpec().aasxFiles }
      const handles = pickedFiles.value.map(file => file.handle)
      const result = props.stack
        ? await client.containers.changeStack({ stackId: props.stack.id, spec: next, aasxFiles: handles })
        : await client.containers.createStack({ spec: next, aasxFiles: handles, ...(props.importInfo ? { importId: props.importInfo.importId } : {}) })
      emit('done', result.job)
    } catch (error_) {
      error.value = problemText(t, problemOf(error_))
    } finally {
      submitting.value = false
    }
  }
</script>
