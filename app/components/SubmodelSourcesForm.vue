<template>
  <!-- The submodels to create, and the fields of the one selected in the
       list beside them: every field belongs to the highlighted submodel.
       Phones show the list above the fields. -->
  <!-- Nothing to create yet: one way on, adding the first submodel. -->
  <v-empty-state
    v-if="entries.length === 0"
    icon="mdi-file-plus-outline"
    size="56"
    :text="t('wizard.noSubmodelsText')"
    :title="t('wizard.noSubmodelsTitle')"
  >
    <template #actions>
      <v-btn-primary prepend-icon="mdi-plus" :text="t('wizard.addSubmodel')" @click="add" />
    </template>
  </v-empty-state>

  <v-row v-else no-gutters>
    <v-col :class="smAndUp ? 'border-e' : 'border-b'" cols="12" sm="4">
      <v-list v-model:selected="selected" class="pa-2" mandatory nav>
        <v-list-item
          v-for="entry in entries"
          :key="entry.key"
          prepend-icon="mdi-file-outline"
          :subtitle="t(`editor.kinds.${entry.metadata.kind === 'Template' ? 'Template' : 'Instance'}`)"
          :title="String(entry.metadata.idShort || t('wizard.newSubmodel'))"
          :value="entry.key"
        >
          <template #append>
            <v-btn
              :aria-label="t('wizard.removeNamed', { name: entry.metadata.idShort || t('wizard.newSubmodel') })"
              icon="mdi-delete-outline"
              @click.stop="remove(entry.key)"
            />
          </template>
        </v-list-item>
      </v-list>

      <v-btn class="mx-2 mb-2" prepend-icon="mdi-plus" :text="t('wizard.addSubmodel')" @click="add" />
    </v-col>

    <v-col class="px-4" cols="12" sm="8">
      <!-- The same fields as the form of an existing submodel. -->
      <SubmodelFields v-if="current" :key="current.key" v-model="current.metadata" identifier />
    </v-col>
  </v-row>
</template>

<script lang="ts" setup>
  import type { SubmodelSource } from '#shared/contract'
  import { useDisplay } from 'vuetify'
  import { uniqueIdShort } from '#shared/aas/defaults'

  // The empty submodels of a new shell or an existing one: each with the same
  // fields as the form of an existing submodel. Elements are added in the tree.
  const sources = defineModel<SubmodelSource[]>({ required: true })

  interface Entry {
    key: number
    /** The submodel's own fields: idShort, ID, names, category, semantic ID, kind, qualifiers. */
    metadata: Record<string, unknown>
  }

  const { t } = useI18n()
  const { smAndUp } = useDisplay()
  const entries = ref<Entry[]>([])
  // The list's selection: the submodel whose fields are shown.
  const selected = ref<number[]>([])
  const current = computed(() => entries.value.find(entry => entry.key === selected.value[0]) ?? null)
  let counter = 0

  function add () {
    const taken = entries.value.map(entry => String(entry.metadata.idShort ?? ''))
    const entry: Entry = { key: ++counter, metadata: { idShort: uniqueIdShort('Submodel', taken), kind: 'Instance' } }
    entries.value.push(entry)
    selected.value = [entry.key]
  }

  function remove (key: number) {
    const index = entries.value.findIndex(entry => entry.key === key)
    entries.value = entries.value.filter(entry => entry.key !== key)
    if (selected.value[0] === key) {
      const next = entries.value[Math.min(index, entries.value.length - 1)]
      selected.value = next ? [next.key] : []
    }
  }

  // The sources the entries describe, for the request.
  watch(entries, list => {
    sources.value = list.map((entry): SubmodelSource => {
      const { id, idShort, ...metadata } = entry.metadata
      return {
        source: 'empty',
        idShort: typeof idShort === 'string' && idShort ? idShort : 'Submodel',
        id: typeof id === 'string' && id ? id : undefined,
        metadata,
      }
    })
  }, { deep: true })

  // A cleared list (a closed dialog) starts over.
  watch(sources, list => {
    if (list.length === 0 && entries.value.length > 0) {
      entries.value = []
      selected.value = []
    }
  })
</script>
