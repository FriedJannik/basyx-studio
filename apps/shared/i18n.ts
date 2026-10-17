import type { StudioClient } from '@basyx/studio-sdk'
import type { InjectionKey, Ref } from 'vue'
import { inject, provide, ref } from 'vue'

// Texts of the apps shipped with Studio in Studio's UI locales (ADR 0026).
// An app passes its English catalog and the translations; the locale follows
// Studio's context, and missing texts fall back to English.

/** Texts in sections: `section.key`. */
export type Catalog = Record<string, Record<string, string>>

/** Same keys as English, any of them may be missing. */
export type PartialCatalog<C extends Catalog> = { [Section in keyof C]?: { [Key in keyof C[Section]]?: string } }

export type Translate = (key: string, params?: Record<string, string | number>) => string

export interface I18n {
  t: Translate
  locale: Ref<string>
}

const key: InjectionKey<I18n> = Symbol('i18n')

function lookup (catalog: PartialCatalog<Catalog>, path: string): string | undefined {
  const [section, name] = path.split('.', 2) as [string, string]
  return catalog[section]?.[name]
}

/** Provides `t` and the locale to the app's components. */
export function provideI18n<C extends Catalog> (client: StudioClient, en: C, translations: Record<string, PartialCatalog<C>>): I18n {
  const catalogs: Record<string, PartialCatalog<Catalog>> = { ...translations, en }
  // The German dialects (`de-saar`, …) use German.
  const catalogFor = (locale: string) => catalogs[locale] ?? catalogs[locale.split('-', 1)[0]!] ?? en
  const locale = ref(client.context.locale)
  client.onContext(context => {
    locale.value = context.locale
  })
  const t: Translate = (path, params) => {
    const text = lookup(catalogFor(locale.value), path) ?? lookup(en, path) ?? path
    return params ? text.replaceAll(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match)) : text
  }
  const i18n = { t, locale }
  provide(key, i18n)
  return i18n
}

export function useI18n (): I18n {
  const i18n = inject(key)
  if (!i18n) {
    throw new Error('useI18n needs provideI18n in a parent component.')
  }
  return i18n
}
