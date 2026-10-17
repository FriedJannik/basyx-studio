import type { Translate } from './i18n'
import type { Problem, StackComponentId, StackSpec, StudioClient } from '@basyx/studio-sdk'
import type { InjectionKey } from 'vue'
import { StudioError } from '@basyx/studio-sdk'
import { inject } from 'vue'

/** The defaults of a preset, as Studio's contract defines them. */
export { presetSpec } from '@basyx/studio-sdk'

export const clientKey: InjectionKey<StudioClient> = Symbol('client')

export function useClient (): StudioClient {
  const client = inject(clientKey)
  if (!client) {
    throw new Error('The Studio client is not provided.')
  }
  return client
}

export function problemOf (error: unknown): Problem | null {
  return error instanceof StudioError ? error.problem : null
}

/** A sentence for people, by problem code (plan U2). */
export function problemText (t: Translate, problem: Problem | null | undefined): string {
  if (!problem) {
    return t('problem.generic')
  }
  if (problem.code === 'container_start_failed') {
    const component = problem.violations?.[0]?.path as StackComponentId | undefined
    return t('problem.container_start_failed', { component: component ? t(`component.${component}`) : '?' })
  }
  const key = `problem.${problem.code}`
  const text = t(key)
  return text === key ? (problem.detail ?? problem.title ?? t('problem.generic')) : text
}

export const presetIcons: Record<StackSpec['preset'], string> = {
  quick: 'mdi-lightning-bolt-outline',
  full: 'mdi-puzzle-outline',
  secured: 'mdi-shield-lock-outline',
}

/** Copies only the declarative settings, including when Vue wraps them in proxies. */
export function cloneSpec (spec: StackSpec): StackSpec {
  return {
    ...spec,
    security: { ...spec.security },
    features: { ...spec.features },
    network: { ...spec.network },
    images: { ...spec.images, ...(spec.images.digests ? { digests: { ...spec.images.digests } } : {}) },
    aasxFiles: [...spec.aasxFiles],
  }
}
