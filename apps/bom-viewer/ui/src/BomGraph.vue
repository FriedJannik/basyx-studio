<template>
  <!-- Height 0 plus flex-grow fills the rest of a flex column without overflowing it. -->
  <v-sheet :class="['position-relative', fill ? 'flex-grow-1' : undefined]" :height="fill ? 0 : 560">
    <vue-flow
      :id="flowId"
      :edges="graph.edges"
      fit-view-on-init
      :max-zoom="2"
      :min-zoom="0.1"
      :nodes="graph.nodes"
      :nodes-connectable="false"
      @node-click="({ node }) => (selected = node.id)"
      @pane-click="selected = null"
    >
      <background :gap="16" :pattern-color="patternColor" />

      <template #node-bom="{ data }">
        <handle :connectable="false" :position="Position.Top" type="target" />

        <v-card
          :color="selected === data.value ? 'primary' : undefined"
          :data-node="data.value"
          :variant="selected === data.value ? 'tonal' : 'elevated'"
          :width="nodeWidth"
        >
          <v-card-item :prepend-icon="entityIcon(data)">
            <v-card-title class="text-body-large">{{ data.title }}</v-card-title>
            <v-card-subtitle>{{ data.globalAssetId ?? data.idShort }}</v-card-subtitle>
          </v-card-item>

          <v-card-text v-if="data.bulkCount || data.children" class="d-flex ga-1 pt-0">
            <v-chip v-if="data.bulkCount" prepend-icon="mdi-counter" :text="`× ${data.bulkCount}`" />
            <v-chip v-if="data.children" prepend-icon="mdi-file-tree-outline" :text="t('graph.parts', { count: data.children.length })" />
          </v-card-text>
        </v-card>

        <handle :connectable="false" :position="Position.Bottom" type="source" />
      </template>
    </vue-flow>

    <div class="position-absolute bottom-0 right-0 d-flex flex-column ga-1 ma-3">
      <v-btn
        :aria-label="t('graph.zoomIn')"
        icon="mdi-plus"
        size="small"
        variant="tonal"
        @click="zoomIn()"
      />

      <v-btn
        :aria-label="t('graph.zoomOut')"
        icon="mdi-minus"
        size="small"
        variant="tonal"
        @click="zoomOut()"
      />

      <v-btn
        :aria-label="t('graph.fit')"
        icon="mdi-fit-to-screen-outline"
        size="small"
        variant="tonal"
        @click="fitView({ padding: 0.2 })"
      />
    </div>
  </v-sheet>
</template>

<script lang="ts" setup>
  import type { BomItem } from './hierarchy'
  import type { Edge, Node } from '@vue-flow/core'
  import { Background } from '@vue-flow/background'
  import { Handle, MarkerType, Position, useVueFlow, VueFlow } from '@vue-flow/core'
  import { computed, ref } from 'vue'
  import { useTheme } from 'vuetify'
  import { entityIcon } from './hierarchy'
  import { useI18n } from './i18n'
  import '@vue-flow/core/dist/style.css'

  // The hierarchy as a graph from the entry node down, laid out as in the
  // BaSyx AAS Web UI (HierarchicalStructures_v1_x.vue): every parent is
  // centered above the total width of its subtree.

  const props = defineProps<{
    items: BomItem[]
    /** Fill the rest of a flex column (full screen) instead of a fixed height. */
    fill?: boolean
  }>()

  const { t } = useI18n()
  const flowId = 'bom'
  const nodeWidth = 240
  const spacingX = nodeWidth + 40
  const spacingY = 170

  const selected = ref<string | null>(null)
  const { fitView, zoomIn, zoomOut } = useVueFlow(flowId)

  const theme = useTheme()
  /** A theme color as a CSS color value. */
  const color = (name: string) => String(theme.current.value.colors[name])
  const patternColor = computed(() => (theme.current.value.dark ? '#555' : '#ccc'))

  const graph = computed(() => {
    const nodes: Node<BomItem>[] = []
    const edges: Edge[] = []
    const widths = new Map<string, number>()
    const width = (item: BomItem): number => {
      const value = item.children ? item.children.reduce((sum, child) => sum + width(child), 0) : spacingX
      widths.set(item.value, value)
      return value
    }
    const place = (item: BomItem, left: number, depth: number) => {
      const subtree = widths.get(item.value)!
      nodes.push({ id: item.value, type: 'bom', position: { x: left + subtree / 2 - spacingX / 2, y: depth * spacingY }, data: item })
      let childLeft = left
      for (const child of item.children ?? []) {
        place(child, childLeft, depth + 1)
        // IsPartOf points upwards, the other relationships downwards.
        const marker = child.relationship === 'IsPartOf' ? MarkerType.Arrow : MarkerType.ArrowClosed
        edges.push({
          id: `${item.value}->${child.value}`,
          source: item.value,
          target: child.value,
          type: 'smoothstep',
          label: child.relationship || undefined,
          style: { stroke: color('primary') },
          labelStyle: { fill: color('on-surface') },
          labelBgStyle: { fill: color('surface') },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 4,
          markerEnd: { type: marker, color: color('primary'), width: 20, height: 20 },
        })
        childLeft += widths.get(child.value)!
      }
    }
    let left = 0
    for (const root of props.items) {
      width(root)
      place(root, left, 0)
      left += widths.get(root.value)!
    }
    return { nodes, edges }
  })
</script>
