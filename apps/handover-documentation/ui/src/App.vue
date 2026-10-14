<template>
  <v-app>
    <v-card>
      <v-card-item prepend-icon="mdi-file-document-multiple-outline">
        <v-card-title>Documents</v-card-title>
        <v-card-subtitle>Handover documentation · VDI 2770</v-card-subtitle>
      </v-card-item>

      <v-progress-linear v-if="loading" />

      <v-alert v-else-if="error" class="ma-4" :text="error" type="error" />

      <v-list v-else-if="documents.length > 0" class="px-2" lines="two">
        <v-list-item
          v-for="document in documents"
          :key="document.path"
          :disabled="!document.file"
          :subtitle="document.subtitle"
          :title="document.title"
          @click="open(document.file, false)"
        >
          <template #prepend>
            <v-avatar :color="document.pdf ? 'error' : 'primary'" rounded="lg" variant="tonal">
              <v-icon :icon="document.pdf ? 'mdi-file-pdf-box' : 'mdi-file-document-outline'" />
            </v-avatar>
          </template>

          <template v-if="document.file" #append>
            <v-btn
              :aria-label="`Download ${document.title}`"
              icon="mdi-download"
              size="small"
              @click.stop="open(document.file, true)"
            />
          </template>
        </v-list-item>
      </v-list>

      <v-card-text v-else class="text-medium-emphasis">No documents.</v-card-text>
    </v-card>
  </v-app>
</template>

<script lang="ts" setup>
  import type { Node } from '../../../shared/app'
  import type { JsonObject, StudioClient } from '@basyx/studio-sdk'
  import { StudioError } from '@basyx/studio-sdk'
  import { computed, onMounted, ref } from 'vue'
  import { child, childrenOf, loadSubmodel, textOf } from '../../../shared/app'

  const props = defineProps<{ client: StudioClient }>()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const submodel = ref<JsonObject | null>(null)
  const locale = computed(() => props.client.context.locale)

  /** First entry of a list (v2: `DocumentVersions`) or the collection itself (v1.2: `DocumentVersion`). */
  function first (node: Node | undefined, plural: string, singular: string): Node | undefined {
    const list = child(node, plural)
    return list ? childrenOf(list)[0] : child(node, singular)
  }

  const documents = computed(() => {
    if (!submodel.value) {
      return []
    }
    const list = child(submodel.value, 'Documents')
    const entries = list ? childrenOf(list) : childrenOf(submodel.value).filter(node => /^document/i.test(String(node.element.idShort)))
    return entries.map(document => {
      const version = first(document, 'DocumentVersions', 'DocumentVersion')
      const file = first(version, 'DigitalFiles', 'DigitalFile')
      const classification = first(document, 'DocumentClassifications', 'DocumentClassification')
      const contentType = typeof file?.element.contentType === 'string' ? file.element.contentType : ''
      const className = textOf(child(classification, 'ClassName'), locale.value)
      const versionName = textOf(child(version, 'Version'), locale.value)
      return {
        path: document.path,
        title: textOf(child(version, 'Title'), locale.value) || String(document.element.idShort),
        subtitle: [className, versionName && `Version ${versionName}`].filter(Boolean).join(' · '),
        file: file?.path ?? null,
        pdf: contentType === 'application/pdf',
      }
    })
  })

  function open (path: string | null, download: boolean) {
    if (path) {
      void props.client.ui.openFile(props.client.context.submodel!.id, path, download).catch((error_: unknown) => {
        error.value = error_ instanceof StudioError ? error_.message : String(error_)
      })
    }
  }

  onMounted(async () => {
    try {
      submodel.value = await loadSubmodel(props.client)
    } catch (error_) {
      error.value = error_ instanceof StudioError ? error_.message : String(error_)
    } finally {
      loading.value = false
    }
  })
</script>
