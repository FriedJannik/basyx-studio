import type { FileGrant } from '#shared/contract'
import type { StackFileKind } from '#shared/file-grant-kinds'

/** The native bridge exposed by the Electron preload (electron/preload.ts). */
export interface DesktopBridge {
  chooseAasxFile: () => Promise<FileGrant | null>
  chooseSaveLocation: (suggestedName: string) => Promise<FileGrant | null>
  /** Files for the BaSyx Docker app (ADR 0033); empty when cancelled. Absent in older desktop builds. */
  chooseStackFiles?: (kind: StackFileKind, suggestedName?: string) => Promise<FileGrant[]>
}

declare global {
  interface Window {
    studioDesktop?: DesktopBridge
  }
}

/** The desktop bridge, or `null` in a browser and during SSR. */
export function useDesktopBridge (): DesktopBridge | null {
  return import.meta.client ? (window.studioDesktop ?? null) : null
}
