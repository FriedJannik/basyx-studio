<template>
  <ProblemAlert
    v-if="xml.error.value"
    class="ma-4"
    :error="xml.error.value"
    retry
    @retry="xml.refetch()"
  />

  <v-skeleton-loader v-else-if="xml.isPending.value" type="paragraph@3" />

  <CodeView
    v-else
    :file-name="`${fileName}.xml`"
    :label="t('details.modes.xmlLabel')"
    language="xml"
    :model-value="xml.data.value ?? ''"
  />
</template>

<script lang="ts" setup>
  import { useQuery } from '@pinia/colada'

  // The AAS XML serialization of the selected submodel or element (MVP-4 plan, T2).
  const props = defineProps<{ targetId: string, submodelKey: string, elementKey: string | null, at: string | null, fileName: string }>()

  const { t } = useI18n()
  const api = useStudioApi()

  const xml = useQuery({
    key: () => ['targets', props.targetId, 'details', 'xml', props.submodelKey, props.elementKey ?? '', props.at ?? ''],
    query: async ({ signal }) => {
      const path = props.elementKey
        ? `/targets/${props.targetId}/submodels/${props.submodelKey}/elements/${props.elementKey}`
        : `/targets/${props.targetId}/submodels/${props.submodelKey}`
      const blob = await api<Blob>(path, { query: { format: 'xml', at: props.at ?? undefined }, responseType: 'blob', signal })
      return blob.text()
    },
  })
</script>
