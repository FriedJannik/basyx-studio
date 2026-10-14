<template>
  <div class="d-flex flex-column h-100">
    <v-toolbar color="transparent" density="compact">
      <v-btn-toggle v-model="showSource" class="ms-2" mandatory>
        <v-btn :text="t('details.modes.diagram')" :value="false" />
        <v-btn :text="t('details.modes.source')" :value="true" />
      </v-btn-toggle>

      <template #append>
        <v-btn
          v-if="!showSource"
          v-tooltip="fit ? t('details.modes.actualSize') : t('details.modes.fitWidth')"
          :aria-label="fit ? t('details.modes.actualSize') : t('details.modes.fitWidth')"
          :icon="fit ? 'mdi-magnify-plus-outline' : 'mdi-fit-to-page-outline'"
          size="small"
          @click="fit = !fit"
        />

        <v-btn :aria-label="t('details.modes.copySource')" icon="mdi-content-copy" size="small" @click="copy(result.source, t('details.modes.source'))" />

        <v-menu>
          <template #activator="{ props: activator }">
            <v-btn v-bind="activator" :aria-label="t('details.download')" icon="mdi-download" size="small" />
          </template>

          <v-card>
            <v-list>
              <v-list-item prepend-icon="mdi-file-code-outline" title="PlantUML (.puml)" @click="save(result.source, 'puml', 'text/plain')" />
              <v-list-item :disabled="!svg" prepend-icon="mdi-svg" title="SVG (.svg)" @click="save(svg ?? '', 'svg', 'image/svg+xml')" />
            </v-list>
          </v-card>
        </v-menu>
      </template>
    </v-toolbar>

    <v-divider />

    <v-alert
      v-for="warning in result.warnings"
      :key="warning"
      class="ma-2"
      density="compact"
      :text="warning"
      type="warning"
    />

    <div v-if="showSource" class="flex-grow-1 overflow-hidden">
      <CodeView :file-name="`${fileName}.puml`" :label="t('details.modes.source')" language="plaintext" :model-value="result.source" />
    </div>

    <v-alert
      v-else-if="error"
      class="ma-4"
      :text="error"
      :title="t('details.modes.umlFailed')"
      type="error"
    />

    <div v-else-if="!svg" class="d-flex flex-column align-center justify-center flex-grow-1 ga-3 pa-8 text-medium-emphasis">
      <v-progress-circular indeterminate />
      <span class="text-body-medium">{{ t('details.modes.rendering') }}</span>
    </div>

    <!-- The diagram on white, as PlantUML draws it; an image cannot run scripts. -->
    <div v-else class="flex-grow-1 overflow-auto bg-white pa-4">
      <img :alt="t('details.modes.umlAlt', { name: fileName })" :class="fit ? 'd-block w-100' : 'd-block'" :src="svgUrl">
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { buildPlantUmlForSubmodelElement } from '#shared/aas/plantuml'

  // A UML class diagram of the selected submodel or element (MVP-4 plan, T2),
  // generated as in the BaSyx AAS Web UI and rendered in the browser.
  const props = defineProps<{ value: unknown, fileName: string }>()

  const { t } = useI18n()
  const copy = useClipboard()

  const showSource = ref(false)
  // Fitted to the panel's width at first; actual size scrolls.
  const fit = ref(true)
  const result = computed(() => buildPlantUmlForSubmodelElement(props.value))
  const svg = ref<string | null>(null)
  const error = ref<string | null>(null)
  const svgUrl = computed(() => svg.value ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.value)}` : undefined)

  let run = 0
  watch(() => result.value.source, async source => {
    // The engine needs the DOM; the server renders the loading state.
    if (import.meta.server) {
      return
    }
    const current = ++run
    svg.value = null
    error.value = null
    try {
      const { renderPlantUmlToSvg } = await import('~/utils/plantuml')
      const rendered = await renderPlantUmlToSvg(source)
      if (current === run) {
        svg.value = rendered
      }
    } catch (error_) {
      if (current === run) {
        error.value = error_ instanceof Error ? error_.message : String(error_)
      }
    }
  }, { immediate: true })

  function save (content: string, extension: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.fileName}.${extension}`
    link.click()
    URL.revokeObjectURL(url)
  }
</script>
