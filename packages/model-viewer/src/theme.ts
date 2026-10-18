import type { ViewerTheme } from './viewer'

/**
 * The scene's colors from a Vuetify theme: its light surface as background,
 * neutral grey surfaces, and the accent for the picked element.
 */
export function viewerThemeOf (colors: Readonly<Record<string, unknown>>, dark: boolean): ViewerTheme {
  const color = (name: string, fallback: string) => (typeof colors[name] === 'string' ? colors[name] : fallback)
  return {
    background: color('surface-light', dark ? '#424242' : '#EEEEEE'),
    model: dark ? '#B8BCC2' : '#C4C8CE',
    highlight: color('primary', '#1976D2'),
  }
}
