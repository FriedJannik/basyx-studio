import type { InjectionKey, Ref } from 'vue'
import { inject, provide } from 'vue'
import { useI18n as useVueI18n } from 'vue-i18n'
import de from './locales/de.json'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import ja from './locales/ja.json'
import nl from './locales/nl.json'
import zhHans from './locales/zh-Hans.json'

// The local BaSyx instance UI follows Studio's locale. Keeping the catalogue
// beside the feature lets the route stay lazy-loaded while German dialects
// still inherit the standard German translation (ADR 0026).

type Catalog = Record<string, Record<string, string>>
type PartialCatalog<C extends Catalog> = { [Section in keyof C]?: { [Key in keyof C[Section]]?: string } }
export type Translate = (key: string, params?: Record<string, string | number>) => string

interface DockerI18n {
  t: Translate
  locale: Ref<string>
}

const key: InjectionKey<DockerI18n> = Symbol('docker-i18n')

function lookup (catalog: PartialCatalog<Catalog>, path: string): string | undefined {
  const [section, name] = path.split('.', 2) as [string, string]
  return catalog[section]?.[name]
}

export function provideI18n (): DockerI18n {
  const { locale } = useVueI18n()
  const catalogs: Record<string, PartialCatalog<Catalog>> = { de, en, es, fr, ja, nl, 'zh-Hans': zhHans }
  const catalogFor = (code: string) => catalogs[code] ?? catalogs[code.split('-', 1)[0]!] ?? en
  const t: Translate = (path, params) => {
    const text = lookup(catalogFor(locale.value), path) ?? lookup(en, path) ?? path
    return params ? text.replaceAll(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match)) : text
  }
  const value = { t, locale }
  provide(key, value)
  return value
}

export function useI18n (): DockerI18n {
  const value = inject(key)
  if (!value) {
    throw new Error('BaSyx Docker translations need a parent provider.')
  }
  return value
}
