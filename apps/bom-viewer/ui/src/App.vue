<template>
  <v-app>
    <!-- Studio's card shows the view's title; this line adds the version and the archetype.
         In Studio's full-screen dialog, the card fills the frame and the graph or tree the rest of it. -->
    <v-view-card :class="fullscreen ? 'd-flex flex-column' : undefined" :height="fullscreen ? '100vh' : undefined">
      <v-card-item>
        <v-card-subtitle>{{ version }}</v-card-subtitle>

        <template #append>
          <v-select
            v-if="canEdit && archetype"
            v-model="archetypeValue"
            data-test="archetype-select"
            density="compact"
            hide-details
            :items="archetypeItems"
            :label="t('bom.archetype')"
            :loading="saving"
            min-width="160"
            @update:model-value="saveArchetype"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="item.subtitle" />
            </template>
          </v-select>

          <v-chip
            v-else-if="archetype"
            data-test="archetype"
            prepend-icon="mdi-sitemap-outline"
            :text="t('bom.archetypeValue', { value: archetypeValue || '—' })"
          />
        </template>
      </v-card-item>

      <v-progress-linear v-if="loading" />

      <v-alert v-else-if="error" class="ma-4" :text="error" type="error" />

      <template v-else>
        <v-alert
          v-if="notice"
          class="mx-4 mb-2"
          closable
          data-test="notice"
          :text="notice.text"
          :type="notice.type"
          @click:close="notice = null"
        />

        <v-alert
          v-if="tree.mixed"
          class="mx-4 mb-2"
          data-test="mixed-relationships"
          :text="t('bom.mixed')"
          type="warning"
        />

        <template v-if="tree.items.length > 0">
          <div class="d-flex align-center px-4 pb-2">
            <v-btn-toggle v-model="view" mandatory>
              <v-btn data-test="view-graph" prepend-icon="mdi-graph-outline" :text="t('bom.graph')" value="graph" />
              <v-btn data-test="view-tree" prepend-icon="mdi-file-tree-outline" :text="t('bom.tree')" value="tree" />
            </v-btn-toggle>

            <v-btn
              v-if="!fullscreen"
              class="ms-auto"
              data-test="open-fullscreen"
              prepend-icon="mdi-fullscreen"
              :text="t('bom.fullscreen')"
              @click="client.ui.openFullscreen()"
            />
          </div>

          <v-divider />

          <bom-graph v-if="view === 'graph'" :fill="fullscreen" :items="tree.items" />

          <v-treeview
            v-else
            :class="fullscreen ? 'flex-grow-1 overflow-y-auto' : undefined"
            data-test="bom-tree"
            density="compact"
            :height="fullscreen ? 0 : undefined"
            indent-lines="default"
            :items="tree.items"
            lines="two"
            open-all
            open-on-click
          >
            <template #prepend="{ item }">
              <v-icon :icon="entityIcon(item)" />
            </template>

            <template #subtitle="{ item }">
              {{ item.globalAssetId ?? item.idShort }}
            </template>

            <template #append="{ item }">
              <v-chip
                v-if="item.bulkCount"
                class="ms-1"
                prepend-icon="mdi-counter"
                :text="`× ${item.bulkCount}`"
              />

              <v-chip
                v-if="item.relationship"
                class="ms-1"
                color="primary"
                :text="item.relationship"
              />
            </template>
          </v-treeview>
        </template>

        <v-card-text v-else class="text-medium-emphasis">{{ t('bom.noEntry') }}</v-card-text>
      </template>
    </v-view-card>
  </v-app>
</template>

<script lang="ts" setup>
  import type { JsonObject, StudioClient } from '@basyx/studio-sdk'
  import { StudioError } from '@basyx/studio-sdk'
  import { computed, onMounted, ref } from 'vue'
  import { loadSubmodel } from '../../../shared/app'
  import BomGraph from './BomGraph.vue'
  import { archetypes, buildTree, entityIcon, findArchetype } from './hierarchy'
  import { provideI18n } from './i18n'

  // The Hierarchical Structures enabling Bills of Material (IDTA 02011) of an
  // asset as a tree from the entry node down, ported from the BaSyx AAS Web
  // UI. In Studio's edit mode, the archetype can be changed where the target
  // and the user's rights allow it; entities are edited in Studio's editor.

  const props = defineProps<{ client: StudioClient }>()
  const { t } = provideI18n(props.client)

  const loading = ref(true)
  const error = ref<string | null>(null)
  const submodel = ref<JsonObject | null>(null)
  const notice = ref<{ type: 'success' | 'error', text: string } | null>(null)
  const archetypeValue = ref<string | null>(null)
  const saving = ref(false)
  const view = ref<'graph' | 'tree'>('graph')

  const context = ref(props.client.context)
  props.client.onContext(value => (context.value = value))
  const locale = computed(() => context.value.locale)
  const fullscreen = computed(() => context.value.fullscreen ?? false)
  const canEdit = computed(() => (context.value.target?.write ?? false) && context.value.mode === 'edit')

  /** The IDTA template version from the semantic ID, e.g. `IDTA 02011-1-1`. */
  const version = computed(() => {
    const semanticId = context.value.submodel?.semanticId ?? ''
    const match = /HierarchicalStructures\/(\d+)\/(\d+)/i.exec(semanticId)
    return match ? `IDTA 02011-${match[1]}-${match[2]}` : 'IDTA 02011'
  })

  const tree = computed(() => submodel.value ? buildTree(submodel.value, locale.value) : { items: [], mixed: false })
  const archetype = computed(() => submodel.value ? findArchetype(submodel.value) : undefined)
  const archetypeItems = computed(() => archetypes.map(value => ({ title: value, value, subtitle: t(`archetype.${value}`) })))

  function describe (cause: unknown): string {
    if (!(cause instanceof StudioError)) {
      return String(cause)
    }
    switch (cause.code) {
      case 'revision_conflict': {
        return t('bom.conflict')
      }
      case 'target_forbidden': {
        return t('bom.forbidden')
      }
      default: {
        return cause.message
      }
    }
  }

  async function load () {
    try {
      submodel.value = await loadSubmodel(props.client)
      const value = archetype.value?.element.value
      archetypeValue.value = value == null ? null : String(value)
    } catch (error_) {
      error.value = error_ instanceof StudioError ? error_.message : String(error_)
    } finally {
      loading.value = false
    }
  }

  async function saveArchetype (value: string | null) {
    const path = archetype.value?.path
    if (!path || value === null) {
      return
    }
    notice.value = null
    saving.value = true
    try {
      // The write is based on the revision read now.
      const snapshot = await props.client.aas.getElement(context.value.submodel!.id, path)
      await props.client.aas.setElementValue({ submodelId: context.value.submodel!.id, idShortPath: path, value, revision: snapshot.revision })
      await props.client.ui.notify(t('bom.archetypeSet', { value }), 'success')
    } catch (error_) {
      notice.value = { type: 'error', text: describe(error_) }
    } finally {
      saving.value = false
      await load()
    }
  }

  onMounted(load)
</script>
