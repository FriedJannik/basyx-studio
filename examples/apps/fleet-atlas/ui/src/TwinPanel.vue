<template>
  <div class="pa-4">
    <div class="d-flex align-start ga-3">
      <v-avatar :color="color" size="48" variant="tonal">
        <v-icon :icon="category.icon" size="28" />
      </v-avatar>

      <div class="flex-grow-1 overflow-hidden">
        <div class="text-h6 text-truncate" data-test="twin-name">{{ twin.name }}</div>
        <div class="text-body-2 text-medium-emphasis text-truncate">{{ [twin.manufacturer, twin.designation].filter(Boolean).join(' · ') }}</div>
      </div>

      <v-btn density="comfortable" icon="mdi-close" @click="emit('close')" />
    </div>

    <div class="d-flex flex-wrap ga-1 mt-3">
      <v-chip :prepend-icon="category.icon" :text="category.label" />
      <v-chip v-if="twin.assetKind" :text="twin.assetKind" />
      <v-chip v-if="twin.year" prepend-icon="mdi-calendar" :text="String(twin.year)" />
      <v-chip v-if="twin.country" prepend-icon="mdi-earth" :text="twin.country" />
      <v-chip v-if="twin.serial" prepend-icon="mdi-barcode" :text="twin.serial" />
    </div>

    <v-alert
      v-for="signal in alarming"
      :key="signal.path"
      class="mt-3"
      density="compact"
      :text="`${signal.label}: ${format(signal.value)} ${signal.unit} (limit ${format(limitOf(signal) ?? 0)} ${signal.unit})`"
      :type="signalStatus(signal) === 'alarm' ? 'error' : 'warning'"
    />

    <!-- Passport readiness -->
    <div class="d-flex align-center ga-4 mt-5">
      <v-progress-circular
        :color="readinessColor(twin.readiness)"
        :indeterminate="false"
        :model-value="twin.readiness * 100"
        size="72"
        width="7"
      >
        <span class="text-subtitle-1 font-weight-bold" data-test="twin-readiness">{{ Math.round(twin.readiness * 100) }}%</span>
      </v-progress-circular>

      <div>
        <div class="text-subtitle-1 font-weight-medium">Product passport</div>

        <div class="text-body-2 text-medium-emphasis">
          {{ open.length === 0 ? 'Every passport check is fulfilled.' : `${open.length} of ${twin.checks.length} checks open` }}
        </div>
      </div>
    </div>

    <v-list class="mt-2" density="compact">
      <template v-for="check in twin.checks" :key="check.key">
        <v-list-item :title="check.label">
          <template #prepend>
            <v-icon :color="check.ok ? 'success' : 'error'" :icon="check.ok ? 'mdi-check-circle' : 'mdi-alert-circle-outline'" size="small" />
          </template>

          <template v-if="!check.ok" #append>
            <span v-if="!check.fix" class="text-caption text-medium-emphasis">submodel missing</span>
            <span v-else-if="!canEdit" class="text-caption text-medium-emphasis">empty</span>
          </template>
        </v-list-item>

        <div v-if="!check.ok && check.fix && canEdit" class="px-4 pb-2">
          <v-text-field
            v-model="drafts[check.key]"
            density="compact"
            :disabled="saving === check.key"
            hide-details
            :placeholder="`Enter ${check.label.toLowerCase()}`"
            :type="numeric(check) ? 'number' : 'text'"
            @keydown.enter="save(check)"
          >
            <template #append-inner>
              <v-btn
                :disabled="!drafts[check.key]"
                icon="mdi-check"
                :loading="saving === check.key"
                size="small"
                @click="save(check)"
              />
            </template>
          </v-text-field>
        </div>
      </template>
    </v-list>

    <div v-if="open.some(check => check.fix) && !canEdit" class="text-caption text-medium-emphasis px-4">
      Switch Studio to edit mode to fill the empty fields here.
    </div>

    <!-- Live data -->
    <template v-if="twin.signals.length > 0">
      <div class="text-subtitle-1 font-weight-medium mt-5 mb-2">Live data</div>

      <div v-for="signal in twin.signals" :key="signal.path" class="mb-3">
        <div class="d-flex align-baseline">
          <span class="text-body-2">{{ signal.label }}</span>
          <v-spacer />
          <span :class="['text-subtitle-1 font-weight-bold', `text-${statusClass(signal)}`]">{{ format(signal.value) }}</span>
          <span class="text-caption text-medium-emphasis ms-1">{{ signal.unit }}</span>
        </div>

        <v-sparkline
          :auto-draw="false"
          :color="statusColor(signal)"
          :fill="false"
          :gradient="[]"
          height="36"
          line-width="2"
          :model-value="history(signal)"
          :padding="2"
          smooth
        />
      </div>
    </template>

    <!-- Carbon -->
    <div class="text-subtitle-1 font-weight-medium mt-5 mb-1">Carbon footprint</div>

    <div v-if="twin.carbon !== null" class="d-flex align-baseline ga-2">
      <span class="text-h5 font-weight-bold">{{ formatCarbon(twin.carbon) }}</span>
      <span class="text-body-2 text-medium-emphasis">CO₂e, cradle to gate</span>
    </div>

    <div v-if="carbonRank" class="text-body-2 text-medium-emphasis">{{ carbonRank }}</div>
    <div v-else-if="twin.carbon === null" class="text-body-2 text-medium-emphasis">No product carbon footprint is stated.</div>

    <!-- Technical data -->
    <template v-if="twin.specs.length > 0">
      <div class="text-subtitle-1 font-weight-medium mt-5 mb-1">Technical data</div>

      <v-table density="compact">
        <tbody>
          <tr v-for="spec in twin.specs.slice(0, 10)" :key="spec.key">
            <td class="text-medium-emphasis">{{ spec.label }}</td>
            <td class="text-end">{{ typeof spec.value === 'number' ? format(spec.value) : spec.value }} {{ spec.unit }}</td>
          </tr>
        </tbody>
      </v-table>
    </template>

    <!-- Structure -->
    <template v-if="parent || parts.length > 0">
      <div class="text-subtitle-1 font-weight-medium mt-5 mb-1">Structure</div>

      <v-list density="compact">
        <v-list-item
          v-if="parent"
          prepend-icon="mdi-arrow-up-left"
          :subtitle="'Part of'"
          :title="parent.name"
          @click="emit('focus', parent.id)"
        />
      </v-list>

      <div v-if="parts.length > 0" class="d-flex flex-wrap ga-1">
        <v-chip
          v-for="part in parts"
          :key="part.id"
          :prepend-icon="categories[part.category]?.icon"
          :text="part.designation || part.name"
          @click="emit('focus', part.id)"
        />
      </div>
    </template>

    <!-- Submodels -->
    <div class="text-subtitle-1 font-weight-medium mt-5 mb-1">Submodels</div>

    <div class="d-flex flex-wrap ga-1">
      <v-chip v-for="submodel in twin.submodels" :key="submodel.id" :color="submodel.status === 'available' ? undefined : 'error'" :text="submodel.idShort ?? submodel.id" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { FleetIndex } from './fleet'
  import type { Check, Signal, Twin } from './types'
  import { computed, reactive, ref } from 'vue'
  import { formatCarbon, signalStatus } from './fleet'
  import { categories, readinessColor, statusColors } from './lenses'

  const props = defineProps<{
    twin: Twin
    index: FleetIndex
    canEdit: boolean
    histories: Map<string, number[]>
    /** Changes whenever live values or fixes update the fleet. */
    version: number
  }>()

  const emit = defineEmits<{
    close: []
    focus: [id: string]
    fix: [check: Check, value: string, done: () => void]
  }>()

  const drafts = reactive<Record<string, string>>({})
  const saving = ref<string | null>(null)

  const category = computed(() => categories[props.twin.category] ?? categories.device!)
  const color = computed(() => (void props.version, readinessColor(props.twin.readiness)))
  const open = computed(() => (void props.version, props.twin.checks.filter(check => !check.ok)))
  const alarming = computed(() => (void props.version, props.twin.signals.filter(signal => signalStatus(signal) !== 'normal')))
  const parent = computed(() => {
    const id = props.index.parent.get(props.twin.id)
    return id ? props.index.byId.get(id) : undefined
  })
  const parts = computed(() => (props.index.children.get(props.twin.id) ?? [])
    .map(id => props.index.byId.get(id))
    .filter((item): item is Twin => item !== undefined))

  const carbonRank = computed(() => {
    if (props.twin.carbon === null) {
      return ''
    }
    const others = [...props.index.byId.values()].filter(item => item.category === props.twin.category && item.carbon !== null)
    if (others.length < 3) {
      return ''
    }
    const higher = others.filter(item => item.carbon! > props.twin.carbon!).length
    const share = Math.round(higher / others.length * 100)
    const plural = categories[props.twin.category]?.plural.toLowerCase() ?? 'twins'
    return share <= 50 ? `Higher than ${100 - share} % of the ${others.length} ${plural} in this fleet.` : `Lower than ${share} % of the ${others.length} ${plural} in this fleet.`
  })

  const format = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 2 })
  const numeric = (check: Check) => /double|float|decimal|int/.test(check.fix?.valueType ?? '')
  const limitOf = (signal: Signal) => signalStatus(signal) === 'alarm' ? (signal.alarmAbove ?? signal.alarmBelow) : (signal.warnAbove ?? signal.warnBelow)
  const statusColor = (signal: Signal) => statusColors[signalStatus(signal)]
  const statusClass = (signal: Signal) => ({ alarm: 'error', warning: 'warning', normal: 'success', none: 'medium-emphasis' })[signalStatus(signal)]
  function history (signal: Signal) {
    void props.version
    const values = props.histories.get(`${signal.submodelId}#${signal.path}`) ?? [signal.value]
    return values.length > 1 ? values : [signal.value, signal.value]
  }

  function save (check: Check) {
    const value = drafts[check.key]?.trim()
    if (!value || saving.value) {
      return
    }
    saving.value = check.key
    emit('fix', check, value, () => {
      saving.value = null
      drafts[check.key] = ''
    })
  }
</script>
