<template>
  <v-btn
    v-if="legal?.legalNoticeUrl"
    :href="legal.legalNoticeUrl"
    prepend-icon="mdi-scale-balance"
    rel="noopener"
    target="_blank"
    :text="t('app.legalNotice')"
  />

  <v-btn
    v-if="legal?.privacyPolicyUrl"
    :href="legal.privacyPolicyUrl"
    prepend-icon="mdi-shield-account-outline"
    rel="noopener"
    target="_blank"
    :text="t('app.privacyPolicy')"
  />
</template>

<script lang="ts" setup>
  // The deployment's legal notice and privacy policy (STUDIO_LEGAL_NOTICE_URL,
  // STUDIO_PRIVACY_POLICY_URL); nothing without them.
  const { t } = useI18n()
  const session = useSessionStore()
  const legal = computed(() => session.context?.legal)
</script>
