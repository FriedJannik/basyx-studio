import type { ShellSummary } from '#shared/contract'
import type { JsonObject } from './outline'
import { encodeKey } from './keys'

function langStrings (value: unknown): Array<{ language: string, text: string }> {
  return Array.isArray(value)
    ? value.filter((entry): entry is { language: string, text: string } => typeof entry?.language === 'string' && typeof entry?.text === 'string')
    : []
}

/** A file path or URL as an external http(s) address, or `null`. */
export function externalUrl (path: unknown): string | null {
  return typeof path === 'string' && /^https?:\/\//i.test(path) ? path : null
}

export function toShellSummary (shell: JsonObject): ShellSummary {
  const assetInformation = (shell.assetInformation ?? {}) as JsonObject
  const thumbnailPath = (assetInformation.defaultThumbnail as JsonObject | undefined)?.path
  return {
    key: encodeKey(String(shell.id)),
    id: String(shell.id),
    idShort: typeof shell.idShort === 'string' ? shell.idShort : null,
    displayName: langStrings(shell.displayName),
    description: langStrings(shell.description),
    assetKind: typeof assetInformation.assetKind === 'string' ? assetInformation.assetKind : null,
    globalAssetId: typeof assetInformation.globalAssetId === 'string' ? assetInformation.globalAssetId : null,
    thumbnail: typeof thumbnailPath === 'string',
    thumbnailUrl: externalUrl(thumbnailPath),
  }
}

/** The list entry for a shell from its registry descriptor, which carries the asset fields at the top level. */
export function descriptorSummary (descriptor: JsonObject): ShellSummary {
  return {
    key: encodeKey(String(descriptor.id)),
    id: String(descriptor.id),
    idShort: typeof descriptor.idShort === 'string' ? descriptor.idShort : null,
    displayName: langStrings(descriptor.displayName),
    description: langStrings(descriptor.description),
    assetKind: typeof descriptor.assetKind === 'string' ? descriptor.assetKind : null,
    globalAssetId: typeof descriptor.globalAssetId === 'string' ? descriptor.globalAssetId : null,
    // Descriptors name no thumbnail; the shell page shows it.
    thumbnail: false,
    thumbnailUrl: null,
  }
}

/** The submodel identifier of a submodel reference (`ModelReference` to a `Submodel`). */
export function submodelIdOf (reference: JsonObject): string | null {
  const keys = Array.isArray(reference.keys) ? reference.keys as JsonObject[] : []
  const key = keys.findLast(entry => entry.type === 'Submodel') ?? keys[0]
  return typeof key?.value === 'string' ? key.value : null
}
