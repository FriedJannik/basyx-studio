<template>
  <div class="d-flex flex-column flex-grow-1">
    <!-- A frame that never connects (D14) says so instead of staying blank. -->
    <v-alert
      v-if="timedOut && !connected"
      class="ma-2"
      :text="t('apps.notStartedText')"
      :title="t('apps.notStarted')"
      type="warning"
    >
      <template #append>
        <v-btn :text="t('problem.retry')" @click="retry" />
      </template>
    </v-alert>

    <v-progress-linear v-else-if="!connected" />

    <!-- Created only on the client, after the bridge listens: a frame in
         server-rendered HTML would load before hydration. Hidden until the
         app connects, so its blank (white) page does not flash in dark mode. -->
    <iframe
      v-if="mounted"
      :key="attempt"
      ref="frame"
      :class="['w-100 border-0 d-block', fit ? undefined : 'flex-grow-1', connected ? undefined : 'opacity-0']"
      :height="fit ? (height ?? 480) : undefined"
      referrerpolicy="no-referrer"
      sandbox="allow-scripts"
      :src="contribution.entryUrl"
      :title="t('apps.frameTitle', { name: label(contribution.title) })"
      @load="onLoad"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { AppContext, AppContributionInfo, Target } from '#shared/contract'
  import { useTheme } from 'vuetify'
  import { appProtocol } from '#shared/contract'

  // A sandboxed app frame (ADR 0017): no same-origin access, popups, forms or
  // top navigation. Key it by target (and submodel), so a new target always
  // gets a new frame and never sees the previous target's data.
  const props = defineProps<{
    contribution: AppContributionInfo
    target: Target | null
    shellId?: string | null
    submodel?: { id: string, semanticId: string | null } | null
    subPath?: string
    /** Size the frame to the app's content (`studio.ui.setHeight`) instead of filling the container. */
    fit?: boolean
  }>()
  const emit = defineEmits<{ navigate: [subPath: string] }>()

  const { t, locale } = useI18n()
  const theme = useTheme()
  const ui = useUiStore()
  const label = useLocalizedLabel()
  const frame = useTemplateRef<HTMLIFrameElement>('frame')

  const themeColors = computed(() => Object.fromEntries(Object.entries(theme.current.value.colors)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')))

  const context = computed<AppContext>(() => ({
    protocol: appProtocol,
    installationId: props.contribution.installationId,
    appId: props.contribution.appId,
    contribution: { kind: props.contribution.kind, id: props.contribution.id },
    target: props.target
      ? {
        id: props.target.id,
        name: props.target.name,
        write: props.target.capabilities.write,
        persistence: props.target.capabilities.persistence,
      }
      : null,
    shell: props.shellId ? { id: props.shellId } : null,
    submodel: props.submodel ? { ...props.submodel } : null,
    subPath: props.subPath ?? '',
    mode: ui.mode,
    locale: locale.value,
    theme: { dark: theme.current.value.dark, colors: themeColors.value },
  }))

  const mounted = ref(false)
  /** Seconds an app may take to connect before the frame offers a retry. */
  const startTimeoutMs = 15_000
  const timedOut = ref(false)
  const attempt = ref(0)
  let startTimer: ReturnType<typeof setTimeout> | undefined
  function watchStart () {
    timedOut.value = false
    clearTimeout(startTimer)
    startTimer = setTimeout(() => (timedOut.value = true), startTimeoutMs)
  }
  function retry () {
    attempt.value++
    watchStart()
  }
  onMounted(() => {
    mounted.value = true
    watchStart()
  })
  onBeforeUnmount(() => clearTimeout(startTimer))

  const { connected, height, onLoad } = useAppBridge(frame, {
    contribution: () => props.contribution,
    targetId: props.target?.id ?? null,
    context: () => context.value,
    onNavigate: subPath => emit('navigate', subPath),
  })
  watch(connected, value => {
    if (value) {
      clearTimeout(startTimer)
      timedOut.value = false
    }
  })
</script>
