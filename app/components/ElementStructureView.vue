<template>
  <v-card border="0" color="surface-light">
    <!-- Blob: content type, size, an image preview and a download -->
    <template v-if="modelType === 'Blob'">
      <v-card-item>
        <v-card-subtitle class="text-label-medium">{{ t('details.blob', { type: element.contentType ?? '' }) }}</v-card-subtitle>
        <v-card-title class="text-body-large">{{ blobBytes === null ? t('details.blobEmpty') : t('details.bytes', { size: blobBytes.toLocaleString(locale) }) }}</v-card-title>
      </v-card-item>

      <v-img v-if="blobUrl && isImage" class="mx-4" max-height="200" :src="blobUrl" />

      <v-card-actions v-if="blobUrl">
        <v-spacer />
        <v-btn :download="`${String(element.idShort ?? 'blob')}`" :href="blobUrl" prepend-icon="mdi-download" :text="t('details.download')" />
      </v-card-actions>
    </template>

    <!-- References: the keys, and a way into the element where it is in this submodel -->
    <template v-else-if="references.length > 0">
      <v-list lines="two">
        <template v-for="reference in references" :key="reference.label">
          <v-list-subheader :title="reference.label" />

          <v-list-item
            v-for="(key, index) in reference.keys"
            :key="index"
            class="text-break"
            :subtitle="key.type"
            :title="key.value"
          />

          <v-list-item v-if="reference.target" append-icon="mdi-chevron-right" :title="t('details.openReferenced')" @click="emit('select', reference.target)" />
          <v-list-item v-else-if="reference.keys.length === 0" :title="t('details.noReference')" />
        </template>
      </v-list>
    </template>

    <!-- Entity: its kind and asset -->
    <v-list v-else-if="modelType === 'Entity'" lines="two">
      <v-list-item prepend-icon="mdi-shape-outline" :subtitle="t('details.entityType')" :title="String(element.entityType ?? '—')" />

      <v-list-item
        v-if="element.globalAssetId"
        class="text-break"
        prepend-icon="mdi-barcode"
        :subtitle="t('shell.globalAssetId')"
        :title="String(element.globalAssetId)"
      />

      <v-list-item
        v-for="assetId in specificAssetIds"
        :key="`${assetId.name}:${assetId.value}`"
        class="text-break"
        prepend-icon="mdi-tag-outline"
        :subtitle="assetId.name"
        :title="assetId.value"
      />
    </v-list>

    <!-- Capability: a semantic statement without a value -->
    <v-card-text v-else-if="modelType === 'Capability'" class="text-body-medium text-medium-emphasis">{{ t('details.capability') }}</v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
  import { resourceKey } from '~/utils/aas'

  // Typed views of the structural element types (MVP-4 definition of done 8):
  // Blob, ReferenceElement, (Annotated)RelationshipElement, BasicEventElement,
  // Entity and Capability.
  const props = defineProps<{ element: Record<string, any>, submodelKey: string, submodelId: string }>()
  const emit = defineEmits<{ select: [id: string] }>()

  const { t, locale } = useI18n()

  const modelType = computed(() => String(props.element.modelType ?? ''))

  // Blob values are base64 (AAS JSON).
  const blobBytes = computed(() => {
    const value = props.element.value
    return typeof value === 'string' && value ? Math.floor(value.replace(/=+$/, '').length * 3 / 4) : null
  })
  const isImage = computed(() => String(props.element.contentType ?? '').startsWith('image/'))
  const blobUrl = computed(() => (typeof props.element.value === 'string' && props.element.value
    ? `data:${props.element.contentType ?? 'application/octet-stream'};base64,${props.element.value}`
    : null))

  interface Key { type: string, value: string }

  /** The tree id of the element a model reference points to, if it is in this submodel. */
  function targetOf (keys: Key[]): string | null {
    if (keys[0]?.type !== 'Submodel' || keys[0].value !== props.submodelId || keys.length < 2) {
      return null
    }
    let path = ''
    for (const key of keys.slice(1)) {
      path += /^\d+$/.test(key.value) && path ? `[${key.value}]` : (path ? `.${key.value}` : key.value)
    }
    return `${props.submodelKey}/${resourceKey(path)}`
  }

  const references = computed(() => {
    const referencesOf: Record<string, Array<[string, unknown]>> = {
      ReferenceElement: [[t('details.references'), props.element.value]],
      RelationshipElement: [[t('details.first'), props.element.first], [t('details.second'), props.element.second]],
      AnnotatedRelationshipElement: [[t('details.first'), props.element.first], [t('details.second'), props.element.second]],
      BasicEventElement: [[t('details.observed'), props.element.observed]],
    }
    const entries = referencesOf[modelType.value] ?? []
    return entries.map(([label, reference]) => {
      const keys = ((reference as { keys?: Key[] } | null)?.keys ?? []).map(key => ({ type: String(key.type), value: String(key.value) }))
      return { label, keys, target: targetOf(keys) }
    })
  })

  const specificAssetIds = computed(() => (Array.isArray(props.element.specificAssetIds) ? props.element.specificAssetIds : [])
    .map((entry: { name?: unknown, value?: unknown }) => ({ name: String(entry.name ?? ''), value: String(entry.value ?? '') })))
</script>
