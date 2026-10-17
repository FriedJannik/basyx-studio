// The renderer's only native bridge (SEC-009). Its calls let the user pick
// files in a native dialog and return opaque, single-use handles; the
// renderer never sees a native path.
import type { StackFileKind } from '../shared/file-grant-kinds'
import { contextBridge, ipcRenderer } from 'electron'

export interface StudioFileGrant {
  handle: string
  fileName: string
}

export interface StudioDesktopBridge {
  chooseAasxFile: () => Promise<StudioFileGrant | null>
  chooseSaveLocation: (suggestedName: string) => Promise<StudioFileGrant | null>
  /** Files for the BaSyx Docker app (ADR 0033); empty when cancelled. */
  chooseStackFiles: (kind: StackFileKind, suggestedName?: string) => Promise<StudioFileGrant[]>
}

const bridge: StudioDesktopBridge = {
  chooseAasxFile: () => ipcRenderer.invoke('studio:choose-aasx-file'),
  chooseSaveLocation: suggestedName => ipcRenderer.invoke('studio:choose-save-location', String(suggestedName).slice(0, 255)),
  chooseStackFiles: (kind, suggestedName) => ipcRenderer.invoke('studio:choose-stack-files', kind, String(suggestedName ?? '').slice(0, 255)),
}

contextBridge.exposeInMainWorld('studioDesktop', bridge)
