<template>
  <!-- The semantic ID and what it means, in one place for elements and
       submodels: the reference, the concept description it names (or a way to
       create one), and linking one of the target's concept descriptions
       (MVP-6 plan, E1, E5). -->
  <FormSection v-model:open="open" collapsible :hint="t('editor.semanticsHint')" :title="t('editor.sections.semantics')">
    <template v-if="concepts" #actions>
      <v-btn
        prepend-icon="mdi-link-variant"
        size="small"
        :text="t('cd.link')"
        @click.stop="linking = true"
      />
    </template>

    <ReferenceInput
      :error-messages="errorMessages"
      :label="t('details.semanticId')"
      :model-value="semanticId"
      @update:model-value="reference => (semanticId = reference)"
    />

    <v-card v-if="concepts && resolved" border="0" color="surface-light">
      <v-card-item class="pb-0">
        <v-card-subtitle>{{ t('cd.semanticsCard') }}</v-card-subtitle>
      </v-card-item>

      <v-card-text class="pt-2">
        <ConceptDescriptionCard :can-create="canCreate ?? false" :node="{ ...node, semanticId: resolved }" :target-id="targetId!" />
      </v-card-text>
    </v-card>

    <ConceptDescriptionPickerDialog
      v-if="concepts"
      v-model="linking"
      :current="key || null"
      :target-id="targetId!"
      @pick="link"
    />
  </FormSection>
</template>

<script lang="ts" setup>
  import type { Json } from '~/utils/editor'

  const props = defineProps<{
    /** The element or submodel, for a concept description created from it. */
    node: Json
    errorMessages?: string[]
    /** Where concept descriptions are read and linked from; none without it. */
    targetId?: string
    /** The target has concept descriptions. */
    linkConcepts?: boolean
    /** New concept descriptions can be created on the target. */
    canCreate?: boolean
  }>()
  const semanticId = defineModel<unknown>('semanticId')
  const open = defineModel<boolean>('open', { default: true })

  const { t } = useI18n()
  const concepts = computed(() => Boolean(props.targetId && props.linkConcepts))
  const key = computed(() => (semanticId.value as { keys?: Array<{ value?: string }> } | undefined)?.keys?.[0]?.value ?? '')

  // The concept description is looked up for the semantic ID once typing
  // pauses, not for every keystroke.
  const resolved = ref<unknown>(key.value ? semanticId.value : null)
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(semanticId, value => {
    clearTimeout(timer)
    timer = setTimeout(() => (resolved.value = key.value ? value : null), 400)
  }, { deep: true })
  onBeforeUnmount(() => clearTimeout(timer))

  const linking = ref(false)
  function link (id: string) {
    semanticId.value = { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: id }] }
    open.value = true
  }
</script>
