import type { ElementDetail } from '#shared/contract'
import type { LocatorStep } from '../lib/aas/keys'
import type { ElementSnapshot } from '../lib/targets/aas-target'
import type { RequestEvent } from 'nuxt/server'
import { ancestorsOf, decodeKey, parseLocator, splitAddressable } from '../lib/aas/keys'
import { navigate } from '../lib/aas/outline'
import { StudioProblem } from '../lib/problem'
import { routeParam } from './handler'

export interface ElementRoute {
  submodelId: string
  key: string
  locator: string
  idShortPath: string
  /** Steps below the API-addressable part (operation variables). */
  rest: LocatorStep[]
}

export function elementRoute (event: RequestEvent): ElementRoute {
  const submodelId = decodeKey(routeParam(event, 'submodelKey'), 'submodel key')
  const key = routeParam(event, 'elementKey')
  const locator = decodeKey(key, 'element key')
  const { idShortPath, rest } = splitAddressable(parseLocator(locator))
  return { submodelId, key, locator, idShortPath, rest }
}

/**
 * The element detail for the UI. Only API-addressable elements carry a
 * revision, because operation variables cannot be written separately. The
 * revision is also sent as `ETag`.
 */
export function toElementDetail (event: RequestEvent, route: ElementRoute, snapshot: ElementSnapshot): ElementDetail {
  const value = navigate(snapshot.value, route.rest)
  if (value === undefined) {
    throw new StudioProblem('target_resource_not_found')
  }
  const writable = route.rest.length === 0
  if (writable) {
    event.res.headers.set('ETag', `"${snapshot.revision}"`)
  }
  return {
    key: route.key,
    path: route.locator,
    value,
    revision: writable ? snapshot.revision : null,
    concurrency: writable ? snapshot.concurrency : null,
    ancestors: ancestorsOf(parseLocator(route.locator)),
  }
}
