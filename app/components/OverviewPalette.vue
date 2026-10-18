<template>
  <!-- The widget palette: which widgets show, and the reset of the layout. -->
  <v-menu :close-on-content-click="false">
    <template #activator="{ props: menu }">
      <v-btn v-bind="menu" data-test="overview-palette" prepend-icon="mdi-view-dashboard-edit-outline" :text="t('overview.widgets')">
        <template v-if="hiddenCount > 0" #append>
          <v-chip :text="t('overview.hiddenCount', { count: hiddenCount })" />
        </template>
      </v-btn>
    </template>

    <!-- Compact like the account menu: a title, the widgets and the reset.
         The checkbox shows what is shown, so items are not highlighted. -->
    <v-card class="overflow-y-auto" max-height="520" max-width="420" min-width="280">
      <v-list select-strategy="classic" :selected="shown" @update:selected="onSelected">
        <v-list-subheader :title="t('overview.paletteTitle')" />

        <v-list-item
          v-for="widget in widgets"
          :key="widget.id"
          :active="false"
          :subtitle="widget.subtitle ?? undefined"
          :title="widget.title"
          :value="widget.id"
        >
          <template #prepend="{ isSelected }">
            <v-list-item-action start>
              <v-checkbox-btn density="compact" :model-value="isSelected" tabindex="-1" />
            </v-list-item-action>
          </template>
        </v-list-item>

      </v-list>

      <v-divider />

      <!-- Apart from the selection above, so resetting changes no widget's visibility. -->
      <v-list>
        <v-list-item prepend-icon="mdi-restore" :title="t('overview.reset')" @click="emit('reset')" />
      </v-list>
    </v-card>
  </v-menu>
</template>

<script lang="ts" setup>
  /** A widget as the palette lists it: with the title and subtitle of its header. */
  export interface PaletteWidget {
    id: string
    title: string
    subtitle: string | null
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

  function onSelected (ids: unknown) {
    const selected = new Set(Array.isArray(ids) ? ids : [])
    emit('update:hidden', props.widgets.map(widget => widget.id).filter(id => !selected.has(id)))
  }
</script>
