<template>
  <v-container>
    <DockerApp v-if="session.isDesktop" :client="client" />

    <template v-else>
      <PageHeader :title="t('nav.docker')" />

      <v-empty-state
        icon="mdi-monitor-off"
        :text="t('nav.dockerDesktopOnly')"
        :title="t('nav.docker')"
      />
    </template>
  </v-container>
</template>

<script lang="ts" setup>
  import DockerApp from '~/components/basyx-docker/App.vue'

  const { t } = useI18n()
  const session = useSessionStore()
  const client = useDockerClient()
</script>
