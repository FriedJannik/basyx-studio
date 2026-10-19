<template>
  <div class="d-flex flex-column ga-2">
    <v-sheet border class="overflow-hidden" data-test="viewer-card" rounded="lg">
      <v-responsive :aspect-ratio="4 / 3" max-height="560" min-height="260">
        <!-- The canvas fills the box; absolute, so its pixel size never stretches it. -->
        <div v-show="showModel" ref="host" class="position-absolute top-0 left-0 w-100 h-100" data-test="viewer-canvas" />

        <div v-if="!showModel" class="d-flex flex-column align-center justify-center h-100 w-100">
          <PreviewImage
            :alt="title"
            :client="client"
            contain
            :file="version?.preview ?? null"
            icon-size="64"
            :submodel-id="submodelId"
          />
        </div>

        <div
          v-if="showModel && (viewer.status.value === 'downloading' || viewer.status.value === 'processing')"
          class="position-absolute top-0 left-0 w-100 h-100 d-flex flex-column align-center justify-center ga-3 bg-surface text-medium-emphasis"
        >
          <v-progress-circular :indeterminate="viewer.progress.value === null" :model-value="(viewer.progress.value ?? 0) * 100" />
          <span class="text-body-medium">{{ viewer.status.value === 'downloading' ? t('viewer.loading') : t('viewer.processing') }}</span>
        </div>

        <v-chip
          v-if="formatText"
          class="position-absolute top-0 left-0 ma-2"
          color="surface"
          :text="formatText"
          variant="flat"
        />

        <v-chip
          v-if="viewer.problem.value && !showImage && !externalFailed"
          class="position-absolute bottom-0 left-0 ma-2"
          color="warning"
          prepend-icon="mdi-alert-outline"
          :text="t('viewer.failed')"
          variant="elevated"
        />

        <!-- Controls over the canvas, as the BOM viewer's graph has them; solid, like the format chip, so they show on a light preview image too. -->
        <div class="position-absolute top-0 right-0 d-flex ga-1 ma-2">
          <v-btn
            v-if="showModel"
            :aria-label="t('viewer.resetView')"
            color="surface"
            :disabled="viewer.status.value !== 'ready'"
            icon
            size="small"
            variant="flat"
            @click="viewer.resetView()"
          >
            <v-icon icon="mdi-fit-to-screen-outline" />
            <v-tooltip activator="parent" location="bottom" :text="t('viewer.resetView')" />
          </v-btn>

          <v-btn
            v-if="canToggle"
            :aria-label="toggleLabel"
            color="surface"
            data-test="viewer-toggle"
            icon
            size="small"
            variant="flat"
            @click="showImage = !showImage"
          >
            <v-icon :icon="showImage ? 'mdi-rotate-3d-variant' : 'mdi-image-outline'" />
            <v-tooltip activator="parent" location="bottom" :text="toggleLabel" />
          </v-btn>

          <v-btn
            v-if="version?.digital"
            :aria-label="t('viewer.download')"
            color="surface"
            icon
            size="small"
            variant="flat"
            @click="emit('download', version.digital.path)"
          >
            <v-icon icon="mdi-download" />
            <v-tooltip activator="parent" location="bottom" :text="t('viewer.download')" />
          </v-btn>

          <v-btn
            v-if="external && !externalFailed"
            :aria-label="t('viewer.openExternal')"
            color="surface"
            icon
            size="small"
            variant="flat"
            @click="emit('open', externalUrl)"
          >
            <v-icon icon="mdi-open-in-new" />
            <v-tooltip activator="parent" location="bottom" :text="t('viewer.openExternalAt', { host: externalHost })" />
          </v-btn>

          <v-btn
            v-if="!fullscreen"
            :aria-label="t('viewer.fullscreen')"
            color="surface"
            data-test="viewer-fullscreen"
            icon
            size="small"
            variant="flat"
            @click="emit('fullscreen')"
          >
            <v-icon icon="mdi-fullscreen" />
            <v-tooltip activator="parent" location="bottom" :text="t('viewer.fullscreen')" />
          </v-btn>
        </div>
      </v-responsive>
    </v-sheet>

    <v-alert v-if="notice" density="compact" :text="notice" type="info" />

    <!-- A file at another host that is not shown in 3D (its format, or the host refused Studio):
         the preview fills the box, and the link is said and offered below it. -->
    <v-alert
      v-if="!version?.digital && externalUrl && (!external || externalFailed)"
      data-test="viewer-external"
      density="compact"
      :text="externalFailed ? t('viewer.externalFailed', { host: externalHost }) : t('viewer.external', { host: externalHost })"
      type="info"
    >
      <template #append>
        <v-btn prepend-icon="mdi-open-in-new" :text="t('viewer.openExternal')" @click="emit('open', externalUrl)" />
      </template>
    </v-alert>

    <v-alert v-if="problemText && !showImage && !externalFailed" density="compact" :text="problemText" type="warning" />

    <v-alert
      v-if="viewer.result.value && viewer.result.value.missingImages.length > 0"
      density="compact"
      :text="t('viewer.missingImages', { files: viewer.result.value.missingImages.join(', ') })"
      type="warning"
    />

    <!-- IFC: the picked element's attributes and property sets. -->
    <v-card v-if="showModel && viewer.result.value?.pickable" data-test="viewer-element">
      <v-progress-linear v-if="viewer.selecting.value" />

      <template v-else-if="viewer.selected.value">
        <v-card-item
          :subtitle="[viewer.selected.value.type, viewer.selected.value.globalId].filter(Boolean).join(' · ')"
          :title="viewer.selected.value.name ?? viewer.selected.value.type"
        >
          <template #append>
            <v-btn :aria-label="t('viewer.clearSelection')" icon="mdi-close" size="small" @click="viewer.clearSelection()" />
          </template>
        </v-card-item>

        <v-expansion-panels v-if="viewer.selected.value.groups.length > 0" multiple static variant="accordion">
          <v-expansion-panel v-for="group in viewer.selected.value.groups" :key="group.name" :title="group.name">
            <v-expansion-panel-text>
              <DefinitionList :rows="group.properties.map(property => ({ label: property.name, value: property.value }))" />
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-card-text v-else class="text-medium-emphasis">{{ t('viewer.noProperties') }}</v-card-text>
      </template>

      <v-card-text v-else class="text-medium-emphasis">{{ t('viewer.pickHint') }}</v-card-text>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
  import type { Model3DVersion } from './models3d'
  import type { ViewerTheme } from '@basyx/model-viewer'
  import type { StudioClient } from '@basyx/studio-sdk'
  import { modelFormatLabels } from '@basyx/model-viewer'
  import { useModelViewer } from '@basyx/model-viewer/vue'
  import { computed, onMounted, ref, watch } from 'vue'
  import DefinitionList from './DefinitionList.vue'
  import { useI18n } from './i18n'
  import { externalModel, viewerFormat } from './models3d'
  import { formatLabel } from './presentation'
  import PreviewImage from './PreviewImage.vue'

  // A version's model in 3D (the Web UI's Models3DViewerCard and CADPreview),
  // its preview image where it has no file the viewer reads, and a link to
  // an external host where the file is only there.
  const props = defineProps<{
    client: StudioClient
    submodelId: string
    version: Model3DVersion | undefined
    title: string
    theme: ViewerTheme
    fullscreen: boolean
  }>()
  const emit = defineEmits<{
    open: [url: string]
    download: [path: string]
    fullscreen: []
  }>()

  const { t } = useI18n()
  const host = ref<HTMLElement | null>(null)
  const viewer = useModelViewer(host, () => props.theme)

  const showImage = ref(false)
  // A file of its own, else one at another host, which Studio's page fetches (`readExternalFile`).
  const external = computed(() => externalModel(props.version))
  const format = computed(() => viewerFormat(props.version) ?? external.value?.format ?? null)
  const canView = computed(() => format.value !== null)
  const showModel = computed(() => canView.value && !showImage.value && !viewer.problem.value)
  const canToggle = computed(() => canView.value && Boolean(props.version?.preview) && !viewer.problem.value)
  const toggleLabel = computed(() => (showImage.value ? t('viewer.showModel') : t('viewer.showImage')))
  const externalUrl = computed(() => external.value?.file.url ?? props.version?.externalFiles.find(file => /^https?:\/\//i.test(file.url))?.url ?? '')
  /** The host did not hand out the file (unreachable, CORS, too large): its preview and link instead. */
  const externalFailed = computed(() => Boolean(external.value) && viewer.problem.value?.code === 'download')
  const externalHost = computed(() => URL.parse(externalUrl.value)?.host ?? externalUrl.value)
  const formatText = computed(() => {
    // "binary (.glb)" → ".glb"
    const qualifier = props.version?.format.qualifier.match(/\(([^)]+)\)/)?.[1]
    return [formatLabel(props.version) || (format.value ? modelFormatLabels[format.value] : ''), qualifier].filter(Boolean).join(' · ')
  })
  const notice = computed(() => {
    if (!props.version?.digital) {
      return externalUrl.value ? '' : t('viewer.noFile')
    }
    return canView.value ? '' : t('viewer.unsupported', { format: formatLabel(props.version) || props.version.fileName })
  })
  const problemText = computed(() => {
    const problem = viewer.problem.value
    switch (problem?.code) {
      case undefined: {
        return ''
      }
      case 'webgl': {
        return t('errors.webgl')
      }
      case 'missing-buffers': {
        return t('errors.missingBuffers', { files: problem.details.join(', ') })
      }
      case 'download': {
        return t('errors.download', { message: problem.message })
      }
      default: {
        return t('errors.parse', { message: problem?.message ?? '' })
      }
    }
  })

  async function load () {
    const version = props.version
    if (!format.value) {
      return
    }
    if (version?.digital) {
      const path = version.digital.path
      await viewer.load(async () => (await props.client.ui.readFile(props.submodelId, path)).bytes, format.value)
    } else if (external.value) {
      const path = external.value.file.urlPath
      await viewer.load(async () => (await props.client.ui.readExternalFile(props.submodelId, path)).bytes, format.value)
    }
  }

  onMounted(load)
  watch(() => props.version?.key, () => {
    showImage.value = false
    void load()
  })
</script>
