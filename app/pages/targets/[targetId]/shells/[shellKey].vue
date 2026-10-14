<template>
  <div>
    <!-- The drawers register with the app layout from inside the page. -->
    <ShellListDrawer :active-key="shellKey" :target-id="targetId" />

    <v-container>
      <ProblemAlert v-if="target.error.value" :error="target.error.value" retry @retry="target.refetch()" />

      <TargetAuthorization
        v-else-if="target.data.value && (target.needsAuthorization.value || authRequired)"
        :target="target.data.value"
        @authorized="onAuthorized"
      />

      <ProblemAlert v-else-if="shell.error.value" :error="shell.error.value" retry @retry="shell.refetch()" />

      <v-skeleton-loader v-else-if="!shell.data.value || !target.data.value" type="card, article" />

      <template v-else>
        <!-- Shell header: title and a muted meta line, then the identifiers
             as a description list. Phones keep the star and a menu. -->
        <v-card class="mb-3">
          <v-card-item class="pa-3">
            <template #prepend>
              <ShellAvatar
                class="me-1"
                :icon-size="smAndUp ? 28 : 24"
                :shell="{ key: shellKey, idShort: shellJson.idShort ?? null, assetKind, thumbnail: hasThumbnail, thumbnailUrl }"
                :size="smAndUp ? 48 : 40"
                :target-id="targetId"
                :thumbnails="capabilities.files"
              />
            </template>

            <v-card-title class="ma-0 text-wrap text-break" :class="smAndUp ? 'text-title-large' : 'text-title-medium'" tag="h1">{{ shellLabel }}</v-card-title>

            <div class="d-flex flex-wrap align-center gc-3 text-body-small text-medium-emphasis">
              <span v-for="item in headerMeta" :key="item.text" class="d-inline-flex align-center ga-1" :class="item.class">
                <v-icon :icon="item.icon" size="14" />
                {{ item.text }}
              </span>
            </div>

            <template #append>
              <div class="d-flex align-center ga-1">
                <WorkspaceActions v-if="target.data.value.workspace" :target="target.data.value" @error="error => (actionError = error)" />

                <template v-if="smAndUp">
                  <v-btn
                    v-if="canShare"
                    prepend-icon="mdi-account-multiple-plus-outline"
                    :text="t('share.share')"
                    @click="shareOpen = true"
                  />

                  <v-menu v-if="capabilities.export">
                    <template #activator="{ props: activator }">
                      <v-btn
                        v-bind="activator"
                        append-icon="mdi-chevron-down"
                        color="primary"
                        prepend-icon="mdi-download"
                        :text="t('shell.export')"
                        variant="tonal"
                      />
                    </template>

                    <v-card>
                      <v-list>
                        <v-list-item
                          v-for="format in exportFormats"
                          :key="format.value"
                          :href="`${apiBasePath}/targets/${targetId}/shells/${shellKey}/export?format=${format.value}`"
                          :prepend-icon="format.icon"
                          :subtitle="format.subtitle"
                          :title="format.title"
                        />
                      </v-list>
                    </v-card>
                  </v-menu>
                </template>

                <!-- Everything else; on phones also export, share and the identifiers. -->
                <v-menu v-if="!smAndUp || canDelete">
                  <template #activator="{ props: activator }">
                    <v-btn v-bind="activator" :aria-label="t('shell.more')" icon="mdi-dots-vertical" />
                  </template>

                  <v-card>
                    <v-list>
                      <template v-if="!smAndUp">
                        <template v-if="capabilities.export">
                          <v-list-subheader :title="t('shell.export')" />

                          <v-list-item
                            v-for="format in exportFormats"
                            :key="format.value"
                            :href="`${apiBasePath}/targets/${targetId}/shells/${shellKey}/export?format=${format.value}`"
                            :prepend-icon="format.icon"
                            :title="format.title"
                          />

                          <v-divider class="my-1" />
                        </template>

                        <v-list-item v-if="canShare" prepend-icon="mdi-account-multiple-plus-outline" :title="t('share.share')" @click="shareOpen = true" />

                        <v-list-item v-if="globalAssetId" prepend-icon="mdi-qrcode" :title="t('qr.show')" @click="qrOpen = true" />

                        <v-list-item
                          :prepend-icon="showIdentifiers ? 'mdi-information-off-outline' : 'mdi-information-outline'"
                          :title="showIdentifiers ? t('shell.hideIdentifiers') : t('shell.showIdentifiers')"
                          @click="showIdentifiers = !showIdentifiers"
                        />
                      </template>

                      <template v-if="canDelete">
                        <v-divider v-if="!smAndUp" class="my-1" />
                        <v-list-item base-color="error" prepend-icon="mdi-delete-outline" :title="t('shell.delete')" @click="confirmDelete = true" />
                      </template>
                    </v-list>
                  </v-card>
                </v-menu>
              </div>
            </template>
          </v-card-item>

          <!-- Identifiers: label column, value and its copy button side by side,
               and the global asset ID as a QR code. Phones stack label and
               value and show them on request. -->
          <template v-if="smAndUp || showIdentifiers">
            <v-divider />

            <div class="d-flex align-center ga-3 px-3 py-2">
              <div class="flex-grow-1 overflow-hidden">
                <!-- A fixed label column: the card's width depends on the drawers, not on the window. -->
                <div
                  v-for="row in identifiers"
                  :key="row.label"
                  class="d-flex text-body-small"
                  :class="smAndUp ? 'align-center' : 'flex-column mb-1'"
                >
                  <v-sheet
                    class="d-flex align-center ga-2 flex-shrink-0 text-medium-emphasis text-no-wrap"
                    color="transparent"
                    :width="smAndUp ? 136 : undefined"
                  >
                    <v-icon :icon="row.icon" size="16" />
                    {{ row.label }}
                  </v-sheet>

                  <div class="d-flex align-center ga-1 overflow-hidden">
                    <span :class="smAndUp ? 'text-truncate' : 'text-break'" :title="row.value">{{ row.value }}</span>
                    <v-btn :aria-label="t('common.copyLabel', { label: row.label })" icon="mdi-content-copy" size="x-small" @click="copy(row.value, row.label)" />
                  </div>
                </div>
              </div>

              <v-btn
                v-if="globalAssetId && smAndUp"
                v-tooltip="t('qr.show')"
                :aria-label="t('qr.show')"
                class="pa-1 flex-shrink-0"
                height="72"
                min-width="0"
                width="72"
                @click="qrOpen = true"
              >
                <v-img :alt="t('qr.alt', { id: globalAssetId })" :src="qrPreview" width="64" />
              </v-btn>
            </div>
          </template>
        </v-card>

        <ProblemAlert v-if="actionError" class="mb-4" :error="actionError" />

        <!-- Tabs -->
        <v-tabs v-model="tab" class="mb-3">
          <v-tab prepend-icon="mdi-file-tree-outline" :text="t('shell.tabs.submodels')" value="submodels" />
          <v-tab prepend-icon="mdi-view-dashboard-variant-outline" :text="t('shell.tabs.overview')" value="overview" />
          <v-tab v-if="capabilities.changeFeed" prepend-icon="mdi-timeline-clock-outline" :text="t('shell.tabs.changes')" value="changes" />
          <v-tab prepend-icon="mdi-code-json" :text="t('shell.tabs.json')" value="json" />
        </v-tabs>

        <v-tabs-window v-model="tab">
          <v-tabs-window-item value="submodels">
            <v-card>
              <!-- One row at every width: the filter takes the free space, the
                   controls are icon buttons with tooltips (D10). A past state
                   is named in the alert below. -->
              <div class="d-flex align-center ga-1 px-3 py-2">
                <v-text-field
                  v-model="treeSearch"
                  class="flex-grow-1 me-1"
                  clearable
                  density="compact"
                  min-width="120"
                  :placeholder="t('shell.filterElements')"
                  prepend-inner-icon="mdi-filter-variant"
                />

                <v-menu v-if="capabilities.history" v-model="historyMenu" :close-on-content-click="false">
                  <template #activator="{ props: activator }">
                    <v-btn
                      v-tooltip="asOf ? asOfLabel : t('history.pickHint')"
                      v-bind="activator"
                      :aria-label="asOf ? asOfLabel : t('history.now')"
                      :color="asOf ? 'warning' : undefined"
                      icon="mdi-history"
                      size="small"
                      :variant="asOf ? 'tonal' : 'text'"
                    />
                  </template>

                  <v-card>
                    <v-date-picker
                      :max="new Date()"
                      :model-value="asOf"
                      show-adjacent-months
                      :title="t('history.pick')"
                      @update:model-value="pickDate"
                    />
                  </v-card>
                </v-menu>

                <v-btn
                  v-tooltip="autoRefresh ? t('shell.autoRefreshOn', { seconds: preferences.preferences.value.refreshIntervalSeconds }) : t('shell.autoRefreshOff')"
                  :aria-label="t('shell.autoRefresh')"
                  :aria-pressed="autoRefresh"
                  :color="autoRefresh ? 'primary' : undefined"
                  :disabled="Boolean(asOf)"
                  :icon="autoRefresh ? 'mdi-sync' : 'mdi-sync-off'"
                  size="small"
                  :variant="autoRefresh ? 'tonal' : 'text'"
                  @click="preferences.update(current => ({ ...current, autoRefresh: !current.autoRefresh }))"
                />

                <v-btn
                  v-tooltip="t('shell.expandAll')"
                  :aria-label="t('shell.expandAll')"
                  icon="mdi-unfold-more-horizontal"
                  :loading="expanding"
                  size="small"
                  @click="expandAll"
                />

                <v-btn
                  v-tooltip="t('shell.collapseAll')"
                  :aria-label="t('shell.collapseAll')"
                  icon="mdi-unfold-less-horizontal"
                  size="small"
                  @click="opened = []"
                />
              </div>

              <v-divider />

              <v-expand-transition>
                <v-alert
                  v-if="asOf"
                  density="compact"
                  icon="mdi-history"
                  rounded="0"
                  :text="t('history.readOnly', { date: asOfLabel })"
                  type="warning"
                >
                  <template #append>
                    <v-btn :text="t('history.backToNow')" @click="asOf = null" />
                  </template>
                </v-alert>
              </v-expand-transition>

              <ProblemAlert
                v-if="refs.error.value"
                class="ma-2"
                :error="refs.error.value"
                retry
                @retry="refs.refetch()"
              />

              <v-progress-linear v-else-if="refs.isLoading.value || trees.loading.value" />

              <div v-if="refs.data.value && submodelRefs.length === 0" class="pa-4 text-medium-emphasis">{{ t('shell.noSubmodels') }}</div>

              <v-treeview
                v-else
                v-model:activated="activated"
                v-model:opened="opened"
                active-strategy="single-independent"
                class="pa-2"
                indent-lines="default"
                item-props
                item-title="title"
                item-value="id"
                :items="treeItems"
                :load-children="loadChildren"
                :search="treeSearch ?? undefined"
              >
                <template #prepend="{ item }">
                  <v-icon v-if="item.more" icon="mdi-dots-horizontal" />

                  <v-icon v-else :color="item.unavailable ? undefined : 'primary'" :icon="item.unavailable === 'forbidden' ? 'mdi-lock-outline' : modelTypeIcon(item.modelType)" />
                </template>

                <template #title="{ item }">
                  <span v-if="item.more" class="text-primary">{{ t('shell.showMore', { count: Math.min(levelPageSize, item.more.remaining), remaining: item.more.remaining }) }}</span>

                  <span v-else-if="item.unavailable" v-tooltip="t(`shell.unavailable.${item.unavailable}`)" class="text-disabled">{{ item.title }}</span>

                  <span v-else :class="item.modelType === 'Submodel' ? 'font-weight-semibold' : undefined">
                    {{ item.variableGroup ? t(`variables.${item.variableGroup}`) : item.title }}
                  </span>
                </template>

                <template #append="{ item }">
                  <template v-if="item.modelType === 'Submodel'">
                    <v-chip
                      v-if="item.refreshable && refreshSeconds"
                      class="me-1"
                      color="success"
                      prepend-icon="mdi-refresh-auto"
                      size="x-small"
                      :text="t('shell.autoRefresh')"
                    />

                    <v-chip v-if="mdAndUp && item.semanticId" size="x-small" :text="semanticLabel(item.semanticId)" />
                  </template>

                  <span v-else-if="item.preview" class="text-body-small text-medium-emphasis text-truncate ms-2">{{ item.preview }}</span>
                </template>
              </v-treeview>
            </v-card>
          </v-tabs-window-item>

          <v-tabs-window-item value="overview">
            <ShellOverview v-if="tab === 'overview'" :refs="submodelRefs" :shell-id="shellId" :target="target.data.value" />
          </v-tabs-window-item>

          <v-tabs-window-item value="changes">
            <ShellChanges
              v-if="tab === 'changes'"
              :refs="submodelRefs"
              :shell-id="shellId"
              :shell-label="shellLabel"
              :target-id="targetId"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="json">
            <v-card height="600">
              <JsonPanel :file-name="jsonFileName" :label="t('shell.jsonLabel')" :value="shellJson" />
            </v-card>
          </v-tabs-window-item>
        </v-tabs-window>

        <AssetQrDialog v-if="globalAssetId" v-model="qrOpen" :content="globalAssetId" :file-name="shellJson.idShort ?? 'asset'" />

        <ShareDialog
          v-if="canShare"
          v-model="shareOpen"
          :shell-key="shellKey"
          :shell-label="shellLabel"
          :target-id="targetId"
        />

        <v-dialog v-model="confirmDelete" max-width="420">
          <DialogCard :title="t('shell.deleteTitle')">
            {{ t('shell.deleteText', { name: shellLabel, count: submodelRefs.length }) }}

            <template #actions>
              <v-btn :text="t('common.cancel')" @click="confirmDelete = false" />
              <v-btn-primary color="error" :loading="deleting" :text="t('shell.delete')" @click="remove" />
            </template>
          </DialogCard>
        </v-dialog>
      </template>
    </v-container>

    <ElementDetailsDrawer
      v-if="target.data.value && shell.data.value"
      v-model:mode="detailsMode"
      v-model:view="detailsView"
      :at="asOfIso"
      :can-invoke="canInvoke"
      :can-write="canWrite"
      :capabilities="capabilities"
      :history="selectedItem ? (trees.history.value.get(selectedItem.id) ?? []) : []"
      :item="selectedItem"
      :refreshing="Boolean(refreshSeconds)"
      :shell-id="shellId"
      :submodel-label="selectedSubmodelLabel"
      :submodel-ref="selectedRef"
      :target="target.data.value"
      @changed="onElementChanged"
      @select="select"
    />
  </div>
