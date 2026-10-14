<template>
  <v-dialog v-model="open" max-width="400">
    <DialogCard :title="t('qr.title')">
      <div class="d-flex flex-column align-center ga-3">
        <v-img :alt="t('qr.alt', { id: content })" :src="svgDataUrl(svg)" width="240" />
        <div class="text-body-small text-medium-emphasis text-center text-break">{{ content }}</div>
      </div>

      <template #actions-start>
        <v-btn-secondary prepend-icon="mdi-download" :text="t('qr.download')" @click="download" />
      </template>

      <template #actions>
        <v-btn prepend-icon="mdi-content-copy" :text="t('qr.copyId')" @click="copy(content, t('shell.globalAssetId'))" />
        <v-btn :text="t('common.close')" @click="open = false" />
      </template>
    </DialogCard>
  </v-dialog>
</template>

<script lang="ts" setup>
  import { identificationLinkSvg, svgDataUrl } from '~/utils/qr'

  // The global asset ID as an IEC 61406 identification link, to print or to
  // scan with a phone; download as SVG.
  const props = defineProps<{ content: string, fileName: string }>()
  const open = defineModel<boolean>({ required: true })

  const { t } = useI18n()
  const copy = useClipboard()
  const svg = computed(() => identificationLinkSvg(props.content))

  function download () {
    const url = URL.createObjectURL(new Blob([svg.value], { type: 'image/svg+xml' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.fileName.replaceAll(/[^\w-]/g, '_')}-qr.svg`
    link.click()
    URL.revokeObjectURL(url)
  }
</script>
