<template>
  <v-dialog v-model="open" :fullscreen="xs" max-width="440">
    <DialogCard :title="t('scan.title')">
      <p class="text-body-medium text-medium-emphasis mt-0 mb-3">{{ t('scan.subtitle') }}</p>

      <!-- The camera picture; scanning runs until a code is read. -->
      <v-responsive v-show="state === 'scanning' && !cameraError" aspect-ratio="1" class="bg-black rounded-lg">
        <video ref="video" class="w-100 h-100 d-block" muted playsinline />
      </v-responsive>

      <v-alert
        v-if="cameraError && state === 'scanning'"
        density="compact"
        :text="cameraError"
        type="info"
      />

      <div v-if="state === 'looking-up'" class="d-flex flex-column align-center ga-3 py-8">
        <v-progress-circular indeterminate />
        <div class="text-body-medium text-medium-emphasis">{{ t('scan.lookingUp') }}</div>
      </div>

      <template v-if="state === 'done'">
        <div class="text-body-small text-medium-emphasis text-break mb-2">{{ t('scan.read', { value: scanned }) }}</div>

        <ProblemAlert v-if="error" :error="error" />

        <v-alert v-else-if="found.length === 0" density="compact" :text="t('scan.none')" type="info" />

        <v-list v-else>
          <v-list-subheader :title="t('scan.choose')" />

          <v-list-item
            v-for="shell in found"
            :key="shell.key"
            prepend-icon="$aas"
            :subtitle="shell.id"
            :title="langText(shell.displayName) ?? shell.idShort ?? shell.id"
            @click="openShell(shell.key)"
          />
        </v-list>
      </template>

      <!-- A photo of a code instead of the camera, e.g. on a desktop. -->
      <input
        ref="file"
        accept="image/*"
        class="d-none"
        type="file"
        @change="decodeFile"
      >

      <template #actions-start>
        <v-btn-secondary prepend-icon="mdi-image-outline" :text="t('scan.fromImage')" @click="file?.click()" />
      </template>

      <template #actions>
        <v-btn v-if="state === 'done'" prepend-icon="mdi-restart" :text="t('scan.again')" @click="start" />
        <v-btn :text="t('common.close')" @click="open = false" />
      </template>
    </DialogCard>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { ShellSummary } from '#shared/contract'
  import { useDisplay } from 'vuetify'
  import { langText } from '~/utils/aas'

  // Scans a QR code with the camera or from an image, as the BaSyx AAS Web UI
  // does, and looks its content up as a global asset ID. The browser's
  // BarcodeDetector reads the code where it exists, jsQR elsewhere.
  const props = defineProps<{ targetId: string }>()
  const open = defineModel<boolean>({ required: true })

  const { t } = useI18n()
  const { xs } = useDisplay()
  const api = useStudioApi()
  const video = useTemplateRef<HTMLVideoElement>('video')
  const file = useTemplateRef<HTMLInputElement>('file')

  const state = ref<'scanning' | 'looking-up' | 'done'>('scanning')
  const cameraError = ref<string | null>(null)
  const scanned = ref('')
  const found = ref<ShellSummary[]>([])
  const error = ref<unknown>(null)

  interface Detector { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }
  interface DetectorClass {
    getSupportedFormats?: () => Promise<string[]>
    new (options: { formats: string[] }): Detector
  }
  let detector: Detector | null | undefined
  let stream: MediaStream | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let canvas: HTMLCanvasElement | undefined

  async function nativeDetector (): Promise<Detector | null> {
    if (detector !== undefined) {
      return detector
    }
    const BarcodeDetector = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector
    const formats = BarcodeDetector ? await BarcodeDetector.getSupportedFormats?.().catch(() => []) : []
    detector = BarcodeDetector && formats?.includes('qr_code') ? new BarcodeDetector({ formats: ['qr_code'] }) : null
    return detector
  }

  /** Reads a QR code from a video frame or an image, or `null`. */
  async function decode (source: HTMLVideoElement | ImageBitmap, width: number, height: number): Promise<string | null> {
    const native = await nativeDetector()
    if (native) {
      return (await native.detect(source))[0]?.rawValue ?? null
    }
    const scale = Math.min(1, 800 / Math.max(width, height))
    canvas ??= document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const { default: jsQR } = await import('jsqr')
    return jsQR(image.data, image.width, image.height)?.data ?? null
  }

  function stopCamera () {
    clearTimeout(timer)
    for (const track of stream?.getTracks() ?? []) {
      track.stop()
    }
    stream = null
  }

  async function start () {
    stopCamera()
    state.value = 'scanning'
    cameraError.value = null
    error.value = null
    found.value = []
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraError.value = t('scan.noCamera')
      return
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      if (!open.value || !video.value) {
        stopCamera()
        return
      }
      video.value.srcObject = stream
      await video.value.play()
      scan()
    } catch {
      cameraError.value = t('scan.cameraDenied')
    }
  }

  function scan () {
    timer = setTimeout(async () => {
      const element = video.value
      if (!stream || !element) {
        return
      }
      const value = element.readyState >= 2 ? await decode(element, element.videoWidth, element.videoHeight).catch(() => null) : null
      if (value) {
        void lookup(value)
      } else {
        scan()
      }
    }, 250)
  }

  async function decodeFile (event: Event) {
    const input = event.target as HTMLInputElement
    const chosen = input.files?.[0]
    input.value = ''
    if (!chosen) {
      return
    }
    const bitmap = await createImageBitmap(chosen)
    const value = await decode(bitmap, bitmap.width, bitmap.height).catch(() => null)
    bitmap.close()
    if (value) {
      void lookup(value)
    } else {
      cameraError.value = t('scan.noCode')
    }
  }

  async function lookup (value: string) {
    stopCamera()
    scanned.value = value
    state.value = 'looking-up'
    try {
      const result = await api<{ items: ShellSummary[] }>(`/targets/${props.targetId}/lookup`, { query: { assetId: value } })
      found.value = result.items
      if (result.items.length === 1) {
        openShell(result.items[0]!.key)
        return
      }
    } catch (error_) {
      error.value = error_
    }
    state.value = 'done'
  }

  function openShell (key: string) {
    open.value = false
    void navigateTo(`/targets/${props.targetId}/shells/${key}`)
  }

  watch(open, isOpen => (isOpen ? void nextTick(start) : stopCamera()))
  onBeforeUnmount(stopCamera)
</script>
