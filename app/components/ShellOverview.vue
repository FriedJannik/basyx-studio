<template>
  <div>
    <div class="d-flex align-center flex-wrap ga-2 mb-3">
      <span v-if="gridMode && visible.length > 1" class="text-body-small text-medium-emphasis">{{ t('overview.arrangeHint') }}</span>

      <v-spacer />

      <OverviewPalette
        v-if="widgets.length > 0"
        :hidden="overview.layout.value.hidden"
        :widgets="widgets"
        @reset="reset"
        @update:hidden="ids => overview.setHidden(ids)"
      />
    </div>

    <v-skeleton-loader v-if="contributions.isPending.value && widgets.length === 0" type="card" />

    <v-empty-state
      v-else-if="widgets.length === 0"
      icon="mdi-puzzle-outline"
      size="64"
      :text="t('overview.noneText')"
      :title="t('overview.none')"
    />

    <v-empty-state
      v-else-if="visible.length === 0"
      icon="mdi-eye-off-outline"
      size="64"
      :text="t('overview.allHiddenText')"
      :title="t('overview.allHidden')"
    >
      <template #actions>
        <v-btn-primary :text="t('overview.showAll')" @click="overview.setHidden([])" />
      </template>
    </v-empty-state>

    <ClientOnly v-else>
      <!-- Wider screens: a grid the user arranges (ADR 0032). Phones: the widgets one below the other, in the grid's reading order. -->
      <component
        :is="gridMode ? GridLayout : 'div'"
        ref="container"
        v-bind="gridMode ? gridProps : { class: 'd-flex flex-column ga-4' }"
      >
        <component
          :is="gridMode ? GridItem : 'div'"
          v-for="entry in entries"
          :key="entry.widget.id"
          v-bind="gridMode ? itemProps(entry.box) : {}"
        >
          <OverviewWidget
            :arrangeable="gridMode"
            :can-fit="entry.widget.kind === 'view'"
            :can-fullscreen="entry.widget.kind === 'view'"
            :can-reveal="entry.widget.kind !== 'live'"
            :collapsed="entry.box.collapsed"
            :draggable="gridMode"
            :first="entry.index === 0"
            :kind="entry.widget.kind"
            :last="entry.index === entries.length - 1"
            :moving="moving"
            :subtitle="entry.widget.subtitle"
            :title="entry.widget.title"
            :width="entry.box.w"
            @collapse="toggleCollapsed(entry.box)"
            @fit="fitToContent(entry.box)"
            @fullscreen="frames.get(entry.widget.id)?.openFullscreen()"
            @hide="hide(entry.widget.id)"
            @move="step => move(entry.box, step)"
            @reveal="reveal(entry.widget)"
            @width="columns => setWidth(entry.box, columns)"
          >
            <template v-if="entry.widget.view?.contribution.unsigned" #chips>
              <v-chip color="warning" size="x-small" :text="t('apps.unsigned')" />
            </template>

            <!-- An app's view; its frame loads once the widget scrolls into sight,
                 watched only after the grid has placed it. -->
            <div
              v-if="entry.widget.view && (gridReady || !gridMode)"
              :ref="element => watchSight(entry.widget.id, element)"
            >
              <AppFrame
                v-if="seen.has(entry.widget.id)"
                :ref="frame => setFrame(entry.widget.id, frame)"
                :contribution="entry.widget.view.contribution"
                fit
                :shell-id="shellId"
                :submodel="{ id: entry.widget.view.submodel.submodelId, semanticId: entry.widget.view.submodel.semanticId }"
                :target="target"
                @content-height="height => onContentHeight(entry.box, height)"
              />

              <v-skeleton-loader v-else type="image, list-item-two-line" />
            </div>

            <v-skeleton-loader v-else-if="entry.widget.view" type="image, list-item-two-line" />

            <OverviewLiveValues
              v-else-if="entry.widget.kind === 'live'"
              :is-pinned="signal => overview.isPinned(signal.submodelKey, signal.elementKey)"
              :pins-full="overview.pinsFull.value"
              :signals="signals"
              @pin="togglePin"
              @select="id => emit('select', id)"
            />

            <OverviewPinValue
              v-else-if="entry.widget.pin"
              :at="at"
              :pin="entry.widget.pin"
              :refresh-seconds="refreshSeconds"
              :target-id="target.id"
              :unit-of="unitOf"
              @select="emit('open', entry.widget.pin.submodelKey, entry.widget.pin.elementKey, false)"
            />
          </OverviewWidget>
        </component>
      </component>

      <template #fallback>
        <v-skeleton-loader type="card" />
      </template>
    </ClientOnly>

    <!-- Every change of the Overview can be undone once. -->
    <v-snackbar v-model="undoOpen" :text="undo?.text" timeout="6000">
      <template #actions>
        <v-btn :text="t('overview.undo')" @click="restoreUndo()" />
      </template>
    </v-snackbar>
  </div>
