import type { SyncMode, SyncSettings } from '#shared/contract'
import type { InfrastructureRecord } from '../infrastructures'
import type { JsonObject } from './outline'
import { serviceUrl } from '#shared/contract'
import { encodeKey } from './keys'
import { firstKeyValue } from './outline'

// Registry and discovery sync after uploads and deletes (MVP-4 plan, I5).
// Where the server does not keep its registries and discovery in step with
// its repositories, Studio writes descriptors and asset links itself, if the
// infrastructure (or, where allowed, the user) chose `autoCreate`.

/** What Studio writes for an infrastructure: AAS and submodel descriptors, and asset links. */
export interface SyncPlan {
  registry: boolean
  discovery: boolean
}

/** The user's choice counts only where the infrastructure allows overrides. */
export function effectiveSyncMode (sync: SyncSettings, userChoice: SyncMode | null | undefined): SyncMode {
  return sync.userOverride && userChoice ? userChoice : sync.studioDefault
}

export function syncPlan (record: Pick<InfrastructureRecord, 'sync' | 'template' | 'endpoints'>, userChoice: SyncMode | null | undefined): SyncPlan {
  const create = effectiveSyncMode(record.sync, userChoice) === 'autoCreate'
  return {
    registry: create && !record.sync.serverSyncsRegistry && serviceUrl(record, 'aasRegistry') !== undefined,
    discovery: create && !record.sync.serverSyncsDiscovery && serviceUrl(record, 'aasDiscovery') !== undefined,
  }
}

function endpoint (interfaceName: string, href: string): JsonObject {
  return { interface: interfaceName, protocolInformation: { href } }
}

function pick (source: JsonObject, keys: string[]): JsonObject {
  return Object.fromEntries(keys.filter(key => source[key] !== undefined && source[key] !== null).map(key => [key, source[key]]))
}

/** The AAS descriptor of a shell (AAS JSON) served by an AAS repository, as the BaSyx SDK builds it. */
export function shellDescriptor (shell: JsonObject, repositoryBase: string): JsonObject {
  const asset = (shell.assetInformation ?? {}) as JsonObject
  return {
    ...pick(shell, ['id', 'idShort', 'displayName', 'description', 'administration', 'extensions']),
    ...pick(asset, ['assetKind', 'assetType', 'globalAssetId', 'specificAssetIds']),
    endpoints: [endpoint('AAS-3.0', `${repositoryBase}/shells/${encodeKey(String(shell.id))}`)],
  }
}

/** The submodel descriptor of a submodel (AAS JSON) served by a submodel repository. */
export function submodelDescriptor (submodel: JsonObject, repositoryBase: string): JsonObject {
  return {
    ...pick(submodel, ['id', 'idShort', 'displayName', 'description', 'administration', 'extensions', 'semanticId', 'supplementalSemanticIds']),
    endpoints: [endpoint('SUBMODEL-3.0', `${repositoryBase}/submodels/${encodeKey(String(submodel.id))}`)],
  }
}

/** The discovery's asset links of a shell: its global asset ID and specific asset IDs. */
export function assetLinksOf (shell: JsonObject): Array<{ name: string, value: string }> {
  const asset = (shell.assetInformation ?? {}) as JsonObject
  const links: Array<{ name: string, value: string }> = []
  if (typeof asset.globalAssetId === 'string' && asset.globalAssetId) {
    links.push({ name: 'globalAssetId', value: asset.globalAssetId })
  }
  for (const specific of Array.isArray(asset.specificAssetIds) ? asset.specificAssetIds as JsonObject[] : []) {
    if (typeof specific.name === 'string' && typeof specific.value === 'string') {
      links.push({ name: specific.name, value: specific.value })
    }
  }
  return links
}

/** Submodel IDs a shell references. */
export function submodelIdsOf (shell: JsonObject): string[] {
  return (Array.isArray(shell.submodels) ? shell.submodels : [])
    .map(reference => firstKeyValue(reference))
    .filter((id): id is string => typeof id === 'string')
}

export { type SyncStep } from '#shared/contract'
