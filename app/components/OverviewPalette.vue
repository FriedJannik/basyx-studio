<template>
  <!-- The widget palette: which widgets show, grouped as their submodels. -->
  <v-menu :close-on-content-click="false">
    <template #activator="{ props: menu }">
      <v-btn v-bind="menu" data-test="overview-palette" prepend-icon="mdi-view-dashboard-edit-outline" :text="t('overview.widgets')">
        <template v-if="hiddenCount > 0" #append>
          <v-chip :text="t('overview.hiddenCount', { count: hiddenCount })" />
        </template>
      </v-btn>
    </template>

    <v-card class="overflow-y-auto" max-height="520" max-width="420" min-width="320">
      <v-list select-strategy="classic" :selected="shown" @update:selected="onSelected">
        <template v-for="group in groups" :key="group.title">
          <v-list-subheader :title="group.title" />

          <v-list-item
            v-for="widget in group.widgets"
            :key="widget.id"
            :subtitle="widget.paletteSubtitle ?? undefined"
            :title="widget.paletteTitle"
            :value="widget.id"
          >
            <template #prepend="{ isSelected }">
              <v-list-item-action start>
                <v-checkbox-btn :model-value="isSelected" />
              </v-list-item-action>
            </template>
          </v-list-item>
        </template>
      </v-list>

      <v-divider />

      <v-list>
        <v-list-item prepend-icon="mdi-restore" :title="t('overview.reset')" @click="emit('reset')" />
      </v-list>
    </v-card>
  </v-menu>
</template>

<script lang="ts" setup>
  /** A widget as the palette lists it, under its group. */
  export interface PaletteWidget {
    id: string
    group: string
    paletteTitle: string
    paletteSubtitle: string | null
  }

  const props = defineProps<{
    widgets: PaletteWidget[]
    /** IDs of the widgets the user hid. */
    hidden: string[]
  }>()
  const emit = defineEmits<{
    'update:hidden': [ids: string[]]
    'reset': []
  }>()

  const { t } = useI18n()

  const hiddenIds = computed(() => new Set(props.hidden))
  const shown = computed(() => props.widgets.filter(widget => !hiddenIds.value.has(widget.id)).map(widget => widget.id))
  const hiddenCount = computed(() => props.widgets.length - shown.value.length)

  const groups = computed(() => {
    const byGroup = new Map<string, PaletteWidget[]>()
    for (const widget of props.widgets) {
      byGroup.set(widget.group, [...(byGroup.get(widget.group) ?? []), widget])
    }
    return [...byGroup].map(([title, widgets]) => ({ title, widgets }))
  })

  function onSelected (ids: unknown) {
    const selected = new Set(Array.isArray(ids) ? ids : [])
    emit('update:hidden', props.widgets.map(widget => widget.id).filter(id => !selected.has(id)))
  }
</script>
