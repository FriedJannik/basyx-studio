import type { Problem } from '@basyx/studio-sdk'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { errorPresentation, nextStackName, presetSpec, selectablePresets, stackNameProblem } from '../../app/components/basyx-docker/support'

const messages: Record<string, string> = {
  'error.actionEngine': 'Start Docker or Podman, then try again.',
  'error.actionRetry': 'Try the action again.',
  'error.actionReport': 'Open the technical details and include them when reporting the problem.',
  'error.code': 'Error code',
  'error.status': 'Status',
  'error.title': 'The action could not be completed',
  'error.unexpected': 'BaSyx Docker encountered an unexpected error.',
  'problem.container_engine_unavailable': 'Docker or Podman does not answer.',
}
const t = (key: string) => messages[key] ?? key

describe('BaSyx Docker presets', () => {
  it('offers only the supported setup choices for new instances', () => {
    expect(selectablePresets).toEqual(['quick', 'secured'])
  })

  it('does not mount a persistent data volume by default', () => {
    expect(presetSpec('quick', 'Demo').persistence).toBe('ephemeral')
  })
})

describe('BaSyx Docker wizard translations', () => {
  const locales = ['de', 'en', 'es', 'fr', 'ja', 'nl', 'zh-Hans'] as const
  const stepLabels = {
    'de': 'Template auswählen',
    'en': 'Select template',
    'es': 'Seleccionar plantilla',
    'fr': 'Choisir un modèle',
    'ja': 'テンプレートを選択',
    'nl': 'Template selecteren',
    'zh-Hans': '选择模板',
  }

  it.each(Object.entries(stepLabels))('labels the first step in %s', (locale, label) => {
    const messages = JSON.parse(readFileSync(new URL(`../../app/components/basyx-docker/locales/${locale}.json`, import.meta.url), 'utf8')) as {
      wizard: { stepWhat: string }
    }
    expect(messages.wizard.stepWhat).toBe(label)
  })

  it.each(locales)('explains both secured access models completely in %s', locale => {
    const messages = JSON.parse(readFileSync(new URL(`../../app/components/basyx-docker/locales/${locale}.json`, import.meta.url), 'utf8')) as {
      access: Record<string, string>
    }
    const required = [
      'title', 'hint',
      'roles', 'rolesTechnology', 'rolesText', 'rolesUsers', 'rolesAdmin', 'rolesViewer', 'rolesUseCase',
      'sharing', 'sharingTechnology', 'sharingText', 'sharingUsers', 'sharingOwner', 'sharingAdmin', 'sharingUseCase',
      'includedUsers', 'permissions', 'bestFor',
    ]

    expect(Object.fromEntries(required.map(key => [key, messages.access[key]]))).toEqual(
      Object.fromEntries(required.map(key => [key, expect.any(String)])),
    )
    expect(required.every(key => messages.access[key].trim().length > 0)).toBe(true)
  })
})

describe('BaSyx Docker visual language', () => {
  const component = (name: string) => readFileSync(new URL(`../../app/components/basyx-docker/${name}.vue`, import.meta.url), 'utf8')

  it('uses neutral cards at rest and a tonal brand treatment only for selected choices', () => {
    const wizard = component('NewInstanceWizard')

    expect(wizard).not.toContain('color="surface-light"')
    expect(wizard).toContain(':color="preset === option ? \'primary\' : undefined"')
    expect(wizard).toContain(':variant="preset === option ? \'tonal\' : undefined"')
    expect(wizard).toContain(':color="access === option ? \'primary\' : undefined"')
    expect(wizard).toContain(':variant="access === option ? \'tonal\' : undefined"')
  })

  it('renders engine and instance states as quiet icon-and-text readouts', () => {
    const engineStatus = component('EngineStatus')
    const instanceCard = component('InstanceCard')
    const engineActivator = engineStatus.match(/<v-btn[\s\S]*?>/)?.[0]

    expect(engineActivator).not.toContain(':color=')
    expect(engineActivator).not.toContain('size="small"')
    expect(engineStatus).toContain('icon="mdi-circle"')
    expect(instanceCard).not.toContain('<v-chip\n          :color="statusLook.color"')
    expect(instanceCard).toContain('icon="mdi-circle"')
  })

  it('reuses Studio button and card defaults for secondary actions and inset panels', () => {
    const engineMissing = component('EngineMissing')
    const logs = component('LogsPanel')
    const signIn = component('SignInDetails')
    const wizard = component('NewInstanceWizard')

    expect(engineMissing).toContain('<v-btn-secondary')
    expect(wizard).toContain('<v-btn-secondary')
    expect(wizard).not.toContain('variant="outlined"')
    expect(logs.trimStart()).toMatch(/^<template>\s*<v-card/)
    expect(signIn.trimStart()).toMatch(/^<template>\s*<v-card/)
  })

  it('uses the Studio page header and independent resource cards on the start page', () => {
    const app = component('App')
    const instanceCard = component('InstanceCard')
    const pageHeader = readFileSync(new URL('../../app/components/PageHeader.vue', import.meta.url), 'utf8')

    expect(app).toContain('<PageHeader :subtitle="t(\'app.subtitle\')" :title="t(\'app.title\')">')
    expect(app).toContain('<template v-if="engines && engineRunning && list && !wizard" #actions>')
    expect(pageHeader).toContain('class="d-flex flex-wrap align-center ga-2"')
    expect(app).toContain('<v-row v-else density="compact">')
    expect(app).toMatch(/cols="12"\s+sm="6"/)
    expect(app).not.toContain('text-title-medium font-weight-medium flex-grow-1')
    expect(instanceCard.trimStart()).toMatch(/^<template>\s*<v-card class="d-flex flex-column h-100"/)
    expect(instanceCard).toContain('<v-avatar color="primary" variant="tonal">')
  })
})

describe('BaSyx Docker instance names', () => {
  it('requires a non-empty name', () => {
    expect(stackNameProblem(' '.repeat(3), [])).toBe('required')
  })

  it('rejects an existing name regardless of whitespace and case', () => {
    expect(stackNameProblem(' demo LINE ', ['Demo line'])).toBe('duplicate')
  })

  it('allows an unchanged name while editing an instance', () => {
    expect(stackNameProblem('Demo line', ['Demo line'], 'Demo line')).toBeNull()
  })

  it('picks the first unused default name regardless of case', () => {
    expect(nextStackName(['BaSyx 1', 'basyx 2', 'Demo'])).toBe('BaSyx 3')
  })
})

describe('BaSyx Docker errors', () => {
  it('keeps a known problem actionable and exposes its diagnostics', () => {
    const problem: Problem = {
      code: 'container_engine_unavailable',
      detail: 'connect ENOENT /var/run/docker.sock',
      retryable: true,
      status: 503,
      title: 'No container engine is running',
    }

    expect(errorPresentation(t, problem)).toMatchObject({
      action: 'Start Docker or Podman, then try again.',
      cause: 'No container engine is running',
      code: 'container_engine_unavailable',
      detail: 'connect ENOENT /var/run/docker.sock',
      message: 'Docker or Podman does not answer.',
      status: 503,
    })
  })

  it('turns an unexpected error into useful recovery and technical information', () => {
    expect(errorPresentation(t, new Error('socket closed while reading response'))).toMatchObject({
      action: 'Try the action again. Open the technical details and include them when reporting the problem.',
      cause: 'socket closed while reading response',
      code: 'unexpected_error',
      message: 'BaSyx Docker encountered an unexpected error.',
    })
  })
})
