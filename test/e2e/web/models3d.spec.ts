import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { key, registerOpenTarget, signIn, waitUntilSettled } from './support'

// 3D models in the hosted build (ADR 0038, 0039): the 3D view of File
// elements in the Visualization tab, and the bundled 3D Models app for IDTA
// 02026, on `Models3DDemo` (test-setup/fixtures/open/studio-3d-models.aasx).
// Run `pnpm build` first.

test.describe.configure({ mode: 'serial' })

const shell = 'urn:studio:test:aas:models3d'
const files = 'urn:studio:test:sm:files-3d'
let targetId: string

function elementUrl (element: string) {
  return `/targets/${targetId}/shells/${key(shell)}?submodel=${key(files)}&element=${key(element)}&mode=visualization`
}

/** Clicks into the 3D Models app on the Overview once its frame stopped growing and moving. */
async function clickInApp (page: Page, target: Locator) {
  await expect(target).toBeVisible({ timeout: 30_000 })
  await waitUntilSettled(page.locator('iframe[title="App: 3D Models"]').first())
  await target.click()
}

async function expectModel (page: Page, format: string) {
  const view = page.locator('[data-test="model-view"]')
  await expect(view.getByText(format, { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(view.getByText(/\d+ triangles?/)).toBeVisible({ timeout: 30_000 })
  await expect(view.locator('[data-test="model-view-canvas"] canvas')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await signIn(page, 'studio-admin')
  targetId = await registerOpenTarget(page, 'E2E 3D models target')
})

test('shows STL, OBJ, glTF, GLB, STEP and IFC files in 3D', async ({ page }) => {
  test.setTimeout(120_000)
  for (const [element, format] of [['Stl', 'STL'], ['Obj', 'OBJ'], ['Gltf', 'glTF'], ['Glb', 'GLB'], ['Step', 'STEP'], ['Ifc', 'IFC']] as const) {
    await page.goto(elementUrl(element))
    await expectModel(page, format)
  }
  // IFC elements can be picked.
  await expect(page.locator('[data-test="model-view-element"]')).toContainText('Click an element to see its properties.')
})

test('offers the 3D view from the File card and explains files it cannot show', async ({ page }) => {
  await page.goto(`/targets/${targetId}/shells/${key(shell)}?submodel=${key(files)}&element=${key('Glb')}`)
  await page.locator('[data-test="file-view-3d"]').click()
  await expect(page).toHaveURL(/mode=visualization/)
  await expectModel(page, 'GLB')

  await page.goto(elementUrl('GltfExternalBuffer'))
  await expect(page.getByText('The 3D model cannot be shown')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/keeps its geometry in other files.*bracket\.bin/)).toBeVisible()

  // A texture in another file: shown without it.
  await page.goto(elementUrl('GltfExternalTexture'))
  await expectModel(page, 'glTF')
  await expect(page.getByText('Textures in other files are not shown: bracket-color.png')).toBeVisible()

  // Not a 3D file: no Visualization tab.
  await page.goto(`/targets/${targetId}/shells/${key(shell)}?submodel=${key(files)}&element=${key('Preview')}`)
  await expect(page.getByRole('tab', { name: 'JSON' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Visualization' })).toHaveCount(0)
})

test('shows the Models3D submodel in the bundled 3D Models app', async ({ page }) => {
  await page.goto(`/targets/${targetId}/shells/${key(shell)}?tab=overview`)
  const frame = page.frameLocator('iframe[title="App: 3D Models"]')
  await expect(frame.locator('[data-test="model-switcher-item"]')).toHaveCount(4, { timeout: 30_000 })
  await expect(frame.locator('[data-test="model-title"]')).toHaveText('L bracket')
  await expect(frame.locator('[data-test="viewer-canvas"] canvas')).toBeVisible({ timeout: 30_000 })
  await expect(frame.locator('[data-test="model-summary"]')).toContainText('Engineering design')

  // IFC in the app frame: web-ifc runs as WebAssembly in a blob: worker (ADR 0038).
  await clickInApp(page, frame.locator('[data-test="model-switcher-item"]').filter({ hasText: 'Workshop building' }))
  await expect(frame.locator('[data-test="viewer-element"]')).toContainText('Click an element to see its properties.', { timeout: 30_000 })

  // A version only at an external host shows its preview and the link.
  await clickInApp(page, frame.locator('[data-test="model-switcher-item"]').filter({ hasText: 'Motor (external)' }))
  await expect(frame.getByRole('button', { name: 'Open external file' })).toBeVisible()
})

test('opens the selected model and version in full screen', async ({ page }) => {
  await page.goto(`/targets/${targetId}/shells/${key(shell)}?tab=overview`)
  const frame = page.frameLocator('iframe[title="App: 3D Models"]').first()
  const dialogFrame = page.frameLocator('.v-dialog iframe[title="App: 3D Models"]')
  await expect(frame.locator('[data-test="model-switcher-item"]')).toHaveCount(4, { timeout: 30_000 })

  await clickInApp(page, frame.locator('[data-test="model-switcher-item"]').filter({ hasText: 'Workshop building' }))
  await clickInApp(page, frame.locator('[data-test="viewer-fullscreen"]'))
  await expect(dialogFrame.locator('[data-test="model-title"]')).toHaveText('Workshop building', { timeout: 30_000 })
  await page.locator('[data-test="app-fullscreen-close"]').click()
  await expect(page.locator('.v-dialog')).toBeHidden()

  // An older version of the bracket.
  await clickInApp(page, frame.locator('[data-test="model-switcher-item"]').filter({ hasText: 'L bracket' }))
  await clickInApp(page, frame.locator('[data-test="version-menu"]'))
  await clickInApp(page, frame.getByRole('listitem').filter({ hasText: 'v1.0' }))
  await expect(frame.locator('[data-test="model-title"]')).toHaveText('L bracket (CAD)')
  await clickInApp(page, frame.locator('[data-test="viewer-fullscreen"]'))
  await expect(dialogFrame.locator('[data-test="model-title"]')).toHaveText('L bracket (CAD)', { timeout: 30_000 })
  await expect(dialogFrame.getByText('STEP AP214')).toBeVisible()
})
