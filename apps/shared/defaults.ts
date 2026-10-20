import { buttonGroupDefaults, fieldDefaults } from '../../shared/vuetify-defaults.ts'

// Vuetify defaults of the apps shipped with Studio (ADR 0023). They follow
// Studio's look: a view renders flat inside the card Studio gives it (an
// Overview widget, the details drawer, the full-screen dialog), which
// already has the border, the radius and the view's title. Without Vue or
// Vuetify imports, so ESLint checks the apps' templates against them, as it
// checks Studio's against vuetify.config.ts.

export const appDefaults = {
  // Studio's card shows through: the frame's page and the view have no background of their own.
  VApp: { class: 'bg-transparent' },
  VViewCard: { flat: true, border: false, rounded: 0, color: 'transparent' },
  VCard: { flat: true, border: true, rounded: 'lg' },
  VBtn: { rounded: 'lg', class: 'text-none', variant: 'text', density: 'comfortable' },
  VBtnPrimary: { color: 'primary', variant: 'flat', rounded: 'lg', class: 'text-none', density: 'comfortable' },
  VBtnSecondary: { color: 'surface-light', variant: 'flat', border: true, rounded: 'lg', class: 'text-none', density: 'comfortable' },
  ...buttonGroupDefaults,
  ...fieldDefaults,
  VChip: { label: true, size: 'small', variant: 'tonal' },
  VList: { density: 'compact', bgColor: 'transparent' },
  VListItem: { rounded: 'lg' },
  VAlert: { border: 'start', variant: 'tonal' },
  VProgressLinear: { indeterminate: true, color: 'primary' },
} as const
