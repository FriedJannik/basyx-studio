import vuetify from 'eslint-config-vuetify'
import withNuxt from './.nuxt/eslint.config.mjs'
import { appDefaults } from './apps/shared/defaults.ts'
import { buttonGroupStyleProps } from './shared/vuetify-defaults.ts'
import vuetifyConfig from './vuetify.config.ts'

// VAppBar -> v-app-bar, maxWidth -> max-width
const toKebab = name => name.replace(/[A-Z]/g, (letter, index) => (index ? '-' : '') + letter.toLowerCase())

/**
 * Every prop that vuetify.config.ts sets as a global default becomes a
 * restricted static attribute on that component, so templates never restate
 * a default and the config stays the single source of truth. Contextual
 * defaults (nested components) and `class` are not derived.
 */
function restatedDefaults (defaults, source = 'vuetify.config.ts') {
  return Object.entries(defaults).flatMap(([component, props]) => {
    const element = toKebab(component)
    return Object.entries(props)
      .filter(([key, value]) => key !== 'class' && !/^[A-Z]/.test(key) && ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => ({
        element,
        key: toKebab(key),
        value: value === true ? true : String(value),
        message: `\`${toKebab(key)}\` on <${element}> restates the global default in ${source}; remove it.`,
      }))
  })
}

/**
 * Grouped buttons look the same everywhere (shared/vuetify-defaults.ts): a
 * bare <v-btn-toggle> or <v-btn-group>, never styled in a template.
 */
const styledButtonGroups = ['v-btn-toggle', 'v-btn-group'].flatMap(element => buttonGroupStyleProps.map(key => ({
  element,
  key,
  message: `\`${key}\` on <${element}>: grouped buttons get their look from shared/vuetify-defaults.ts; remove it (see AGENTS.md).`,
})))

export default withNuxt(
  vuetify({
    ts: true,
  }),
).append({
  ignores: ['dist-electron/**'],
}).append({
  // Studio UI rules (see AGENTS.md): Vuetify components, props and utility
  // classes instead of custom CSS, global defaults instead of repeated props,
  // and a fixed block order.
  files: ['**/*.vue'],
  rules: {
    'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
    'vue/no-restricted-block': ['error', {
      element: 'style',
      message: 'Use Vuetify components, props, and utility classes instead of custom CSS.',
    }],
    'vue/no-static-inline-styles': ['error', { allowBinding: false }],
    'vue/no-restricted-v-bind': ['error', {
      argument: 'style',
      message: 'Use Vuetify props or utility classes instead of inline styles.',
    }],
  },
}).append({
  // Apps (apps/, examples/apps/) create their own Vuetify instance, so only
  // Studio's own components are checked against vuetify.config.ts; the apps
  // shipped with Studio are checked against apps/shared/defaults.ts below.
  files: ['app/**/*.vue'],
  rules: {
    'vue/no-restricted-static-attribute': ['error',
      ...restatedDefaults(vuetifyConfig.defaults),
      ...styledButtonGroups,
      {
        element: 'v-btn',
        key: 'variant',
        value: 'flat',
        message: 'Use <v-btn-primary> (vuetify.config.ts alias) for primary actions.',
      },
    ],
  },
}).append({
  files: ['apps/**/*.vue'],
  rules: {
    'vue/no-restricted-static-attribute': ['error',
      ...restatedDefaults(appDefaults, 'apps/shared/defaults.ts'),
      ...styledButtonGroups,
    ],
  },
}).append({
  // Example apps bring their own defaults (examples/apps/shared/vuetify.ts).
  files: ['examples/apps/**/*.vue'],
  rules: {
    'vue/no-restricted-static-attribute': ['error', ...styledButtonGroups],
  },
}).append({
  // Studio may run under a base path (STUDIO_BASE_PATH). Plain `href` and
  // `src` values must come from useStudioUrl(); only the fetch helpers, which
  // add the base path themselves, build URLs from apiBasePath.
  files: ['app/**/*.{ts,vue}'],
  ignores: ['app/composables/useStudioUrl.ts', 'app/composables/useStudioApi.ts', 'app/stores/session.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: '#shared/contract',
        importNames: ['apiBasePath'],
        message: 'Use useStudioUrl().api() for links, or useStudioApi() for requests, so the base path is applied.',
      }],
    }],
  },
}).append({
  // The local test environment is plain HTTP on loopback by design; the
  // autofix of this rule would silently break its URLs.
  files: ['test/**', 'test-setup/**'],
  rules: {
    'unicorn/prefer-https': 'off',
  },
}).append({
  // Drizzle's query builder uses `.values(...)`, which this rule mistakes for
  // Array.prototype.values().
  files: ['server/**', 'test/**'],
  rules: {
    'unicorn/no-unused-array-method-return': 'off',
  },
}).append({
  // A JavaScript comment-style rule that misreads YAML `#` comments.
  files: ['pnpm-workspace.yaml'],
  rules: {
    '@stylistic/spaced-comment': 'off',
  },
})
