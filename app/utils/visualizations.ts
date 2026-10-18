import type { ModelFormat } from '@basyx/model-viewer'
import { detectModelFormat } from '@basyx/model-viewer'

/** A view Studio itself offers in the Visualization tab, before the app views. */
export interface BuiltInView {
  id: string
  title: string
  icon: string
}

/** The 3D view of a File element (STL, OBJ, glTF, IFC, STEP). */
export const model3dViewId = 'studio:model-3d'

/** The 3D format of a File element with content, or `null`. */
export function fileModelFormat (element: Record<string, unknown>): ModelFormat | null {
  if (element.modelType !== 'File' || typeof element.value !== 'string' || element.value === '') {
    return null
  }
  return detectModelFormat({ contentType: typeof element.contentType === 'string' ? element.contentType : null, fileName: element.value })
}
