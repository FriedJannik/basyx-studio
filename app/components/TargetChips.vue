<template>
  <!-- Quiet status, as in shadcn: muted text with an icon, and a small
       coloured dot as the only colour; filled chips made lists look busy. -->
  <div class="d-flex flex-wrap align-center ga-3 text-body-small text-medium-emphasis">
    <template v-if="target.workspace">
      <span class="d-inline-flex align-center ga-1">
        <v-icon :icon="targetIcon(target)" size="16" />
        {{ t('workspace.localFile') }}
      </span>

      <span class="d-inline-flex align-center ga-1">
        <v-icon :color="target.workspace.unsavedChanges ? 'warning' : 'success'" icon="mdi-circle" size="8" />
        {{ t(target.workspace.unsavedChanges ? 'workspace.unsaved' : 'workspace.saved') }}
      </span>
    </template>

    <template v-else-if="target.securityMode">
      <span class="d-inline-flex align-center ga-1">
        <v-icon :icon="targetIcon(target)" size="16" />
        {{ t(`security.${target.securityMode}`) }}
      </span>

      <span class="d-inline-flex align-center ga-1">
        <v-icon :color="target.authenticationState === 'required' ? 'warning' : 'success'" icon="mdi-circle" size="8" />
        {{ t(`authState.${target.authenticationState}`) }}
      </span>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import type { Target } from '#shared/contract'
  import { targetIcon } from '~/utils/aas'

  defineProps<{ target: Target }>()
  const { t } = useI18n()
</script>
