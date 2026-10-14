<template>
  <v-dialog v-model="open" :fullscreen="xs" max-width="560" scrollable>
    <DialogCard :title="t('share.title', { name: shellLabel })">
      <p class="text-body-medium text-medium-emphasis mt-0 mb-3">{{ t('share.subtitle') }}</p>

      <ProblemAlert v-if="error" class="mb-4" :error="error" />
      <v-alert v-if="conflict" class="mb-4" :text="t('share.conflict')" type="warning" />
      <v-skeleton-loader v-if="loading" type="list-item-avatar-two-line@3" />

      <template v-else>
        <v-row align="center" dense>
          <v-col cols="12" sm>
            <v-text-field
              v-model="subject"
              :label="t('share.subject')"
              :placeholder="t('share.subjectPlaceholder')"
              prepend-inner-icon="mdi-account-search-outline"
            />
          </v-col>

          <v-col cols="12" sm="auto">
            <v-btn-toggle v-model="subjectType" mandatory>
              <v-btn :aria-label="t('share.user')" icon="mdi-account-outline" value="user" />
              <v-btn :aria-label="t('share.group')" icon="mdi-account-group-outline" value="group" />
            </v-btn-toggle>
          </v-col>

          <v-col cols="8" sm="4">
            <v-select v-model="relation" :items="relationItems" :label="t('share.role')" />
          </v-col>

          <v-col cols="4" sm="auto">
            <v-btn-primary block :disabled="!subject.trim() || !issuer" :text="t('share.add')" @click="add" />
          </v-col>
        </v-row>

        <v-list class="mt-2" lines="two">
          <v-list-subheader :title="t('share.withAccess')" />

          <v-list-item
            v-for="(grant, index) in grants"
            :key="`${grant.subjectType}:${grant.subject}:${grant.relation}`"
            :subtitle="t(`share.relations.${known(grant.relation)}Hint`)"
            :title="grant.subject"
          >
            <template #prepend>
              <v-avatar color="primary" variant="tonal">
                <v-icon :icon="grant.subjectType === 'group' ? 'mdi-account-group-outline' : 'mdi-account-outline'" />
              </v-avatar>
            </template>

            <template #append>
              <v-menu>
                <template #activator="{ props: activator }">
                  <v-btn
                    v-bind="activator"
                    append-icon="mdi-chevron-down"
                    size="small"
                    :text="t(`share.relations.${known(grant.relation)}`, { relation: grant.relation })"
                  />
                </template>

                <v-card>
                  <v-list>
                    <v-list-item
                      v-for="item in relationItems"
                      :key="item.value"
                      :active="grant.relation === item.value"
                      :subtitle="t(`share.relations.${item.value}Hint`)"
                      :title="item.title"
                      @click="grant.relation = item.value"
                    />

                    <v-divider class="my-1" />
                    <v-list-item base-color="error" prepend-icon="mdi-account-remove-outline" :title="t('share.remove')" @click="grants.splice(index, 1)" />
                  </v-list>
                </v-card>
              </v-menu>
            </template>
          </v-list-item>

          <v-list-item v-if="grants.length === 0" :title="t('share.nobody')" />
        </v-list>

        <v-alert class="mt-2" density="compact" :text="t('share.inheritance')" type="info" />
      </template>

      <template #actions-start>
        <v-btn-secondary :loading="inviting" prepend-icon="mdi-link-variant" :text="t('share.invite')" @click="invite" />
      </template>

      <template #actions>
        <v-btn :text="t('common.cancel')" @click="open = false" />
        <v-btn-primary :disabled="loading || !revision" :loading="saving" :text="t('share.done')" @click="save" />
      </template>
    </DialogCard>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { AccessDocument, AccessGrant, InvitationResult } from '#shared/contract'
  import { useDisplay } from 'vuetify'
  import { accessRelations } from '#shared/contract'
  import { StudioApiError } from '~/composables/useStudioApi'

  const props = defineProps<{ targetId: string, shellKey: string, shellLabel: string }>()
  const open = defineModel<boolean>({ required: true })

  const { t } = useI18n()
  const { xs } = useDisplay()
  const api = useStudioApi()
  const copy = useClipboard()
  const notifications = useNotificationsStore()

  const grants = ref<AccessGrant[]>([])
  const revision = ref<string | null>(null)
  const issuer = ref<string | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const inviting = ref(false)
  const error = ref<unknown>(null)
  const conflict = ref(false)

  const subject = ref('')
  const subjectType = ref<'user' | 'group'>('user')
  const relation = ref<string>('viewer')
  const relationItems = computed(() => accessRelations.map(value => ({ value, title: t(`share.relations.${value}`) })))

  function known (value: string): string {
    return (accessRelations as readonly string[]).includes(value) ? value : 'other'
  }

  function accessUrl () {
    return `/targets/${props.targetId}/shells/${props.shellKey}/access`
  }

  function apply (document: AccessDocument) {
    grants.value = document.grants.map(grant => ({ ...grant }))
    revision.value = document.revision
    issuer.value = document.issuer
  }

  async function load () {
    loading.value = true
    error.value = null
    try {
      apply(await api<AccessDocument>(accessUrl()))
    } catch (error_) {
      error.value = error_
    } finally {
      loading.value = false
    }
  }

  watch(open, isOpen => {
    if (isOpen) {
      conflict.value = false
      void load()
    }
  })

  function add () {
    if (!issuer.value) {
      return
    }
    grants.value.push({ relation: relation.value, subjectType: subjectType.value, issuer: issuer.value, subject: subject.value.trim() })
    subject.value = ''
  }

  async function save () {
    saving.value = true
    error.value = null
    try {
      apply(await api<AccessDocument>(accessUrl(), { method: 'PUT', headers: { 'If-Match': revision.value! }, body: { grants: grants.value } }))
      notifications.notify({ text: t('share.saved'), color: 'success' })
      open.value = false
    } catch (error_) {
      if (error_ instanceof StudioApiError && error_.code === 'revision_conflict') {
        // Someone changed the access meanwhile: show theirs and let the user review.
        conflict.value = true
        await load()
      } else {
        error.value = error_
      }
    } finally {
      saving.value = false
    }
  }

  async function invite () {
    inviting.value = true
    error.value = null
    try {
      const invitation = await api<InvitationResult>(`${accessUrl()}/invitations`, { method: 'POST', body: { relation: relation.value } })
      await copy(`${window.location.origin}/targets/${props.targetId}/invite/${encodeURIComponent(invitation.token)}`, t('share.invitationLink'))
    } catch (error_) {
      error.value = error_
    } finally {
      inviting.value = false
    }
  }
</script>
