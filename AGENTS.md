# Project Rules

## General
- Follow the existing code style and patterns.
- Use pnpm for running project commands.
- Keep code in TypeScript unless migration is required.

## Stack
- Framework: Nuxt 4
- UI Library: Vuetify
- Enabled Features: ESLint, Vuetify MCP, Pinia, Vue I18n, Client Hints

## UI and Vuetify
- Build the UI from Vuetify components, their props, and Vuetify utility
  classes (spacing, flex, typography, colors, overflow). Do not write custom
  CSS: no `<style>` blocks and no inline `style` attributes or bindings.
- Configure look and feel once in `vuetify.config.ts`: theme colors, global
  component `defaults` (including contextual defaults), and `aliases` for
  recurring roles such as `<v-btn-primary>` and `<v-card-pane>`. Do not
  restate a global default in a template; add or change the default instead.
- Group buttons with a bare `<v-btn-toggle>` (one choice of several) or
  `<v-btn-group>` (related actions or menus). Do not style the group or its
  buttons (`variant`, `color`, `density`, `rounded`, `border`, `divided`,
  `size`) and do not build a toggle from separate buttons with `:active`.
  The look comes from `shared/vuetify-defaults.ts`.
- The bundled apps (`apps/`) have their own Vuetify instance. Its defaults
  are in `apps/shared/defaults.ts`, and the rules above apply there too.
- Vue single-file components are ordered `<template>`, `<script>`, `<style>`.
- ESLint enforces these rules (`eslint.config.js`); restated defaults are
  derived from `vuetify.config.ts` and `apps/shared/defaults.ts`
  automatically.

## Server code
- Route handlers, server middleware, and `server/utils` import their helpers
  explicitly from `nuxt/server` (Nuxt 4.6+), so the same code runs on Nuxt 4
  (Nitro v2) and Nuxt 5 (Nitro v3). Do not use h3's auto-imported helpers.
- Import project server utilities explicitly (`~~/server/utils/...`) instead
  of relying on Nitro auto-imports.
- Keep domain logic in `server/lib`: it must not import `nuxt/server`, `h3`,
  or Nitro, so it stays unit-testable and runtime-independent.
- Nitro-specific APIs that `nuxt/server` does not cover (storage and server
  assets, plugins, caching) belong only in `server/plugins/` and
  `server/nitro/`, and must be ported when moving to Nitro v3.
- Server middleware only extends `event.context` or throws; it never sends a
  response.

## Tooling
- The Vuetify MCP server is configured in `.mcp.json` and runs the version
  pinned in `pnpm-lock.yaml` (`@vuetify/mcp`). Use it to look up Vuetify 4
  component APIs, props, slots, and breaking changes instead of guessing.
  Tools that create bins, links, or playgrounds publish content to Vuetify's
  services; do not use them with project code.
- The official Nuxt MCP server (`https://nuxt.com/mcp`, read-only docs) is
  configured in `.mcp.json`. Use it for Nuxt 4 and Nitro questions such as
  server assets, route rules, runtime config, and module APIs.
