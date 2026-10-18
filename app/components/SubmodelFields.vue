<template>
  <v-form-fields>
    <FormSection :title="t('editor.sections.basics')">
      <v-text-field
        :autofocus="autofocus"
        :error-messages="idShortErrors"
        :hint="t('editor.idShortHint')"
        :label="t('details.idShort')"
        :model-value="String(submodel.idShort ?? '')"
        persistent-hint
        @update:model-value="text => set('idShort', text)"
      />

      <v-text-field
        v-if="identifier"
        :error-messages="errorsFor(findings, 'id')"
        :hint="t('wizard.generatedIdHint')"
        :label="t('details.identifier')"
        :model-value="String(submodel.id ?? '')"
        persistent-hint
        @update:model-value="text => set('id', text)"
      />

      <v-btn-toggle
        v-if="!hideKind"
        class="align-self-start"
        mandatory
        :model-value="String(submodel.kind ?? 'Instance')"
        @update:model-value="kind => set('kind', kind)"
      >
        <v-btn prepend-icon="mdi-file-outline" :text="t('editor.kinds.Instance')" value="Instance" />
        <v-btn prepend-icon="mdi-file-document-outline" :text="t('editor.kinds.Template')" value="Template" />
      </v-btn-toggle>
    </FormSection>

    <FormSection v-model:open="openNames" collapsible :title="t('editor.sections.names')">
      <LangStringsInput
        :label="t('details.displayName')"
        :max-length="langStringMaxLength.name"
        :model-value="langStrings('displayName')"
        @update:model-value="strings => set('displayName', strings)"
      />

      <LangStringsInput
        :label="t('details.description')"
        :max-length="langStringMaxLength.text"
        :model-value="langStrings('description')"
        @update:model-value="strings => set('description', strings)"
      />

      <v-combobox
        clearable
        :items="categories"
        :label="t('details.category')"
        :model-value="typeof submodel.category === 'string' && submodel.category ? submodel.category : null"
        @update:model-value="value => set('category', value)"
      />
    </FormSection>

    <SemanticsSection
      v-model:open="openSemantics"
      :can-create="canCreateConcept"
      :error-messages="errorsFor(findings, 'semanticId')"
      :link-concepts="linkConcepts"
      :node="submodel"
      :semantic-id="submodel.semanticId"
      :target-id="targetId"
      @update:semantic-id="reference => set('semanticId', reference)"
    />

    <FormSection v-model:open="openSupplemental" :badge="supplemental.length || undefined" collapsible :title="t('editor.sections.supplemental')">
      <div v-for="(reference, index) in supplemental" :key="index">
        <ReferenceInput
          :label="`${t('editor.supplementalSemanticId')} ${index + 1}`"
          :model-value="reference"
          removable
          required
          @update:model-value="value => setSupplemental(index, value)"
        />
      </div>

      <v-btn
        class="align-self-start"
        prepend-icon="mdi-plus"
        size="small"
        :text="t('editor.addSupplemental')"
        @click="set('supplementalSemanticIds', [...supplemental, { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: '' }] }])"
      />
    </FormSection>

    <DataSpecificationsInput
      :findings="findings"
      :model-value="list('embeddedDataSpecifications')"
      :name="String(submodel.idShort ?? '')"
      @update:model-value="specifications => set('embeddedDataSpecifications', specifications)"
    />

    <FormSection v-model:open="openAdmin" collapsible :title="t('shell.administration')">
      <div class="d-flex align-start ga-3">
        <v-text-field :label="t('details.version')" :model-value="String(administration.version ?? '')" @update:model-value="text => set('administration', withField(administration, 'version', text))" />
        <v-text-field :label="t('shell.revisionLabel')" :model-value="String(administration.revision ?? '')" @update:model-value="text => set('administration', withField(administration, 'revision', text))" />
      </div>
    </FormSection>

    <FormSection
      v-model:open="openQualifiers"
      :badge="qualifiers.length || undefined"
      collapsible
      last
      :title="t('editor.sections.qualifiers')"
    >
      <QualifiersInput :model-value="qualifiers" @update:model-value="list => set('qualifiers', list)" />
    </FormSection>
  </v-form-fields>
</template>

<script lang="ts" setup>
  import type { LangString } from '#shared/contract'
  import type { Json } from '~/utils/editor'
  import { withField } from '~/utils/editor'
  import { categories, errorsFor, idShortPattern, langStringMaxLength } from '~/utils/languages'

  // The fields of a submodel's own metadata, for editing and for creating
  // (the wizard and *Add submodel*): the same inputs in both.
  const props = defineProps<{
    findings?: Array<{ path: string, message: string }>
    identifier?: boolean
    /** A template's copy is always an instance. */
    hideKind?: boolean
    autofocus?: boolean
    /** The target, to resolve and link concept descriptions in the Semantics section. */
    targetId?: string
    linkConcepts?: boolean
    canCreateConcept?: boolean
  }>()
  const submodel = defineModel<Json>({ required: true })

  const { t } = useI18n()
  const findings = computed(() => props.findings ?? [])

  const idShortErrors = computed(() => {
    const id = String(submodel.value.idShort ?? '')
    return errorsFor(findings.value, 'idShort').concat(id !== '' && !idShortPattern.test(id) ? [t('editor.idShortInvalid')] : [])
  })

  function langStrings (field: string): LangString[] {
    const value = submodel.value[field]
    return Array.isArray(value) ? value as LangString[] : []
  }

  const hasNames = computed(() => langStrings('displayName').length > 0 || langStrings('description').length > 0 || Boolean(submodel.value.category))
  const openNames = ref(hasNames.value)
  const openSemantics = ref(Boolean(submodel.value.semanticId))
  const supplemental = computed(() => (Array.isArray(submodel.value.supplementalSemanticIds) ? submodel.value.supplementalSemanticIds : []) as unknown[])
  const administration = computed(() => (submodel.value.administration ?? {}) as Json)
  const qualifiers = computed(() => (Array.isArray(submodel.value.qualifiers) ? submodel.value.qualifiers : []) as Array<Record<string, unknown>>)
  const openSupplemental = ref(supplemental.value.length > 0)
  const openAdmin = ref(Boolean(submodel.value.administration))
  const openQualifiers = ref(qualifiers.value.length > 0)

  function list (field: string): Json[] {
    const value = submodel.value[field]
    return Array.isArray(value) ? value as Json[] : []
  }

  function setSupplemental (index: number, value: unknown) {
    const next = supplemental.value.map((entry, position) => position === index ? value : entry).filter(entry => entry !== null)
    set('supplementalSemanticIds', next)
  }

  function set (field: string, value: unknown) {
    submodel.value = withField(submodel.value, field, value)
  }
</script>
