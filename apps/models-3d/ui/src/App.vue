<template>
  <v-app>
    <!-- Studio's card shows the view's title. Layout of the BaSyx AAS Web UI's
         Models3D plugin: models, the selected version, viewer and summary
         (side by side in a wide frame), then the technical details. -->
    <v-view-card>
      <v-progress-linear v-if="loading" />

      <v-alert v-else-if="error" class="ma-4" :text="error" type="error" />

      <v-card-text v-else-if="models.length === 0" class="text-medium-emphasis" data-test="no-models">{{ t('model.none') }}</v-card-text>

      <div v-else class="d-flex flex-column ga-4 pa-4">
        <ModelSwitcher
          v-if="models.length > 1"
          :client="client"
          :models="models"
          :selected-key="selected?.key ?? ''"
          :submodel-id="submodelId"
          @select="key => (selectedKey = key)"
        />

        <template v-if="selected">
          <div class="d-flex flex-wrap align-center ga-2">
            <span class="text-title-small text-break" data-test="model-title">{{ title }}</span>

            <v-chip
              v-if="version?.status"
              :color="statusColor(version.status)"
              size="x-small"
              :text="listValue(t, 'status', version.status)"
            />

            <v-spacer />
            <VersionMenu :selected="version" :versions="selected.versions" @select="key => (versionKeys[selected!.key] = key)" />
          </div>

          <v-row dense>
            <v-col cols="12" md="7">
              <ViewerCard
                :key="version?.key ?? selected.key"
                :client="client"
                :fullscreen="fullscreen"
                :submodel-id="submodelId"
                :theme="theme"
                :title="title"
                :version="version"
                @download="path => client.ui.openFile(submodelId, path, true)"
                @fullscreen="openFullscreen"
                @open="openExternal"
              />
            </v-col>

            <v-col cols="12" md="5">
              <ModelSummary :model="selected" />
            </v-col>
          </v-row>

          <TechnicalDetails :groups="groups" @open="openExternal" />
        </template>
      </div>
    </v-view-card>
  </v-app>
</template>

<script lang="ts" setup>
  import type { Model3DEntry } from './models3d'
  import type { AppContext, StudioClient } from '@basyx/studio-sdk'
  import { viewerThemeOf } from '@basyx/model-viewer'
  import { StudioError } from '@basyx/studio-sdk'
  import { computed, onMounted, reactive, ref } from 'vue'
  import { loadSubmodel } from '../../../shared/app'
  import { provideI18n } from './i18n'
  import { latestVersion, parseModels3D, sortModels, versionTitle } from './models3d'
  import ModelSummary from './ModelSummary.vue'
  import ModelSwitcher from './ModelSwitcher.vue'
  import { listValue, statusColor, technicalGroups } from './presentation'
  import TechnicalDetails from './TechnicalDetails.vue'
  import VersionMenu from './VersionMenu.vue'
  import ViewerCard from './ViewerCard.vue'

  // The 3D models of an asset (IDTA 02026-1-0, Provision of 3D Models).
  const props = defineProps<{ client: StudioClient }>()

  const { t, locale } = provideI18n(props.client)

  const context = ref<AppContext>(props.client.context)
  props.client.onContext(value => {
    context.value = value
  })
  const submodelId = computed(() => context.value.submodel!.id)
  const fullscreen = computed(() => context.value.fullscreen)
  const theme = computed(() => viewerThemeOf(context.value.theme.colors, context.value.theme.dark))

  const loading = ref(true)
  const error = ref<string | null>(null)
  const models = ref<Model3DEntry[]>([])
  /** What the full-screen view opens with: the selected model and the chosen versions. */
  interface ViewState {
    model: string
    versions: Record<string, string>
  }

  const selectedKey = ref('')
  /** The chosen version per model; the latest otherwise. */
  const versionKeys = reactive<Record<string, string>>({})

  const selected = computed(() => models.value.find(model => model.key === selectedKey.value) ?? models.value[0])
  const version = computed(() => {
    const model = selected.value
    return model ? model.versions.find(entry => entry.key === versionKeys[model.key]) ?? latestVersion(model.versions) : undefined
  })
  const title = computed(() => (selected.value ? versionTitle(version.value, selected.value, models.value.indexOf(selected.value), locale.value) : ''))
  const groups = computed(() => (selected.value ? technicalGroups(t, selected.value, version.value, locale.value) : []))

  function openExternal (url: string) {
    void props.client.ui.openExternal(url).catch(() => {
      // Not https, or not from a click: nothing opens.
    })
  }

  /** Full screen shows the same model and version (`context.viewState`). */
  function openFullscreen () {
    const state: ViewState = { model: selected.value?.key ?? '', versions: { ...versionKeys } }
    void props.client.ui.openFullscreen(JSON.stringify(state))
  }

  function restore (viewState: string) {
    try {
      const state = JSON.parse(viewState) as Partial<ViewState>
      selectedKey.value = typeof state.model === 'string' ? state.model : ''
      for (const [model, versionKey] of Object.entries(state.versions ?? {})) {
        if (typeof versionKey === 'string') {
          versionKeys[model] = versionKey
        }
      }
    } catch {
      // Not ours, or empty: the first model in its latest version.
    }
  }

  onMounted(async () => {
    try {
      models.value = sortModels(parseModels3D(await loadSubmodel(props.client)))
      restore(context.value.viewState ?? '')
    } catch (error_) {
      error.value = error_ instanceof StudioError ? error_.message : String(error_)
    } finally {
      loading.value = false
    }
  })
</script>
