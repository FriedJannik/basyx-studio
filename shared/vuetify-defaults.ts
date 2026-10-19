// Vuetify defaults that Studio (vuetify.config.ts) and the apps shipped
// with it (apps/shared/defaults.ts) share, so controls look the same in
// both.

/** Text fields, selects and the like: outlined, 36 px tall with Studio's Sass settings. */
const field = { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' } as const

export const fieldDefaults = {
  VTextField: field,
  VSelect: field,
  VAutocomplete: field,
  VCombobox: field,
  VFileInput: field,
  VTextarea: field,
  VCheckbox: { density: 'compact', color: 'primary', hideDetails: 'auto' },
  VSwitch: { color: 'primary', inset: true, hideDetails: true, density: 'compact' },
} as const

/*
 * Grouped buttons: a bordered, divided group of text buttons with square
 * inner corners. Templates use a bare <v-btn-toggle> (one choice of several)
 * or <v-btn-group> (related actions or menus) and style neither the group
 * nor its buttons; ESLint refuses it.
 */

export const buttonGroupDefaults = {
  VBtnToggle: { density: 'compact', rounded: 'lg', color: 'primary', border: true, divided: true, variant: 'text', VBtn: { rounded: false } },
  VBtnGroup: { density: 'compact', rounded: 'lg', border: true, divided: true, variant: 'text', VBtn: { rounded: false } },
} as const

/** Props that style a group; set them in the defaults above, never in a template. */
export const buttonGroupStyleProps = ['variant', 'color', 'base-color', 'density', 'rounded', 'tile', 'border', 'divided', 'elevation', 'size'] as const
