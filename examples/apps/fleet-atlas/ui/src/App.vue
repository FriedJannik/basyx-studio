<template>
  <v-app>
    <v-navigation-drawer
      v-if="focused"
      location="end"
      :model-value="true"
      permanent
      width="400"
    >
      <TwinPanel
        :key="focused.id"
        :can-edit="canEdit"
        :histories="histories"
        :index="index"
        :twin="focused"
        :version="version"
        @close="closePanel"
        @fix="fixOne"
        @focus="focus"
      />
    </v-navigation-drawer>

    <v-main>
      <div class="position-relative h-screen overflow-hidden">
        <canvas ref="canvas" class="position-absolute top-0 left-0 w-100 h-100 d-block cursor-grab" data-test="atlas" />

        <v-progress-linear v-if="scanning" class="position-absolute top-0 left-0" />

        <!-- Top: title and figures, the question, lens and grouping -->
        <div class="position-absolute top-0 left-0 w-100 pa-3 d-flex align-start ga-3 pointer-events-none">
          <v-sheet class="pa-3 pointer-events-auto flex-shrink-0" elevation="6" rounded="lg">
            <div class="d-flex align-center ga-2">
              <v-icon color="primary" icon="mdi-orbit" />
              <span class="text-subtitle-1 font-weight-bold">Fleet Atlas</span>
              <span class="text-body-2 text-medium-emphasis text-truncate">{{ client.context.target?.name }}</span>
            </div>

            <div class="d-flex ga-5 mt-2">
              <div>
                <div class="text-h6 font-weight-bold" data-test="twin-count">{{ stats.twins }}</div>
                <div class="text-caption text-medium-emphasis">twins</div>
              </div>

              <div>
                <div :class="['text-h6 font-weight-bold', `text-${stats.readiness >= 0.95 ? 'success' : (stats.readiness >= 0.75 ? 'warning' : 'error')}`]">{{ Math.round(stats.readiness * 100) }}%</div>
                <div class="text-caption text-medium-emphasis">passport ready</div>
              </div>

              <div>
                <div class="text-h6 font-weight-bold">{{ formatCarbon(stats.carbon) }}</div>
                <div class="text-caption text-medium-emphasis">CO₂e</div>
              </div>

              <div v-if="stats.live > 0">
                <div :class="['text-h6 font-weight-bold', stats.alarms > 0 ? 'text-error' : (stats.warnings > 0 ? 'text-warning' : 'text-success')]" data-test="alarm-count">
                  {{ stats.alarms > 0 ? stats.alarms : (stats.warnings > 0 ? stats.warnings : stats.live) }}
                </div>

                <div class="text-caption text-medium-emphasis">{{ stats.alarms > 0 ? 'in alarm' : (stats.warnings > 0 ? 'warnings' : 'live, all normal') }}</div>
              </div>
            </div>

          </v-sheet>

          <v-sheet class="flex-grow-1 mx-auto pointer-events-auto" color="transparent" max-width="620" min-width="260">
            <v-text-field
              ref="askField"
              v-model="question"
              bg-color="surface"
              clearable
              data-test="ask"
              density="comfortable"
              hide-details
              :loading="asking"
              placeholder="Ask the fleet …  e.g. motors over 5 kW without carbon footprint"
              prepend-inner-icon="mdi-creation"
              rounded="pill"
              variant="solo"
              @blur="askFocused = false"
              @click:clear="clearQuery"
              @focus="askFocused = true"
              @keydown.enter="askFleet()"
            />

            <div v-if="clauses.length > 0" class="d-flex flex-wrap align-center ga-1 mt-2" data-test="clauses">
              <v-chip
                v-for="(clause, position) in clauses"
                :key="`${clause.type}-${position}`"
                closable
                color="primary"
                :text="clause.label"
                variant="elevated"
                @click:close="removeClause(position)"
              />

              <v-chip :color="matchCount > 0 ? 'success' : 'error'" data-test="match-count" :text="matchCount === 1 ? '1 twin' : `${matchCount} twins`" variant="elevated" />

              <v-btn
                v-if="matchCount > 0"
                density="comfortable"
                prepend-icon="mdi-select-all"
                size="small"
                text="Select"
                variant="elevated"
                @click="selectMatches"
              />
            </div>

            <div v-else-if="askFocused && !question" class="d-flex flex-wrap ga-1 mt-2">
              <v-chip
                v-for="example in examples"
                :key="example"
                prepend-icon="mdi-lightbulb-on-outline"
                :text="example"
                variant="elevated"
                @mousedown.prevent="askFleet(example)"
              />
            </div>
          </v-sheet>

          <v-sheet class="pa-2 pointer-events-auto d-flex flex-column ga-2 flex-shrink-0" elevation="6" rounded="lg">
            <v-btn-toggle
              v-model="lens"
              color="primary"
              density="compact"
              mandatory
              rounded="lg"
              variant="outlined"
            >
              <v-btn
                v-for="item in lenses"
                :key="item.value"
                :data-test="`lens-${item.value}`"
                :prepend-icon="compact ? undefined : item.icon"
                size="small"
                :text="compact ? undefined : item.title"
                :title="item.title"
                :value="item.value"
              >
                <v-icon v-if="compact" :icon="item.icon" />
              </v-btn>
            </v-btn-toggle>

            <v-btn-toggle
              v-model="grouping"
              density="compact"
              mandatory
              rounded="lg"
              variant="outlined"
            >
              <v-btn
                v-for="item in groupings"
                :key="item.value"
                :data-test="`group-${item.value}`"
                :prepend-icon="compact ? undefined : item.icon"
                size="small"
                :text="compact ? undefined : item.title"
                :title="item.title"
                :value="item.value"
              >
                <v-icon v-if="compact" :icon="item.icon" />
              </v-btn>
            </v-btn-toggle>
          </v-sheet>
        </div>

        <!-- Center: errors and the empty state -->
        <div v-if="error || (!scanning && stats.twins === 0)" class="position-absolute top-0 left-0 w-100 h-100 d-flex align-center justify-center pa-6 pointer-events-none">
          <v-alert
            v-if="error"
            class="pointer-events-auto"
            max-width="560"
            :text="error"
            title="The fleet could not be read"
            type="error"
          >
            <template #append>
              <v-btn text="Retry" @click="load" />
            </template>
          </v-alert>

          <v-alert v-else max-width="560" text="This target has no shells yet." type="info" />
        </div>

        <!-- Bottom: legend, tour caption or selection, controls -->
        <div class="position-absolute bottom-0 left-0 w-100 pa-3 d-flex align-end ga-3 pointer-events-none">
          <v-sheet class="pa-2 pointer-events-auto" elevation="6" rounded="lg">
            <div class="text-caption text-medium-emphasis px-1 mb-1">{{ lenses.find(item => item.value === lens)?.title }} lens</div>

            <div class="d-flex flex-column ga-1">
              <div v-for="entry in legend[lens]" :key="entry.label" class="d-flex align-center ga-2 px-1">
                <v-icon :color="entry.color" icon="mdi-circle" size="12" />
                <span class="text-caption">{{ entry.label }}</span>
              </div>
            </div>
          </v-sheet>

          <div class="flex-grow-1 d-flex justify-center">
            <v-sheet
              v-if="caption"
              class="px-6 py-3 pointer-events-auto"
              data-test="tour-caption"
              elevation="8"
              max-width="720"
              rounded="xl"
            >
              <div class="text-subtitle-1 font-weight-bold text-center">{{ caption.title }}</div>
              <div class="text-body-2 text-medium-emphasis text-center">{{ caption.text }}</div>
            </v-sheet>

            <v-sheet
              v-else-if="selected.length > 0"
              class="px-4 py-2 pointer-events-auto d-flex align-center flex-wrap ga-3"
              data-test="selection"
              elevation="8"
              rounded="xl"
            >
              <v-icon icon="mdi-lasso" />

              <div>
                <div class="text-subtitle-2 font-weight-bold">{{ selected.length }} twins selected</div>

                <div class="text-caption text-medium-emphasis">
                  passport {{ Math.round(selectionStats.readiness * 100) }}% · {{ formatCarbon(selectionStats.carbon) }} CO₂e · {{ selectionStats.gaps }} fillable gaps
                </div>
              </div>

              <v-menu>
                <template #activator="{ props: menu }">
                  <v-btn-primary v-bind="menu" :disabled="gapGroups.length === 0" prepend-icon="mdi-auto-fix" text="Fill gaps" />
                </template>

                <v-list density="compact">
                  <v-list-item
                    v-for="group in gapGroups"
                    :key="group.key"
                    :subtitle="`${group.edits.length} twins`"
                    :title="group.label"
                    @click="openBulk(group)"
                  />
                </v-list>
              </v-menu>

              <v-btn text="Show" @click="atlas?.flyToKeys(selected)" />
              <v-btn icon="mdi-close" size="small" @click="clearSelection" />
            </v-sheet>

            <v-sheet v-else-if="trail.length > 1" class="px-2 pointer-events-auto" elevation="6" rounded="pill">
              <v-breadcrumbs density="compact" :items="trail">
                <template #item="{ item }">
                  <v-breadcrumbs-item class="cursor-pointer" @click="focusTrail((item as unknown as TrailItem).id)">{{ (item as unknown as TrailItem).title }}</v-breadcrumbs-item>
                </template>
              </v-breadcrumbs>
            </v-sheet>
          </div>

          <v-sheet class="pa-1 pointer-events-auto d-flex flex-column" elevation="6" rounded="lg">
            <v-btn icon="mdi-plus" size="small" title="Zoom in" @click="atlas?.zoomBy(1.6)" />
            <v-btn icon="mdi-minus" size="small" title="Zoom out" @click="atlas?.zoomBy(1 / 1.6)" />
            <v-btn icon="mdi-fit-to-screen-outline" size="small" title="Whole fleet" @click="showAll" />

            <v-btn
              :color="lassoMode ? 'primary' : undefined"
              data-test="lasso"
              icon="mdi-lasso"
              size="small"
              title="Select an area (or Shift + drag)"
              @click="lassoMode = !lassoMode"
            />

            <v-btn
              :color="touring ? 'primary' : undefined"
              data-test="tour"
              :icon="touring ? 'mdi-stop' : 'mdi-play'"
              size="small"
              title="Tour"
              @click="touring ? stopTour() : startTour()"
            />
          </v-sheet>
        </div>
      </div>
    </v-main>

    <v-dialog v-model="bulkOpen" max-width="480">
      <v-card v-if="bulk" :title="`Fill ${bulk.label.toLowerCase()}`">
        <v-card-text>
          <p class="text-body-2 mb-4">Sets the value on {{ bulk.edits.length }} selected twins where it is empty. Each change is written to the target with your rights.</p>

          <v-text-field
            v-model="bulkValue"
            data-test="bulk-value"
            :disabled="!canEdit || bulkBusy"
            hide-details
            :label="bulk.label"
            :type="bulk.numeric ? 'number' : 'text'"
            @keydown.enter="applyBulk"
          />

          <v-alert v-if="!canEdit" class="mt-4" text="Switch Studio to edit mode to change the target." type="info" />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn text="Cancel" @click="bulkOpen = false" />

          <v-btn-primary
            data-test="bulk-apply"
            :disabled="!canEdit || !bulkValue"
            :loading="bulkBusy"
            text="Apply"
            @click="applyBulk"
          />
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script lang="ts" setup>
  import type { Check, Clause, Fix, Grouping, Lens, Status, Twin } from './types'
  import type { StudioClient } from '@basyx/studio-sdk'
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import { Atlas, rootKey } from './atlas'
  import { ancestors, formatCarbon, indexFleet, matchesAll, signalStatus, twinStatus, vocabulary } from './fleet'
  import { groupings, legend, lenses, LensPainter } from './lenses'
  import TwinPanel from './TwinPanel.vue'

  interface TrailItem { title: string, id: string }
  interface GapGroup { key: string, label: string, numeric: boolean, edits: Array<{ twin: Twin, check: Check, fix: Fix }> }

  const props = defineProps<{ client: StudioClient, glyph: (icon: string) => string }>()

  const canvas = ref<HTMLCanvasElement>()
  const atlas = shallowRef<Atlas>()
  const twins = new Map<string, Twin>()
  const index = shallowRef(indexFleet([]))
  const painter = new LensPainter(index.value)
  const version = ref(0)
  const histories = new Map<string, number[]>()

  const scanning = ref(false)
  const error = ref<string | null>(null)
  const lens = ref<Lens>('readiness')
  const grouping = ref<Grouping>('structure')
  const focusId = ref<string | null>(null)
  const lassoMode = ref(false)
  const selected = ref<string[]>([])

  const context = ref(props.client.context)
  props.client.onContext(value => {
    context.value = value
  })
  /** Narrow chrome while the twin panel takes space. */
  const compact = computed(() => Boolean(focusId.value))
  const canEdit = computed(() => context.value.mode === 'edit' && Boolean(context.value.target?.write))

  // -------------------------------------------------------------------------
  // Reading the fleet
  // -------------------------------------------------------------------------

  function relayout () {
    index.value = indexFleet(twins.values())
    painter.lens = lens.value
    atlas.value?.setLayout(painter.build(index.value, grouping.value, props.client.context.target?.name ?? 'Fleet'))
    applyMatches()
    version.value++
  }

  async function load () {
    error.value = null
    scanning.value = true
    let cursor: string | null = null
    let first = true
    try {
      do {
        const page: { twins: Twin[], nextCursor: string | null } = await props.client.backend.call('scan', { cursor: cursor ?? undefined, limit: first ? 8 : 16 })
        for (const twin of page.twins) {
          twins.set(twin.id, twin)
          remember(twin)
        }
        relayout()
        cursor = page.nextCursor
        first = false
      } while (cursor)
    } catch (error_) {
      error.value = error_ instanceof Error ? error_.message : String(error_)
    } finally {
      scanning.value = false
    }
    startPulse()
  }

  const stats = computed(() => {
    void version.value
    const all = [...index.value.byId.values()]
    const statuses = all.map(twin => twinStatus(twin))
    return {
      twins: all.length,
      readiness: all.length > 0 ? all.reduce((sum, twin) => sum + twin.readiness, 0) / all.length : 0,
      carbon: all.some(twin => twin.carbon !== null) ? all.reduce((sum, twin) => sum + (twin.carbon ?? 0), 0) : null,
      alarms: statuses.filter(status => status === 'alarm').length,
      warnings: statuses.filter(status => status === 'warning').length,
      live: statuses.filter(status => status !== 'none').length,
    }
  })

  // -------------------------------------------------------------------------
  // Live data
  // -------------------------------------------------------------------------

  let pulseTimer: ReturnType<typeof setTimeout> | undefined
  const lastStatus = new Map<string, Status>()

  function remember (twin: Twin) {
    for (const signal of twin.signals) {
      const key = `${signal.submodelId}#${signal.path}`
      const values = histories.get(key) ?? []
      values.push(signal.value)
      histories.set(key, values.slice(-60))
    }
    lastStatus.set(twin.id, twinStatus(twin))
  }

  function startPulse () {
    clearTimeout(pulseTimer)
    const live = [...twins.values()].filter(twin => twin.signals.length > 0)
    if (live.length === 0) {
      return
    }
    const submodelIds = [...new Set(live.flatMap(twin => twin.signals.map(signal => signal.submodelId)))]
    const step = async () => {
      try {
        const { values } = await props.client.backend.call<{ values: Record<string, number> }>('pulse', { submodelIds })
        for (const twin of live) {
          for (const signal of twin.signals) {
            const value = values[`${signal.submodelId}#${signal.path}`]
            if (value !== undefined) {
              signal.value = value
            }
          }
          const before = lastStatus.get(twin.id)
          remember(twin)
          const now = lastStatus.get(twin.id)
          if (now === 'alarm' && before !== 'alarm') {
            const signal = twin.signals.find(item => signalStatus(item) === 'alarm')!
            void props.client.ui.notify(`${twin.name}: ${signal.label} ${signal.value.toLocaleString('en', { maximumFractionDigits: 1 })} ${signal.unit} – alarm limit exceeded`, 'error')
          }
        }
        painter.invalidate()
        applyMatches()
        version.value++
      } catch {
        // The next pulse tries again.
      }
      pulseTimer = setTimeout(step, lens.value === 'live' ? 2000 : 4000)
    }
    pulseTimer = setTimeout(step, 1000)
  }

  // -------------------------------------------------------------------------
  // Ask the fleet
  // -------------------------------------------------------------------------

  const askField = ref<{ focus: () => void }>()
  const question = ref('')
  const asking = ref(false)
  const askFocused = ref(false)
  const clauses = ref<Clause[]>([])
  const hits = ref<string[]>([])
  const matchCount = computed(() => hits.value.length)
  const examples = computed(() => {
    void version.value
    const all = [...index.value.byId.values()]
    const list: string[] = []
    if (all.some(twin => twin.category === 'motor')) {
      list.push('motors over 5 kW without carbon footprint')
    }
    if (all.some(twin => twin.signals.length > 0)) {
      list.push('anything in alarm or warning')
    }
    list.push('not passport ready', 'older than 12 years')
    if (all.some(twin => twin.category === 'pump')) {
      list.push('pumps from hydra in utilities')
    }
    return list.slice(0, 5)
  })

  async function askFleet (text?: string) {
    if (text !== undefined) {
      question.value = text
    }
    const query = question.value.trim()
    if (!query) {
      clearQuery()
      return
    }
    asking.value = true
    try {
      const result = await props.client.backend.call<{ clauses: Clause[] }>('ask', { query, vocabulary: vocabulary(index.value) })
      clauses.value = result.clauses
      applyMatches(true)
    } catch (error_) {
      void props.client.ui.notify(error_ instanceof Error ? error_.message : String(error_), 'error')
    } finally {
      asking.value = false
    }
  }

  function applyMatches (fly = false) {
    if (clauses.value.length === 0) {
      hits.value = []
      atlas.value?.setMatches(null)
      return
    }
    const found = [...index.value.byId.values()].filter(twin => matchesAll(twin, clauses.value, index.value)).map(twin => twin.id)
    hits.value = found
    // Containers of matches stay visible, so the context remains readable.
    const keys = new Set(found)
    for (const id of found) {
      for (const ancestor of ancestors(index.value, id)) {
        keys.add(ancestor)
      }
    }
    atlas.value?.setMatches(withGroups(keys, found))
    if (fly && found.length > 0) {
      focusId.value = null
      atlas.value?.setFocus(null)
      atlas.value?.flyToKeys(found)
    }
  }

  /** Adds the group circles (manufacturer, category) that contain a match. */
  function withGroups (keys: Set<string>, found: string[]) {
    const result = new Set(keys)
    const wanted = new Set(found)
    for (const key of [rootKey, ...collectGroupKeys()]) {
      if (painter.members(key).some(twin => wanted.has(twin.id))) {
        result.add(key)
      }
    }
    return result
  }

  function collectGroupKeys () {
    const keys: string[] = []
    const walk = (key: string) => {
      for (const child of atlas.value?.childrenOf(key) ?? []) {
        if (!twins.has(child)) {
          keys.push(child)
        }
        walk(child)
      }
    }
    walk(rootKey)
    return keys
  }

  function removeClause (position: number) {
    clauses.value = clauses.value.filter((_, index_) => index_ !== position)
    if (clauses.value.length === 0) {
      question.value = ''
    }
    applyMatches(true)
  }

  function clearQuery () {
    question.value = ''
    clauses.value = []
    applyMatches()
  }

  function selectMatches () {
    selected.value = [...hits.value]
  }

  // -------------------------------------------------------------------------
  // Focus, selection and fixes
  // -------------------------------------------------------------------------

  const focused = computed(() => (void version.value, focusId.value ? index.value.byId.get(focusId.value) : undefined))

  const trail = computed<TrailItem[]>(() => {
    if (!focused.value) {
      return []
    }
    return [...ancestors(index.value, focused.value.id), focused.value.id]
      .map(id => ({ id, title: index.value.byId.get(id)?.name ?? id }))
  })

  function focus (id: string) {
    focusId.value = id
    atlas.value?.setFocus(id)
    atlas.value?.flyTo(id)
  }

  function focusTrail (id: string) {
    focus(id)
  }

  function closePanel () {
    focusId.value = null
    atlas.value?.setFocus(null)
  }

  function showAll () {
    closePanel()
    atlas.value?.flyTo(rootKey)
  }

  function clearSelection () {
    selected.value = []
  }

  watch(selected, keys => atlas.value?.setSelection(new Set(keys)))
  watch(lassoMode, value => {
    if (atlas.value) {
      atlas.value.lassoMode = value
    }
  })
  watch([lens, grouping], () => {
    relayout()
    if (focusId.value) {
      atlas.value?.flyTo(focusId.value)
    } else if (!touring.value) {
      atlas.value?.flyTo(rootKey)
    }
    startPulse()
  })

  const selectionStats = computed(() => {
    void version.value
    const items = selected.value.map(key => twins.get(key)).filter((twin): twin is Twin => twin !== undefined)
    return {
      readiness: items.length > 0 ? items.reduce((sum, twin) => sum + twin.readiness, 0) / items.length : 0,
      carbon: items.some(twin => twin.carbon !== null) ? items.reduce((sum, twin) => sum + (twin.carbon ?? 0), 0) : null,
      gaps: items.reduce((sum, twin) => sum + twin.checks.filter(check => !check.ok && check.fix).length, 0),
    }
  })

  const gapGroups = computed<GapGroup[]>(() => {
    void version.value
    const groups = new Map<string, GapGroup>()
    for (const key of selected.value) {
      const twin = twins.get(key)
      for (const check of twin?.checks ?? []) {
        if (!check.ok && check.fix) {
          const group = groups.get(check.key) ?? { key: check.key, label: check.label, numeric: /double|float|decimal|int/.test(check.fix.valueType ?? ''), edits: [] }
          group.edits.push({ twin: twin!, check, fix: check.fix })
          groups.set(check.key, group)
        }
      }
    }
    return [...groups.values()].toSorted((a, b) => b.edits.length - a.edits.length)
  })

  const bulk = ref<GapGroup | null>(null)
  const bulkOpen = ref(false)
  const bulkValue = ref('')
  const bulkBusy = ref(false)

  function openBulk (group: GapGroup) {
    bulk.value = group
    bulkValue.value = ''
    bulkOpen.value = true
  }

  /** Marks a check fulfilled locally after the target accepted the value. */
  function fulfil (twin: Twin, check: Check, value: string) {
    check.ok = true
    delete check.fix
    twin.readiness = twin.checks.filter(item => item.ok).length / twin.checks.length
    const fields: Record<string, keyof Twin> = { SerialNumber: 'serial', CountryOfOrigin: 'country', ManufacturerName: 'manufacturer', ManufacturerProductDesignation: 'designation' }
    if (fields[check.key]) {
      (twin as unknown as Record<string, unknown>)[fields[check.key]!] = value
    }
    if (check.key === 'YearOfConstruction') {
      twin.year = Number.parseInt(value, 10) || twin.year
    }
    if (check.key === 'PcfCO2eq') {
      twin.carbon = Number(value)
    }
  }

  async function runFixes (edits: Array<{ twin: Twin, check: Check, fix: Fix }>, value: string) {
    const result = await props.client.backend.call<{ results: Array<{ ok: boolean, error?: string }>, applied: number }>('fix', {
      edits: edits.map(edit => ({ submodelId: edit.fix.submodelId, idShortPath: edit.fix.idShortPath, value })),
    })
    for (const [position, outcome] of result.results.entries()) {
      if (outcome.ok) {
        fulfil(edits[position]!.twin, edits[position]!.check, value)
      }
    }
    painter.invalidate()
    relayout()
    return result
  }

  async function fixOne (check: Check, value: string, done: () => void) {
    const twin = focused.value
    if (!twin || !check.fix) {
      done()
      return
    }
    try {
      const result = await runFixes([{ twin, check, fix: check.fix }], value)
      if (result.applied === 1) {
        void props.client.ui.notify(`${twin.name}: passport ${Math.round(twin.readiness * 100)} % ready`, 'success')
      } else {
        void props.client.ui.notify(result.results[0]?.error ?? 'The value was not accepted.', 'error')
      }
    } finally {
      done()
    }
  }

  async function applyBulk () {
    if (!bulk.value || !bulkValue.value || !canEdit.value) {
      return
    }
    bulkBusy.value = true
    try {
      const result = await runFixes(bulk.value.edits, bulkValue.value.trim())
      const failed = result.results.length - result.applied
      void props.client.ui.notify(
        `${bulk.value.label} filled on ${result.applied} twin${result.applied === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}`,
        failed > 0 ? 'warning' : 'success',
      )
      bulkOpen.value = false
    } catch (error_) {
      void props.client.ui.notify(error_ instanceof Error ? error_.message : String(error_), 'error')
    } finally {
      bulkBusy.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Tour
  // -------------------------------------------------------------------------

  const touring = ref(false)
  const caption = ref<{ title: string, text: string } | null>(null)
  let tourTimer: ReturnType<typeof setTimeout> | undefined

  function stopTour () {
    touring.value = false
    caption.value = null
    clearTimeout(tourTimer)
  }

  function startTour () {
    closePanel()
    clearQuery()
    touring.value = true
    const fleet = painter.aggregate(rootKey)
    const steps: Array<() => void> = []
    const say = (title: string, text: string) => {
      caption.value = { title, text }
    }
    const describe = (key: string) => {
      const aggregate = painter.aggregate(key)
      return `${aggregate.twins.length} twins · passport ${Math.round(aggregate.readiness * 100)} % · ${formatCarbon(aggregate.carbon)} CO₂e${aggregate.alarms > 0 ? ` · ${aggregate.alarms} in alarm` : ''}`
    }
    steps.push(() => {
      grouping.value = 'structure'
      lens.value = 'readiness'
      atlas.value?.flyTo(rootKey)
      say(`${props.client.context.target?.name ?? 'The fleet'}, one map`, `${fleet.twins.length} digital twins, read live from the target. Color shows passport readiness.`)
    })
    // Structures first (a single plant: its lines too), twins outside any structure last.
    const children = atlas.value?.childrenOf(rootKey) ?? []
    let top = children.filter(key => key !== '__loose')
    if (top.length === 1) {
      top = [top[0]!, ...(atlas.value?.childrenOf(top[0]!) ?? [])]
    }
    top = [...top, ...children.filter(key => key === '__loose')]
    for (const key of top.slice(0, 5)) {
      steps.push(() => {
        atlas.value?.flyTo(key)
        say(twins.get(key)?.name ?? painter.describe(key, undefined).title, describe(key))
      })
    }
    const alarm = [...twins.values()].find(twin => twinStatus(twin) === 'alarm')
    const gap = [...twins.values()].filter(twin => !index.value.children.has(twin.id)).toSorted((a, b) => a.readiness - b.readiness)[0]
    if (alarm) {
      steps.push(() => {
        lens.value = 'live'
        focus(alarm.id)
        const signal = alarm.signals.find(item => signalStatus(item) === 'alarm')
        say(`Alarm: ${alarm.name}`, signal ? `${signal.label} at ${signal.value.toLocaleString('en', { maximumFractionDigits: 1 })} ${signal.unit}. The pulse rises through every assembly above it.` : 'An alarm limit is exceeded.')
      })
    }
    if (gap) {
      steps.push(() => {
        lens.value = 'readiness'
        focus(gap.id)
        say(`Biggest passport gap: ${gap.name}`, `${Math.round(gap.readiness * 100)} % ready – ${gap.checks.filter(check => !check.ok).map(check => check.label.toLowerCase()).slice(0, 3).join(', ')} missing.`)
      })
    }
    steps.push(() => {
      closePanel()
      lens.value = 'carbon'
      atlas.value?.flyTo(rootKey)
      say('Carbon lens', `The fleet re-weighs itself: size and color show CO₂e. ${formatCarbon(fleet.carbon)} in total.`)
    }, () => {
      lens.value = 'readiness'
      atlas.value?.flyTo(rootKey)
      say('Ask the fleet', 'Try “motors over 5 kW without carbon footprint” – or lasso an area and fill its passport gaps at once.')
    })
    let position = 0
    const next = () => {
      if (!touring.value) {
        return
      }
      if (position >= steps.length) {
        stopTour()
        return
      }
      steps[position++]!()
      tourTimer = setTimeout(next, 5200)
    }
    next()
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  function applyTheme () {
    const theme = context.value.theme
    atlas.value?.setTheme({
      dark: theme.dark,
      background: theme.colors.background ?? (theme.dark ? '#0b0f17' : '#f6f7fb'),
      surface: theme.colors.surface ?? (theme.dark ? '#121826' : '#ffffff'),
      onSurface: theme.colors['on-surface'] ?? (theme.dark ? '#e5e7eb' : '#1f2937'),
      primary: theme.colors.primary ?? '#3b82f6',
    })
  }

  function onKey (event: KeyboardEvent) {
    const typing = event.target instanceof HTMLInputElement
    if (event.key === '/' && !typing) {
      event.preventDefault()
      askField.value?.focus()
    } else if (event.key === 'Escape') {
      if (touring.value) {
        stopTour()
      } else if (selected.value.length > 0) {
        clearSelection()
      } else if (clauses.value.length > 0) {
        clearQuery()
      } else if (focusId.value) {
        const parent = index.value.parent.get(focusId.value)
        if (parent) {
          focus(parent)
        } else {
          showAll()
        }
      } else {
        lassoMode.value = false
      }
    }
  }

  onMounted(() => {
    atlas.value = new Atlas(canvas.value!, {
      paint: painter.paint,
      describe: painter.describe,
      glyph: props.glyph,
      onClick: (key, twin) => {
        if (touring.value) {
          stopTour()
        }
        if (twin) {
          focus(twin.id)
        } else if (key) {
          atlas.value?.flyTo(key)
        }
      },
      onLasso: keys => {
        selected.value = keys
        lassoMode.value = false
      },
      onUserCamera: () => {
        if (touring.value) {
          stopTour()
        }
      },
    })
    // The top overlays (figures, question, lenses) cover about 110 px.
    atlas.value.setInsets(110)
    applyTheme()
    props.client.onContext(applyTheme)
    window.addEventListener('keydown', onKey)
    void load()
  })

  onBeforeUnmount(() => {
    atlas.value?.destroy()
    clearTimeout(pulseTimer)
    clearTimeout(tourTimer)
    window.removeEventListener('keydown', onKey)
  })
</script>
