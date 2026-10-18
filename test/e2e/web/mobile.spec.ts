import { expect, test } from '@playwright/test'
import { edgeCasesShell, key, registerOpenEnvironment, signIn } from './support'

// Phone-sized layout (plan D10): bottom navigation, no horizontal scrolling,
// and the shell list and details as overlays.

test('works on a phone-sized screen', async ({ page }) => {
  await signIn(page, 'studio-admin')
  const targetId = await registerOpenEnvironment(page, 'E2E mobile environment')
  await page.goto(`/targets/${targetId}/shells/${key(edgeCasesShell)}`)

  await expect(page.locator('.v-bottom-navigation')).toBeVisible()
  await expect(page.locator('.v-navigation-drawer--rail')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // Submodels start closed.
  await page.getByRole('button', { name: 'Expand all' }).click()
  await page.getByRole('tree').locator('.v-list-item-title').getByText('SimpleString', { exact: true }).click()
  await expect(page.getByText('hello studio').first()).toBeVisible()

  await page.getByRole('button', { name: 'Show or hide the shell list' }).click()
  await expect(page.getByPlaceholder('Search shells')).toBeVisible()
})