</template>

<script lang="ts" setup>
  import type { DeleteResult, EffectiveRights, ElementDetail, ShellDetail, SubmodelRef, TargetCapabilities } from '#shared/contract'
  import type { ShellTreeItem } from '~/composables/useShellTrees'
  import type { DetailsMode } from '~/utils/aas'
  import { useQuery, useQueryCache } from '@pinia/colada'
  import { useDisplay } from 'vuetify'
  import { apiBasePath, noCapabilities } from '#shared/contract'
  import { expandAllCap, itemId, levelPageSize } from '~/composables/useShellTrees'
  import { StudioApiError } from '~/composables/useStudioApi'
  import { detailsModes, langText, modelTypeIcon } from '~/utils/aas'
  import { identificationLinkSvg, svgDataUrl } from '~/utils/qr'

  const { t, locale } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const api = useStudioApi()
  const invalidate = useInvalidate()
  const queryCache = useQueryCache()
  const ui = useUiStore()
  const copy = useClipboard()
  const preferences = usePreferences()
  const notifications = useNotificationsStore()
  const { smAndUp, mdAndUp } = useDisplay()

  const targetId = computed(() => String(route.params.targetId))
  const shellKey = computed(() => String(route.params.shellKey))
  const target = useTarget(targetId)
  const ready = () => target.data.value !== undefined && !target.needsAuthorization.value

  const shell = useQuery({
    key: () => ['targets', targetId.value, 'shells', shellKey.value],
    query: ({ signal }) => api<ShellDetail>(`/targets/${targetId.value}/shells/${shellKey.value}`, { signal }),
    enabled: ready,
  })

  const refs = useQuery({
    key: () => ['targets', targetId.value, 'shells', shellKey.value, 'submodel-refs'],
    query: ({ signal }) => api<{ items: SubmodelRef[] }>(`/targets/${targetId.value}/shells/${shellKey.value}/submodel-refs`, { signal }),
    enabled: ready,
  })

  const capabilities = computed<TargetCapabilities>(() => target.data.value?.capabilities ?? noCapabilities)
  const rights = useQuery({
    key: () => ['targets', targetId.value, 'shells', shellKey.value, 'rights'],
    query: ({ signal }) => api<EffectiveRights>(`/targets/${targetId.value}/shells/${shellKey.value}/rights`, { signal }),
    enabled: () => ready() && Boolean(target.data.value?.capabilities.sharing),
  })
  const can = (action: keyof EffectiveRights) => !capabilities.value.sharing || (rights.data.value?.[action] ?? false)

  const shellJson = computed(() => (shell.data.value?.shell ?? {}) as Record<string, any>)
  const shellId = computed(() => String(shellJson.value.id ?? ''))
  const jsonFileName = computed(() => `${String(shellJson.value.idShort ?? 'shell').replaceAll(/[^\w-]/g, '_')}.json`)
  const shellLabel = computed(() => langText(shellJson.value.displayName ?? [], preferences.preferences.value.valueLanguage) ?? shellJson.value.idShort ?? shellId.value)
  const assetKind = computed(() => (shellJson.value.assetInformation?.assetKind as string | undefined) ?? null)
  const assetType = computed(() => (shellJson.value.assetInformation?.assetType as string | undefined) ?? null)
  // The idShort only when the title is a display name, so nothing repeats.
  /** The muted line under the title: idShort, kind, submodels, target. */
  const headerMeta = computed(() => [
    ...(shellJson.value.idShort && shellJson.value.idShort !== shellLabel.value ? [{ text: String(shellJson.value.idShort), icon: '$aas', class: undefined }] : []),
    ...(assetKind.value ? [{ text: t('shell.assetKind', { kind: assetKind.value }), icon: 'mdi-shape-outline', class: assetKind.value === 'Type' ? 'text-warning' : undefined }] : []),
    { text: t('shell.submodelCount', submodelRefs.value.length), icon: 'mdi-folder-multiple-outline', class: undefined },
    ...(target.data.value ? [{ text: target.data.value.name, icon: 'mdi-server-network', class: undefined }] : []),
  ])
  const thumbnailUrl = computed(() => {
    const path = shellJson.value.assetInformation?.defaultThumbnail?.path
    return typeof path === 'string' && /^https?:\/\//i.test(path) ? path : null
  })
  const hasThumbnail = computed(() => typeof shellJson.value.assetInformation?.defaultThumbnail?.path === 'string')
  const submodelRefs = computed(() => refs.data.value?.items ?? [])

  const identifiers = computed(() => [
    { label: t('shell.identifier'), value: shellId.value, icon: 'mdi-identifier' },
    ...(shellJson.value.assetInformation?.globalAssetId
      ? [{ label: t('shell.globalAssetId'), value: String(shellJson.value.assetInformation.globalAssetId), icon: 'mdi-barcode' }]
      : []),
    ...(assetType.value ? [{ label: t('shell.assetType'), value: assetType.value, icon: 'mdi-tag-outline' }] : []),
  ])

  // In view mode nothing can be changed (plan D8); with sharing, the user's rights decide (D15).
  const asOf = ref<Date | null>(null)
  const canWrite = computed(() => ui.editing && capabilities.value.write && can('update') && !asOf.value)
  const canDelete = computed(() => ui.editing && capabilities.value.deleteShells && can('delete'))
  const canInvoke = computed(() => capabilities.value.operations && can('execute') && !asOf.value)
  const canShare = computed(() => capabilities.value.sharing && can('manage'))

  const exportFormats = computed(() => [
    { value: 'aasx', title: t('shell.formats.aasx'), subtitle: '.aasx', icon: 'mdi-package-variant-closed' },
    { value: 'json', title: t('shell.formats.json'), subtitle: '.json', icon: 'mdi-code-json' },
    { value: 'xml', title: t('shell.formats.xml'), subtitle: '.xml', icon: 'mdi-xml' },
  ])

  const tab = computed({
    get: () => {
      const value = typeof route.query.tab === 'string' ? route.query.tab : 'submodels'
      return value === 'changes' && !capabilities.value.changeFeed ? 'submodels' : value
    },
    set: (value: string) => router.replace({ query: { ...route.query, tab: value === 'submodels' ? undefined : value } }),
  })

  // Point in time: the end of the chosen day, or now for today.
  const historyMenu = ref(false)
  const asOfIso = computed(() => {
    if (!asOf.value) {
      return null
    }
    const end = new Date(asOf.value)
    end.setHours(23, 59, 59, 999)
    return (end > new Date() ? new Date() : end).toISOString()
  })
  const asOfLabel = computed(() => asOf.value?.toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' }) ?? '')
  function pickDate (value: unknown) {
    asOf.value = value instanceof Date ? value : null
    historyMenu.value = false
  }

  const autoRefresh = computed(() => preferences.preferences.value.autoRefresh)
  const refreshSeconds = computed(() => preferences.preferences.value.autoRefresh && !asOf.value ? preferences.preferences.value.refreshIntervalSeconds : null)
  const opened = ref<string[]>([])
  const treeSearch = ref<string | null>('')
  const trees = useShellTrees({
    targetId: () => targetId.value,
    refs: () => submodelRefs.value,
    at: () => asOfIso.value,
    refreshSeconds: () => refreshSeconds.value,
    opened: () => opened.value,
    unpaged: () => Boolean(treeSearch.value),
  })
  const treeItems = computed(() => trees.items.value.map(item => item.unavailable ? { ...item, disabled: true } : item))

  async function loadChildren (raw: unknown) {
    await trees.loadChildren(raw as ShellTreeItem)
  }

  // Expands the opened submodels (or all, if none is open) as far as the cap allows.
  const expanding = ref(false)
  async function expandAll () {
    expanding.value = true
    try {
      const openSubmodels = trees.items.value.filter(item => opened.value.includes(item.id)).map(item => item.id)
      const { ids, capped } = await trees.expandAll(openSubmodels.length > 0 ? openSubmodels : trees.items.value.map(item => item.id))
      opened.value = [...new Set([...opened.value, ...ids])]
      if (capped) {
        notifications.notify({ text: t('shell.expandCapped', { count: expandAllCap.toLocaleString(locale.value) }), color: 'info' })
      }
    } finally {
      expanding.value = false
    }
  }

  /** Short label of a semantic ID for the submodel chip, e.g. `Nameplate 3.0`. */
  function semanticLabel (semanticId: string): string {
    const idta = /\/([A-Z]+)\/(\d+)\/(\d+)(?:\/[A-Z]+)?$/i.exec(semanticId)
    return idta ? `${idta[1]} ${idta[2]}.${idta[3]}` : (semanticId.split(/[/#]/).findLast(Boolean) ?? semanticId)
  }

  // Selection lives in the URL (`submodel`, `element`), so it can be shared and survives reloads.
  const selectedId = computed(() => {
    const submodel = typeof route.query.submodel === 'string' ? route.query.submodel : null
    const element = typeof route.query.element === 'string' ? route.query.element : null
    return submodel ? itemId(submodel, element) : null
  })

  const selectedItem = computed(() => selectedId.value ? trees.lookup(selectedId.value) : null)
  const selectedSubmodelLabel = computed(() => trees.items.value.find(item => item.id === selectedItem.value?.submodelKey)?.title ?? null)
  const selectedRef = computed(() => submodelRefs.value.find(ref => ref.key === selectedItem.value?.submodelKey) ?? null)

  // The drawer's mode and app view (R3); a `view` alone (MVP-3 links) opens the visualization.
  const detailsMode = computed<DetailsMode>({
    get: () => {
      const value = route.query.mode
      if (typeof value === 'string' && (detailsModes as readonly string[]).includes(value)) {
        return value as DetailsMode
      }
      return typeof route.query.view === 'string' ? 'visualization' : 'details'
    },
    set: (value: DetailsMode) => router.replace({ query: { ...route.query, mode: value === 'details' ? undefined : value, view: value === 'visualization' ? route.query.view : undefined } }),
  })
  const detailsView = computed<string | null>({
    get: () => (typeof route.query.view === 'string' ? route.query.view : null),
    set: (value: string | null) => router.replace({ query: { ...route.query, view: value ?? undefined } }),
  })

  function select (id: string | null) {
    const found = id ? trees.lookup(id) : null
    if (found?.more) {
      trees.showMore(found.more.parent)
      return
    }
    void router.replace({ query: { ...route.query, submodel: found?.submodelKey, element: found?.elementKey ?? undefined } })
    ui.detailsDrawer = Boolean(found)
  }

  const activated = computed({
    get: () => (selectedId.value ? [selectedId.value] : []),
    set: (ids: unknown[]) => select((ids[0] as string | undefined) ?? null),
  })

  // Open the first submodel when the tree appears.
  watch(() => trees.items.value.length, (count, before) => {
    if (count > 0 && !before && opened.value.length === 0) {
      opened.value = trees.items.value.filter(item => !item.unavailable).slice(0, 1).map(item => item.id)
    }
  })

  // A selection made elsewhere (deep link, search): load and open its path,
  // which the element's ancestors name.
  const revealing = ref<string | null>(null)
  watch([selectedId, () => submodelRefs.value.length, asOfIso], async ([id]) => {
    const submodel = typeof route.query.submodel === 'string' ? route.query.submodel : null
    const element = typeof route.query.element === 'string' ? route.query.element : null
    if (!id || !submodel || revealing.value === id || !submodelRefs.value.some(ref => ref.key === submodel && ref.status === 'available')) {
      return
    }
    revealing.value = id
    try {
      let ancestors: string[] = []
      if (element && !trees.lookup(id)) {
        const detail = await api<ElementDetail>(`/targets/${targetId.value}/submodels/${submodel}/elements/${element}`, { query: { at: asOfIso.value ?? undefined } })
        ancestors = detail.ancestors.map(ancestor => ancestor.key)
      } else if (element) {
        ancestors = trail(id)
      }
      const path = await trees.reveal(submodel, ancestors, element)
      if (path && selectedId.value === id) {
        opened.value = [...new Set([...opened.value, ...path])]
        ui.detailsDrawer = true
      }
    } catch {
      // The drawer shows why the element cannot be read.
      ui.detailsDrawer = true
    } finally {
      revealing.value = null
    }
  }, { immediate: true })

  /** Element keys of the loaded items above an item. */
  function trail (id: string): string[] {
    const walk = (list: ShellTreeItem[], path: string[]): string[] | null => {
      for (const item of list) {
        if (item.id === id) {
          return path
        }
        const found = walk(item.children ?? [], item.elementKey ? [...path, item.elementKey] : path)
        if (found) {
          return found
        }
      }
      return null
    }
    return walk(trees.items.value, []) ?? []
  }

  watch([targetId, shellKey], () => {
    asOf.value = null
    opened.value = []
  })
  // Remembered once the shell is loaded, with the title the user saw.
  watch(() => shell.data.value?.key, key => {
    if (key) {
      void preferences.rememberShell(targetId.value, key, shellLabel.value)
    }
  }, { immediate: true })

  async function onElementChanged (detail: ElementDetail) {
    if (selectedItem.value) {
      await trees.refresh(selectedItem.value.submodelKey)
    }
    // A workspace now has unsaved changes.
    await queryCache.invalidateQueries({ key: ['targets', targetId.value], exact: true })
    void detail
  }

  const shareOpen = ref(false)
  const showIdentifiers = ref(false)
  const qrOpen = ref(false)
  const globalAssetId = computed(() => typeof shellJson.value.assetInformation?.globalAssetId === 'string' ? shellJson.value.assetInformation.globalAssetId as string : null)
  const qrPreview = computed(() => globalAssetId.value ? svgDataUrl(identificationLinkSvg(globalAssetId.value)) : '')
  const confirmDelete = ref(false)
  const deleting = ref(false)
  const actionError = ref<unknown>(null)

  async function remove () {
    deleting.value = true
    actionError.value = null
    try {
      const result = await api<DeleteResult>(`/targets/${targetId.value}/shells/${shellKey.value}`, { method: 'DELETE' })
      confirmDelete.value = false
      const failed = result.sync.filter(step => step.outcome === 'failed').length
      notifications.notify(failed > 0
        ? { text: t('shell.deletedSyncFailed', { name: shellLabel.value, count: failed }), color: 'warning' }
        : { text: t('shell.deleted', { name: shellLabel.value }), color: 'success' })
      await invalidate(['targets', targetId.value, 'shells'], ['targets', targetId.value])
      await router.push(`/targets/${targetId.value}/shells`)
    } catch (error) {
      confirmDelete.value = false
      actionError.value = error
    } finally {
      deleting.value = false
    }
  }

  const authRequired = computed(() => [shell.error.value, refs.error.value]
    .some(error => error instanceof StudioApiError && error.code === 'target_auth_required'))

  async function onAuthorized () {
    await invalidate(['targets', targetId.value])
  }
</script>
