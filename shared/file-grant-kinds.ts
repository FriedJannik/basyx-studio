import type { StackFileKind } from '@basyx/studio-sdk/protocol'
import { stackFileKinds } from '@basyx/studio-sdk/protocol'

// Kinds of the single-use file grants of the BaSyx Docker app (ADR 0033):
// AASX files to load, an export to import, where to save an export or logs.
// The SDK names them; this module adds what the Electron main process, the
// contract and the Studio Service need. It has no runtime dependencies, so
// Electron can bundle it.

/** The extensions a file of each kind may have; the first is the default when saving. */
export const stackFileExtensions: Record<StackFileKind, readonly string[]> = {
  'stack-aasx': ['aasx'],
  'stack-import': ['zip', 'json'],
  'stack-export': ['zip'],
  'stack-logs': ['txt'],
}

/** Kinds whose dialog asks where to save; the others pick existing files. */
export function isSaveKind (kind: StackFileKind): boolean {
  return kind === 'stack-export' || kind === 'stack-logs'
}

export function isStackFileKind (value: unknown): value is StackFileKind {
  return typeof value === 'string' && (stackFileKinds as readonly string[]).includes(value)
}

export { type StackFileKind, stackFileKinds } from '@basyx/studio-sdk/protocol'
