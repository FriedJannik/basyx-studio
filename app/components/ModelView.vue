<template>
  <div class="d-flex flex-column flex-grow-1">
    <div class="d-flex flex-column flex-grow-1" data-test="model-view">
      <v-toolbar class="flex-shrink-0" color="transparent" density="compact">
        <div class="d-flex align-center ga-2 ms-4 overflow-hidden">
          <v-chip :text="formatLabel" />

          <span v-if="viewer.result.value" class="text-body-small text-medium-emphasis text-no-wrap">
            {{ t('model3d.triangles', { count: n(viewer.result.value.triangles) }, viewer.result.value.triangles) }}
          </span>
        </div>

        <template #append>
          <v-btn
            v-tooltip="t('model3d.resetView')"
            :aria-label="t('model3d.resetView')"
            :disabled="viewer.status.value !== 'ready'"
            icon="mdi-fit-to-screen-outline"
            size="small"
            @click="viewer.resetView()"
          />

          <v-btn
            v-tooltip="fullscreen ? t('model3d.exitFullscreen') : t('model3d.fullscreen')"
            :aria-label="fullscreen ? t('model3d.exitFullscreen') : t('model3d.fullscreen')"
            data-test="model-view-fullscreen"
            :icon="fullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
            size="small"
            @click="fullscreen ? emit('close') : (fullscreenOpen = true)"
          />

          <v-btn
            v-tooltip="t('details.download')"
            :aria-label="t('details.download')"
            :href="downloadUrl"
            icon="mdi-download"
            :rel="external ? 'noreferrer' : undefined"
            size="small"
            target="_blank"
          />
        </template>
      </v-toolbar>

      <v-divider />

      <v-alert
        v-if="viewer.result.value && viewer.result.value.missingImages.length > 0"
        class="ma-2 flex-shrink-0"
        density="compact"
        :text="t('model3d.missingImages', { files: viewer.result.value.missingImages.join(', ') })"
        type="warning"
      />

      <v-sheet class="flex-grow-1 position-relative overflow-hidden" color="transparent" min-height="280" rounded="0">
        <!-- The canvas fills this box; absolute, so its pixel size never stretches the column. -->
        <div ref="host" class="position-absolute top-0 left-0 w-100 h-100" data-test="model-view-canvas" />

        <div
          v-if="viewer.status.value === 'downloading' || viewer.status.value === 'processing'"
          class="position-absolute top-0 left-0 w-100 h-100 d-flex flex-column align-center justify-center ga-3 pa-8 bg-surface text-medium-emphasis"
        >
          <v-progress-circular
            :indeterminate="viewer.progress.value === null"
            :model-value="(viewer.progress.value ?? 0) * 100"
          />

          <span class="text-body-medium">{{ viewer.status.value === 'downloading' ? t('model3d.downloading') : t('model3d.processing') }}</span>
        </div>

        <v-empty-state
          v-else-if="viewer.problem.value"
          class="position-absolute top-0 left-0 w-100 h-100 bg-surface"
          icon="mdi-cube-off-outline"
          size="56"
          :text="problemText"
          :title="t('model3d.failed')"
        >
          <template #actions>
            <v-btn
              :href="downloadUrl"
              prepend-icon="mdi-download"
              :rel="external ? 'noreferrer' : undefined"
              target="_blank"
              :text="external ? t('model3d.openExternal') : t('details.download')"
            />

            <v-btn prepend-icon="mdi-refresh" :text="t('problem.retry')" @click="load" />
          </template>
        </v-empty-state>
      </v-sheet>

      <!-- IFC: the picked element's attributes and property sets. -->
      <template v-if="viewer.result.value?.pickable">
        <v-divider />

        <v-sheet class="flex-shrink-0 overflow-y-auto" color="transparent" data-test="model-view-element" max-height="45%">
          <v-progress-linear v-if="viewer.selecting.value" />

          <template v-else-if="viewer.selected.value">
            <v-list-item
              class="py-2"
              :subtitle="[viewer.selected.value.type, viewer.selected.value.globalId].filter(Boolean).join(' · ')"
              :title="viewer.selected.value.name ?? viewer.selected.value.type"
            >
              <template #append>
                <v-btn :aria-label="t('model3d.clearSelection')" icon="mdi-close" size="small" @click="viewer.clearSelection()" />
              </template>
            </v-list-item>

            <v-expansion-panels v-if="viewer.selected.value.groups.length > 0" multiple>
              <v-expansion-panel v-for="group in viewer.selected.value.groups" :key="group.name" :title="group.name">
                <v-expansion-panel-text>
                  <v-table density="compact">
                    <tbody>
                      <tr v-for="property in group.properties" :key="property.name">
                        <td class="text-medium-emphasis">{{ property.name }}</td>
                        <td class="text-break">{{ property.value }}</td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <p v-else class="px-4 pb-3 text-body-medium text-medium-emphasis">{{ t('model3d.noProperties') }}</p>
          </template>

          <p v-else class="pa-4 text-body-medium text-medium-emphasis">{{ t('model3d.pickHint') }}</p>
        </v-sheet>
      </template>
    </div>

    <!-- The same view again, filling the window, as for app views (AppFrame):
         the embedded one keeps its size and camera. -->
    <v-dialog v-if="!fullscreen" v-model="fullscreenOpen" fullscreen>
      <v-card-fullscreen class="d-flex flex-column" height="100%">
        <model-view
          :element="element"
          :element-key="elementKey"
          :format="format"
          fullscreen
          :submodel-key="submodelKey"
          :target-id="targetId"
          @close="fullscreenOpen = false"
        />
      </v-card-fullscreen>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
  import type { ModelFormat } from '@basyx/model-viewer'
  import { modelFormatLabels, viewerThemeOf } from '@basyx/model-viewer'
  import { useModelViewer } from '@basyx/model-viewer/vue'
  import { useTheme } from 'vuetify'

  // The 3D view of a File element (STL, OBJ, glTF, IFC, STEP) in the
  // Visualization tab. Files of the target come through Studio; files at an
  // http(s) address load from there when that server allows it (CORS), else
  // through Studio's server for the origins the deployment lists (ADR 0042).
  const props = defineProps<{
    targetId: string
    submodelKey: string
    elementKey: string
    element: Record<string, unknown>
    format: ModelFormat
    /** The view inside the full-screen dialog; its button closes it. */
    fullscreen?: boolean
  }>()
  const emit = defineEmits<{ close: [] }>()

  const { t, n } = useI18n()
  const api = useStudioApi()
  const studioUrl = useStudioUrl()
  const readExternalFile = useExternalFile()
  const theme = useTheme()

  const host = ref<HTMLElement | null>(null)
  const fullscreenOpen = ref(false)

  const viewer = useModelViewer(host, () => viewerThemeOf(theme.current.value.colors, theme.current.value.dark))

  const fileValue = computed(() => (typeof props.element.value === 'string' ? props.element.value : ''))
  const external = computed(() => (/^https?:\/\//i.test(fileValue.value) ? fileValue.value : null))
  const attachmentPath = computed(() => `/targets/${props.targetId}/submodels/${props.submodelKey}/elements/${props.elementKey}/attachment`)
  const downloadUrl = computed(() => external.value ?? `${studioUrl.api(attachmentPath.value)}?download`)
  const formatLabel = computed(() => modelFormatLabels[viewer.result.value?.format ?? props.format])

  const problemText = computed(() => {
    const problem = viewer.problem.value
    switch (problem?.code) {
      case 'webgl': {
        return t('model3d.errors.webgl')
      }
      case 'missing-buffers': {
        return t('model3d.errors.missingBuffers', { files: problem.details.join(', ') })
      }
      case 'download': {
        return external.value ? t('model3d.errors.external') : t('model3d.errors.download', { message: problem.message })
      }
      default: {
        return t('model3d.errors.parse', { message: problem?.message ?? '' })
      }
    }
  })

  async function download (): Promise<Uint8Array> {
    if (external.value) {
      return (await readExternalFile(external.value, { targetId: props.targetId, submodelKey: props.submodelKey, elementKey: props.elementKey })).bytes
    }
    const blob = await api<Blob>(attachmentPath.value, { responseType: 'blob' })
    return new Uint8Array(await blob.arrayBuffer())
  }

  function load () {
    void viewer.load(download, props.format)
  }

  onMounted(load)
  watch(() => [props.targetId, props.submodelKey, props.elementKey, fileValue.value, props.format], load)
</script>
