import type { OperationVariableGroup } from '#shared/contract'
import { operationVariableGroups } from '#shared/contract'
import { StudioProblem } from '../problem'

const keyPattern = /^[\w-]{1,4000}$/

/** Opaque, URL-safe resource key: base64url of an AAS identifier or element locator. */
export function encodeKey (value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

export function decodeKey (key: string, what = 'resource key'): string {
  if (!keyPattern.test(key)) {
    throw new StudioProblem('invalid_request', `Malformed ${what}.`)
  }
  const value = Buffer.from(key, 'base64url').toString('utf8')
  if (!value || encodeKey(value) !== key) {
    throw new StudioProblem('invalid_request', `Malformed ${what}.`)
  }
  return value
}

export type LocatorStep
  = | { kind: 'idShort', idShort: string }
    | { kind: 'index', index: number }
    | { kind: 'variables', group: OperationVariableGroup }

/**
 * Element locators extend AAS idShortPaths with `@input`, `@output` and
 * `@inoutput` steps, because operation variables are not addressable through
 * the AAS API. Example: `Calibrate@inoutput.Settings.Mode`.
 */
export function parseLocator (text: string): LocatorStep[] {
  const steps: LocatorStep[] = []
  const token = /([A-Za-z][\w-]*)|\[(\d{1,9})\]|@([a-z]+)|(\.)/y
  let expectIdShort = true
  let position = 0
  while (position < text.length) {
    token.lastIndex = position
    const match = token.exec(text)
    if (!match) {
      throw new StudioProblem('invalid_request', 'Malformed element locator.')
    }
    position = token.lastIndex
    const [, idShort, index, group, dot] = match
    if (dot !== undefined) {
      if (expectIdShort) {
        throw new StudioProblem('invalid_request', 'Malformed element locator.')
      }
      expectIdShort = true
    } else if (idShort !== undefined) {
      if (!expectIdShort) {
        throw new StudioProblem('invalid_request', 'Malformed element locator.')
      }
      steps.push({ kind: 'idShort', idShort })
      expectIdShort = false
    } else if (expectIdShort || steps.at(-1)?.kind === 'variables') {
      // `[n]` and `@group` must follow an element; a group is followed by `.idShort`.
      throw new StudioProblem('invalid_request', 'Malformed element locator.')
    } else if (index !== undefined) {
      steps.push({ kind: 'index', index: Number(index) })
    } else if (group !== undefined) {
      if (!(operationVariableGroups as readonly string[]).includes(group)) {
        throw new StudioProblem('invalid_request', 'Malformed element locator.')
      }
      steps.push({ kind: 'variables', group: group as OperationVariableGroup })
    }
  }
  if (steps.length === 0 || (expectIdShort && text.endsWith('.'))) {
    throw new StudioProblem('invalid_request', 'Malformed element locator.')
  }
  return steps
}

export function formatLocator (steps: readonly LocatorStep[]): string {
  let text = ''
  for (const step of steps) {
    if (step.kind === 'idShort') {
      text += text ? `.${step.idShort}` : step.idShort
    } else if (step.kind === 'index') {
      text += `[${step.index}]`
    } else {
      text += `@${step.group}`
    }
  }
  return text
}

/** Splits a locator into the part the AAS API can address and the remainder. */
export function splitAddressable (steps: readonly LocatorStep[]): { idShortPath: string, rest: LocatorStep[] } {
  const firstVariables = steps.findIndex(step => step.kind === 'variables')
  const addressable = firstVariables === -1 ? steps : steps.slice(0, firstVariables)
  return {
    idShortPath: formatLocator(addressable),
    rest: firstVariables === -1 ? [] : steps.slice(firstVariables),
  }
}

/** The label of a locator step as the tree shows it: idShort, `[index]` or the variable group. */
function stepLabel (step: LocatorStep): string {
  if (step.kind === 'idShort') {
    return step.idShort
  }
  return step.kind === 'index' ? `[${step.index}]` : step.group
}

/** The elements above a locator, top-down, with the keys the tree uses for them. */
export function ancestorsOf (steps: readonly LocatorStep[]): Array<{ key: string, label: string }> {
  return steps.slice(0, -1).map((step, index) => ({ key: encodeKey(formatLocator(steps.slice(0, index + 1))), label: stepLabel(step) }))
}