</template>

<script lang="ts" setup>
  import type { SubmodelRef, SubmodelViewContributionInfo, Target } from '#shared/contract'
  import type { OverviewPin } from '#shared/overview'
  import type { LiveSignal } from '~/composables/useShellOverview'
  import { GridItem, GridLayout } from 'grid-layout-plus'
  import { useDisplay } from 'vuetify'
  import { overviewColumns, overviewHeaderHeight, overviewRows } from '#shared/overview'
  import { pinWidgetId } from '~/composables/useShellOverview'

  /** One widget of the Overview: an app's view of a submodel, the live values, or a pinned value. */
  interface Widget {
    id: string
    kind: 'view' | 'live' | 'pin'
    title: string
    subtitle: string | null
    /** How the palette lists it, under its group. */
    group: string
    paletteTitle: string
    paletteSubtitle: string | null
    /** The size it starts with, in grid columns and rows. */
    w: number
    h: number
    view?: { submodel: SubmodelRef, contribution: SubmodelViewContributionInfo }
    pin?: OverviewPin
  }

  // The views of installed apps (plan D3, D14) for every submodel of the
  // shell, the live values and the values the user pinned, each a widget the
  // user arranges and resizes (ADR 0032). Each view runs in its own sandboxed
  // frame; the arrangement is in useOverviewGrid.
  const props = defineProps<{
    target: Target
    shellId: string
    shellKey: string
    refs: SubmodelRef[]
    signals: LiveSignal[]
    /** Seconds between re-reads while auto-refresh is on, or `null`. */
    refreshSeconds: number | null
    at: string | null
    unitOf: (semanticId: string | null | undefined) => string | null
  }>()
  const emit = defineEmits<{
    select: [id: string]
    /** Opens an element or submodel in the details drawer; `inTree` also switches to the Submodels tab. */
    open: [submodelKey: string, elementKey: string | null, inTree: boolean]
  }>()

  const { t } = useI18n()
  const { mdAndUp } = useDisplay()
  const label = useLocalizedLabel()
  const overview = useShellOverview(() => props.target.id, () => props.shellKey)

  /** The grid needs room for its columns; narrower screens stack the widgets. */
  const gridMode = computed(() => mdAndUp.value)
  const defaultFrameHeight = 480

  const available = computed(() => props.refs.filter(ref => ref.status === 'available' && ref.semanticId))
  const contributions = useAppContributions(() => available.value.map(ref => ref.semanticId!))
  function submodelName (submodelKey: string) {
    const ref = props.refs.find(entry => entry.key === submodelKey)
    return ref ? (ref.idShort ?? ref.submodelId) : submodelKey
  }

  // Every matching view; the apps shipped with Studio come first. Then the
  // live values (at the top when they first appear) and the pinned values.
  const widgets = computed<Widget[]>(() => {
    const views = available.value.flatMap(submodel => (contributions.data.value?.submodelViews ?? [])
      .filter(view => view.reason.semanticId === submodel.semanticId)
      .toSorted((a, b) => Number(b.bundled) - Number(a.bundled))
      .map((contribution): Widget => {
        const submodelLabel = submodel.idShort ?? submodel.submodelId
        return {
          id: `view:${submodel.key}:${contribution.installationId}:${contribution.id}`,
          kind: 'view',
          title: label(contribution.title),
          subtitle: t('overview.reason', { app: label(contribution.appTitle), submodel: submodelLabel }),
          group: submodelLabel,
          paletteTitle: label(contribution.title),
          paletteSubtitle: label(contribution.appTitle),
          w: 6,
          h: overviewRows(defaultFrameHeight + overviewHeaderHeight),
          view: { submodel, contribution },
        }
      }))
    const live: Widget[] = props.signals.length > 0
      ? [{
        id: 'live',
        kind: 'live',
        title: t('overview.live'),
        subtitle: t('overview.liveSubtitle', { count: props.signals.length }),
        group: t('overview.values'),
        paletteTitle: t('overview.live'),
        paletteSubtitle: null,
        w: overviewColumns,
        h: overviewRows(overviewHeaderHeight + 168),
      }]
      : []
    const pins = overview.layout.value.pins.map((pin): Widget => ({
      id: pinWidgetId(pin),
      kind: 'pin',
      title: pin.title,
      subtitle: submodelName(pin.submodelKey),
      group: t('overview.values'),
      paletteTitle: pin.title,
      paletteSubtitle: submodelName(pin.submodelKey),
      w: 3,
      h: overviewRows(overviewHeaderHeight + 128),
      pin,
    }))
    return [...live, ...pins, ...views]
  })
  const visible = computed(() => {
    const hidden = new Set(overview.layout.value.hidden)
    return widgets.value.filter(widget => !hidden.has(widget.id))
  })

  const container = useTemplateRef<{ layoutUpdate?: () => void }>('container')
  const { grid, order, moving, ready: gridReady, gridProps, itemProps, undo, undoOpen, offerUndo, restoreUndo, fitToContent, onContentHeight, toggleCollapsed, setWidth, move } = useOverviewGrid({
    overview,
    widgets: () => visible.value.map(widget => ({ id: widget.id, w: widget.w, h: widget.h, first: widget.kind === 'live' })),
    container,
  })

  const byId = computed(() => new Map(widgets.value.map(widget => [widget.id, widget])))
  const entries = computed(() => {
    // On phones the widgets follow the grid's reading order; on the grid the
    // order of the boxes stays as it is, so moving one never re-creates a frame.
    const boxes = gridMode.value ? grid.value : order.value
    return boxes.flatMap(box => {
      const widget = byId.value.get(box.i)
      return widget ? [{ widget, box, index: order.value.indexOf(box) }] : []
    })
  })

  // The frames of app views, to open one full-screen from its header.
  const frames = new Map<string, { openFullscreen: () => void }>()
  function setFrame (id: string, frame: unknown) {
    if (frame) {
      frames.set(id, frame as { openFullscreen: () => void })
    } else {
      frames.delete(id)
    }
  }
  /** Views that have scrolled into sight; their frames stay once loaded. */
  const seen = reactive(new Set<string>())
  // One observer for all views. Not v-intersect: it re-creates its observer on
  // every render of this component, which can keep it from ever reporting.
  const sightIds = new WeakMap<Element, string>()
  const sight = import.meta.client
    ? new IntersectionObserver(observed => {
      for (const entry of observed) {
        const id = sightIds.get(entry.target)
        if (entry.isIntersecting && id) {
          seen.add(id)
          sight?.unobserve(entry.target)
        }
      }
    })
    : null
  /** Watches a view's body until it is in sight; observing an element twice does nothing. */
  function watchSight (id: string, element: unknown) {
    if (element instanceof Element && !seen.has(id)) {
      sightIds.set(element, id)
      sight?.observe(element)
    }
  }
  onBeforeUnmount(() => sight?.disconnect())

  function hide (id: string) {
    offerUndo(t('overview.hidden'), overview.snapshot())
    void overview.setHidden([...overview.layout.value.hidden, id])
  }

  function reset () {
    offerUndo(t('overview.resetDone'), overview.snapshot())
    void overview.reset()
  }

  function togglePin (signal: LiveSignal) {
    const pinned = overview.isPinned(signal.submodelKey, signal.elementKey)
    offerUndo(pinned ? t('overview.unpinned') : t('overview.pinned'), overview.snapshot())
    void overview.togglePin({ submodelKey: signal.submodelKey, elementKey: signal.elementKey, title: signal.title })
  }

  function reveal (widget: Widget) {
    if (widget.view) {
      emit('open', widget.view.submodel.key, null, true)
    } else if (widget.pin) {
      emit('open', widget.pin.submodelKey, widget.pin.elementKey, true)
    }
  }
</script>
