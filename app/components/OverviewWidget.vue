<template>
  <!-- One widget of the Overview (ADR 0032): a header to drag it by, its
       actions, and a body that scrolls when the widget is smaller than its content. -->
  <v-hover v-slot="{ isHovering, props: hover }">
    <!-- As tall as its row; collapsed, only its header (the row keeps the height of its open widgets). -->
    <v-card v-bind="hover" :class="['d-flex flex-column', collapsed ? undefined : 'h-100']" :data-test="`overview-widget-${kind}`">
      <v-sheet
        :class="['overview-handle d-flex align-center ga-1 py-1 ps-1 pe-1 flex-shrink-0', draggable ? 'cursor-grab' : undefined]"
        color="card-header"
        :height="overviewHeaderHeight - 1"
      >
        <v-icon
          v-if="draggable"
          :class="isHovering ? 'opacity-60' : 'opacity-0'"
          icon="mdi-drag-vertical"
          size="small"
        />

        <div :class="['flex-grow-1 overflow-hidden', draggable ? undefined : 'ps-2']">
          <div class="text-title-small text-truncate">{{ title }}</div>
          <div v-if="subtitle" class="text-body-small text-medium-emphasis text-truncate">{{ subtitle }}</div>
        </div>

        <slot name="chips" />

        <v-btn-widget-icon
          v-if="canFullscreen"
          v-tooltip="t('overview.fullscreen')"
          :aria-label="t('overview.fullscreen')"
          icon="mdi-fullscreen"
          @click="emit('fullscreen')"
        />

        <v-btn-widget-icon
          v-tooltip="collapsed ? t('overview.expand') : t('overview.collapse')"
          :aria-expanded="!collapsed"
          :aria-label="collapsed ? t('overview.expand') : t('overview.collapse')"
          :icon="collapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'"
          @click="emit('collapse')"
        />

        <v-menu>
          <template #activator="{ props: menu }">
            <v-btn-widget-icon
              v-bind="menu"
              :aria-label="t('overview.widgetMenu', { name: title })"
              data-test="overview-widget-menu"
              icon="mdi-dots-vertical"
            />
          </template>

          <v-list>
            <v-list-item v-if="canReveal" prepend-icon="mdi-file-tree-outline" :title="t('overview.reveal')" @click="emit('reveal')" />
            <v-list-item v-if="canFit" prepend-icon="mdi-arrow-collapse-vertical" :title="t('overview.fit')" @click="emit('fit')" />

            <template v-if="arrangeable">
              <v-list-item :disabled="first" prepend-icon="mdi-arrow-up" :title="t('overview.moveEarlier')" @click="emit('move', -1)" />
              <v-list-item :disabled="last" prepend-icon="mdi-arrow-down" :title="t('overview.moveLater')" @click="emit('move', 1)" />

              <v-divider class="my-1" />
              <v-list-subheader :title="t('overview.width')" />

              <v-list-item
                v-for="option in widths"
                :key="option.w"
                :active="width === option.w"
                :title="option.title"
                @click="emit('width', option.w)"
              >
                <template #append>
                  <v-icon v-if="width === option.w" icon="mdi-check" size="small" />
                </template>
              </v-list-item>
            </template>

            <v-divider class="my-1" />
            <v-list-item prepend-icon="mdi-eye-off-outline" :title="t('overview.hide')" @click="emit('hide')" />
          </v-list>
        </v-menu>
      </v-sheet>

      <template v-if="!collapsed">
        <v-divider />

        <!-- Frames take no pointer events while widgets move, so a drag over them is not lost. -->
        <div :class="['flex-grow-1 overflow-y-auto', moving ? 'pointer-events-none' : undefined]">
          <div ref="content">
            <slot />
          </div>
        </div>
      </template>
    </v-card>
  </v-hover>
</template>

<script lang="ts" setup>
  import { overviewHeaderHeight } from '#shared/overview'

  const props = defineProps<{
    kind: 'view' | 'live' | 'pin'
    title: string
    subtitle?: string | null
    collapsed: boolean
    /** Can be dragged by its header and resized at its corner (the grid on wider screens). */
    draggable: boolean
    /** Can be moved and resized from its menu. */
    arrangeable: boolean
    /** A widget is being dragged or resized. */
    moving: boolean
    width: number
    first: boolean
    last: boolean
    canFullscreen?: boolean
    canReveal?: boolean
    canFit?: boolean
    /** Reports its content's height, so its row can fit it (views report their own). */
    measure?: boolean
  }>()
  const emit = defineEmits<{
    'fullscreen': []
    'collapse': []
    'hide': []
    'reveal': []
    'fit': []
    'move': [step: -1 | 1]
    'width': [columns: number]
    'content-height': [height: number]
  }>()

  const { t } = useI18n()

  // The content's natural height: the widget's row grows to it, so the body
  // does not scroll unless the user made the row lower.
  const content = useTemplateRef<HTMLElement>('content')
  const resizes = import.meta.client && props.measure
    ? new ResizeObserver(([entry]) => entry && emit('content-height', Math.ceil(entry.contentRect.height)))
    : null
  watch(content, (element, previous) => {
    if (previous) {
      resizes?.unobserve(previous)
    }
    if (element) {
      resizes?.observe(element)
    }
  })
  onBeforeUnmount(() => resizes?.disconnect())

  const widths = computed(() => [
    { w: 3, title: t('overview.widths.small') },
    { w: 6, title: t('overview.widths.medium') },
    { w: 8, title: t('overview.widths.large') },
    { w: 12, title: t('overview.widths.full') },
  ])
</script>
