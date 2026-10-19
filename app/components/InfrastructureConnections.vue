<template>
  <div class="d-flex flex-column ga-3">
    <div class="text-body-small text-medium-emphasis">{{ t('admin.connections.help') }}</div>

    <v-expansion-panels v-if="connections.length > 0" multiple>
      <v-expansion-panel v-for="connection in connections" :key="connection.id">
        <v-expansion-panel-title>
          <div class="d-flex flex-column">
            <span>{{ connection.key || t('admin.connections.unnamed') }}</span>
            <span class="text-body-small text-medium-emphasis">{{ t(`admin.connections.types.${connection.type}`) }}{{ connection.url ? ` · ${connection.url}` : '' }}</span>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <div class="d-flex flex-column ga-3">
            <v-text-field
              v-model="connection.key"
              :hint="t('admin.connections.keyHint')"
              :label="t('admin.connections.key')"
              persistent-hint
              :rules="[required, validKey, uniqueKey]"
            />

            <v-select
              v-model="connection.type"
              :hint="t(`admin.connections.typeHints.${connection.type}`)"
              :items="typeItems"
              :label="t('admin.connections.type')"
              persistent-hint
            />

            <v-text-field
              v-model="connection.url"
              :hint="t('admin.connections.urlHint')"
              :label="t('admin.connections.url')"
              persistent-hint
              :placeholder="exampleUrl"
              :rules="[required, httpUrl]"
            />

            <v-combobox
              v-model="connection.aliases"
              chips
              closable-chips
              :hint="t('admin.connections.aliasesHint')"
              :label="t('admin.connections.aliases')"
              multiple
              persistent-hint
              :placeholder="exampleAlias"
              :rules="[httpUrls]"
            />

            <v-text-field
              v-if="connection.type === 'influxdb2'"
              v-model="connection.organization"
              :hint="t('admin.connections.organizationHint')"
              :label="t('admin.connections.organization')"
              persistent-hint
            />

            <v-select
              v-model="connection.scheme"
              :hint="t(`admin.connections.schemeHints.${connection.scheme}`)"
              :items="schemeItems(connection)"
              :label="t('admin.connections.scheme')"
              persistent-hint
            />

            <v-text-field
              v-if="connection.scheme === 'header'"
              v-model="connection.headerName"
              :label="t('admin.connections.headerName')"
              placeholder="X-API-Key"
              :rules="[required]"
            />

            <v-text-field
              v-if="connection.scheme === 'basic'"
              v-model="connection.username"
              autocomplete="off"
              :label="t('admin.connections.username')"
              :rules="[required]"
            />

            <template v-if="connection.scheme === 'oauth2ClientCredentials'">
              <v-text-field v-model="connection.issuer" :label="t('admin.issuer')" :rules="[required, httpUrl]" />
              <v-text-field v-model="connection.clientId" :label="t('admin.clientId')" :rules="[required]" />
            </template>

            <template v-if="connection.scheme === 'oauth2ClientCredentials' || connection.scheme === 'delegatedUser'">
              <v-text-field
                v-model="connection.audience"
                :hint="t('admin.connections.audienceHint')"
                :label="t('admin.connections.audience')"
                persistent-hint
                :rules="connection.scheme === 'delegatedUser' ? [required] : []"
              />

              <v-text-field v-model="connection.scopes" :hint="t('admin.scopesHint')" :label="t('admin.scopes')" persistent-hint />
            </template>

            <template v-if="connection.scheme === 'delegatedUser'">
              <v-checkbox v-model="connection.forwardUserToken" :label="t('admin.connections.forwardUserToken')" />
              <v-alert v-if="connection.forwardUserToken" density="compact" :text="t('admin.connections.forwardUserTokenWarning')" type="warning" />
            </template>

            <template v-if="secretLabel(connection)">
              <v-text-field
                v-if="session.isDesktop"
                v-model="connection.secret"
                autocomplete="new-password"
                :hint="keepsStoredSecret(connection) ? t('admin.connections.secretStored') : t('admin.connections.secretValueHint')"
                :label="secretLabel(connection)"
                persistent-hint
                :rules="[secretRequired(connection)]"
                type="password"
              />

              <v-text-field
                v-else
                v-model="connection.secret"
                :hint="t('admin.connections.secretRefHint')"
                :label="secretLabel(connection)"
                persistent-hint
                placeholder="env:INFLUX_TOKEN"
                :rules="[secretRequired(connection), secretRef]"
              />
            </template>

            <v-checkbox v-model="connection.allowPrivateNetwork" :label="t('admin.allowPrivateNetwork')" />

            <v-text-field
              v-model="connection.timeoutSeconds"
              :hint="t('admin.connections.timeoutHint', { seconds: connectionTypes[connection.type].defaultTimeoutSeconds })"
              :label="t('admin.connections.timeout')"
              persistent-hint
              :rules="[timeout]"
              type="number"
            />

            <div class="d-flex flex-wrap ga-2 justify-end">
              <v-btn v-if="!readonly" prepend-icon="mdi-delete-outline" :text="t('admin.connections.remove')" @click="remove(connection)" />

              <v-btn-secondary
                :disabled="!infrastructureId"
                :loading="connection.testing"
                prepend-icon="mdi-lan-check"
                :text="t('admin.connections.test')"
                @click="test(connection)"
              />
            </div>

            <div v-if="!infrastructureId" class="text-body-small text-medium-emphasis">{{ t('admin.connections.testAfterSave') }}</div>

            <v-alert
              v-if="connection.testResult"
              density="compact"
              :title="connection.testResult.ok ? t('admin.connections.testOk') : t('admin.connections.testFailed')"
              :type="connection.testResult.ok ? 'success' : 'error'"
            >
              <v-list>
                <v-list-item
                  v-for="check in connection.testResult.checks"
                  :key="check.check"
                  :prepend-icon="check.ok ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'"
                  :subtitle="checkDetail(check)"
                  :title="t(`admin.connections.checks.${check.check}`)"
                />
              </v-list>
            </v-alert>

            <ProblemAlert v-if="connection.testError" :error="connection.testError" />
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <div v-if="!readonly">
      <v-btn prepend-icon="mdi-plus" :text="t('admin.connections.add')" @click="add" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import type { ConnectionAuthScheme, ConnectionTestResult, SecurityMode } from '#shared/contract'
  import type { ConnectionForm } from '~/utils/connections'
  import { connectionKeySchema, connectionSecretFields, connectionTypeNames, connectionTypes } from '#shared/contract'

  const props = defineProps<{
    readonly?: boolean
    /** The saved infrastructure's ID; connections can be tested once it is saved. */
    infrastructureId: string | null
    /** The security mode in the form: the user's identity needs `delegated_user`. */
    securityMode: SecurityMode
  }>()
  const connections = defineModel<ConnectionForm[]>({ required: true })

  const { t } = useI18n()
  const api = useStudioApi()
  const session = useSessionStore()

  // Constants: vue-tsc 3.3 garbles `//` inside bound template expressions.
  const exampleUrl = 'http://influxdb:8086'
  const exampleAlias = 'http://localhost:8086'

  const typeItems = computed(() => connectionTypeNames.map(type => ({ value: type, title: t(`admin.connections.types.${type}`) })))

  /** The schemes the type's adapter accepts; the user's identity only where users sign in. */
  function schemeItems (connection: ConnectionForm) {
    const schemes: readonly ConnectionAuthScheme[] = connectionTypes[connection.type].authSchemes
    return schemes
      .filter(scheme => scheme !== 'delegatedUser' || props.securityMode === 'delegated_user')
      .map(scheme => ({ value: scheme, title: t(`admin.connections.schemes.${scheme}`) }))
  }

  function secretLabel (connection: ConnectionForm): string | undefined {
    const field = connectionSecretFields[connection.scheme]
    return field ? t(`admin.connections.secrets.${field}`) : undefined
  }

  const required = (value: string) => !!value.trim() || t('admin.connections.required')
  const httpUrl = (value: string) => /^https?:\/\/\S+$/.test(value.trim()) || t('admin.connections.httpUrl')
  const httpUrls = (values: string[]) => values.every(value => /^https?:\/\/\S+$/.test(value.trim())) || t('admin.connections.httpUrl')
  const validKey = (value: string) => connectionKeySchema.safeParse(value.trim()).success || t('admin.connections.keyInvalid')
  const uniqueKey = (value: string) => connections.value.filter(connection => connection.key.trim() === value.trim()).length < 2 || t('admin.connections.keyTaken')
  const secretRef = (value: string) => !value.trim() || /^(?:env:[A-Z_][A-Z0-9_]*|file:\/\S+)$/.test(value.trim()) || t('admin.connections.secretRefInvalid')
  const timeout = (value: string) => !value.trim() || (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 120) || t('admin.connections.timeoutInvalid')
  const secretRequired = (connection: ConnectionForm) => (value: string) => !!value.trim() || keepsStoredSecret(connection) || t('admin.connections.required')

  function add () {
    connections.value = [...connections.value, emptyConnectionForm()]
  }

  function remove (connection: ConnectionForm) {
    connections.value = connections.value.filter(other => other !== connection)
  }

  function checkDetail (check: ConnectionTestResult['checks'][number]): string {
    return [check.status === null ? null : `HTTP ${check.status}`, check.latencyMs === null ? null : `${check.latencyMs} ms`, check.message].filter(Boolean).join(' · ')
  }

  /**
   * Tests the connection as edited, with the saved secret where none was
   * entered (CON-005). A read-only form tests what is saved.
   */
  async function test (connection: ConnectionForm) {
    connection.testing = true
    connection.testResult = null
    connection.testError = null
    try {
      const key = props.readonly ? connection.savedKey! : connection.key.trim()
      connection.testResult = await api<ConnectionTestResult>(`/infrastructures/${props.infrastructureId}/connections/${encodeURIComponent(key)}/test`, {
        method: 'POST',
        body: props.readonly ? {} : { connection: connectionInputOf(connection, session.isDesktop) },
      })
    } catch (error) {
      connection.testError = error
    } finally {
      connection.testing = false
    }
  }
</script>
