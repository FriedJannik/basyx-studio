<template>
  <v-app>
    <v-card>
      <v-card-item prepend-icon="mdi-card-account-details-outline">
        <v-card-title>Digital Nameplate</v-card-title>
        <v-card-subtitle>{{ version }}</v-card-subtitle>

        <template #append>
          <v-chip
            v-for="marking in markings"
            :key="marking"
            class="ms-1"
            prepend-icon="mdi-check-decagram-outline"
            :text="marking"
            variant="outlined"
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

        <v-divider />

        <v-row no-gutters>
          <v-col v-for="row in rows" :key="row.path" cols="12" :sm="draft?.row.path === row.path ? 12 : 6">
            <!-- Edited in place: a dialog would not fit a frame sized to its content.
                 No form: app frames may not submit forms (sandbox without allow-forms). -->
            <div v-if="draft?.row.path === row.path" class="pa-4">
              <v-text-field
                v-model="draft.value"
                autofocus
                :label="row.label"
                :prepend-inner-icon="row.icon"
                @keydown.enter="save"
              />

              <v-alert
                v-if="draft.error"
                class="mt-2"
                data-test="edit-error"
                :text="draft.error"
                type="warning"
              />

              <div class="d-flex justify-end ga-2 mt-2">
                <v-btn text="Cancel" @click="draft = null" />

                <v-btn
                  color="primary"
                  :loading="saving"
                  text="Save"
                  variant="flat"
                  @click="save"
                />
              </div>
            </div>

            <v-list-item
              v-else
              :data-field="row.path"
              lines="two"
              :prepend-icon="row.icon"
              :subtitle="row.label"
              :title="row.value || '—'"
            >
              <template v-if="canEdit && row.editable" #append>
                <v-btn
                  :aria-label="`Edit ${row.label}`"
                  icon="mdi-pencil-outline"
                  size="small"
                  variant="text"
                  @click="startEdit(row)"
                />
              </template>
            </v-list-item>
          </v-col>
        </v-row>
      </template>
    </v-card>
  </v-app>
</template>

<script lang="ts" setup>
  import type { Node } from '../../../shared/app'
  import type { JsonObject, StudioClient } from '@basyx/studio-sdk'
  import { StudioError } from '@basyx/studio-sdk'
  import { computed, onMounted, ref } from 'vue'
  import { child, childrenOf, humanize, loadSubmodel, textOf } from '../../../shared/app'

  // The Digital Nameplate (IDTA 02006) of an asset. In Studio's edit mode, its
  // properties can be changed where the target and the user's rights allow it
  // (MVP-4 plan, T4; replaces the MVP-3 example app).

  const props = defineProps<{ client: StudioClient }>()

  interface Row {
    path: string
    label: string
    value: string
    icon: string
    editable: boolean
  }

  const loading = ref(true)
  const error = ref<string | null>(null)
  const submodel = ref<JsonObject | null>(null)
  const notice = ref<{ type: 'success' | 'error', text: string } | null>(null)
  const draft = ref<{ row: Row, value: string, revision: string, error: string | null } | null>(null)
  const saving = ref(false)

  const context = ref(props.client.context)
  props.client.onContext(value => (context.value = value))
  const locale = computed(() => context.value.locale)
  const canEdit = computed(() => (context.value.target?.write ?? false) && context.value.mode === 'edit')

  /** The IDTA template version from the semantic ID, e.g. `IDTA 02006-3-0`. */
  const version = computed(() => {
    const semanticId = context.value.submodel?.semanticId ?? ''
    const match = /nameplate\/(\d)\/(\d)/i.exec(semanticId)
    return match ? `IDTA 02006-${match[1]}-${match[2]}` : 'IDTA 02006'
  })

  const fields: Array<{ idShort: string, label?: string, icon: string }> = [
    { idShort: 'ManufacturerName', label: 'Manufacturer', icon: 'mdi-factory' },
    { idShort: 'ManufacturerProductDesignation', label: 'Product designation', icon: 'mdi-tag-outline' },
    { idShort: 'ManufacturerProductType', icon: 'mdi-shape-outline' },
    { idShort: 'SerialNumber', icon: 'mdi-barcode' },
    { idShort: 'YearOfConstruction', icon: 'mdi-calendar-outline' },
    { idShort: 'DateOfManufacture', label: 'Date of manufacture', icon: 'mdi-calendar-outline' },
    { idShort: 'HardwareVersion', icon: 'mdi-memory' },
    { idShort: 'FirmwareVersion', icon: 'mdi-chip' },
    { idShort: 'SoftwareVersion', icon: 'mdi-application-cog-outline' },
    { idShort: 'CountryOfOrigin', icon: 'mdi-earth' },
  ]
  const addressFields = ['Street', 'Zipcode', 'CityTown', 'NationalCode']

  const rows = computed<Row[]>(() => {
    if (!submodel.value) {
      return []
    }
    const row = (parent: Node | JsonObject | undefined, idShort: string, icon: string, label?: string): Row | null => {
      const node = child(parent, idShort)
      return node
        ? { path: node.path, label: label ?? humanize(idShort), value: textOf(node, locale.value), icon, editable: node.element.modelType === 'Property' }
        : null
    }
    const address = child(submodel.value, 'AddressInformation')
    return [
      ...fields.map(field => row(submodel.value!, field.idShort, field.icon, field.label)),
      ...addressFields.map(idShort => row(address, idShort, 'mdi-map-marker-outline')),
    ].filter((item): item is Row => item !== null)
  })

  const markings = computed(() => {
    const list = child(submodel.value ?? undefined, 'Markings')
    return list ? childrenOf(list).map(marking => textOf(child(marking, 'MarkingName'), locale.value)).filter(Boolean) : []
  })

  function describe (cause: unknown): string {
    if (!(cause instanceof StudioError)) {
      return String(cause)
    }
    switch (cause.code) {
      case 'revision_conflict': {
        return 'Someone else changed this value in the meantime. Cancel and try again.'
      }
      case 'target_forbidden': {
        return 'You are not permitted to change this value.'
      }
      default: {
        return cause.message
      }
    }
  }

  async function load () {
    try {
      submodel.value = await loadSubmodel(props.client)
    } catch (error_) {
      error.value = error_ instanceof StudioError ? error_.message : String(error_)
    } finally {
      loading.value = false
    }
  }

  async function startEdit (row: Row) {
    notice.value = null
    try {
      // The write is based on the revision read now.
      const snapshot = await props.client.aas.getElement(context.value.submodel!.id, row.path)
      draft.value = { row, value: String(snapshot.value.value ?? ''), revision: snapshot.revision, error: null }
    } catch (error_) {
      notice.value = { type: 'error', text: describe(error_) }
    }
  }

  async function save () {
    const current = draft.value
    if (!current) {
      return
    }
    saving.value = true
    try {
      await props.client.aas.setElementValue({ submodelId: context.value.submodel!.id, idShortPath: current.row.path, value: current.value, revision: current.revision })
      draft.value = null
      notice.value = { type: 'success', text: `${current.row.label} saved.` }
      await props.client.ui.notify(`${current.row.label} saved.`, 'success')
      await load()
    } catch (error_) {
      // The draft stays, as in Studio's own editor.
      current.error = describe(error_)
    } finally {
      saving.value = false
    }
  }

  onMounted(load)
</script>
