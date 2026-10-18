import { expect, test } from '@playwright/test'
import { key, registerOpenEnvironment, signIn } from './support'

// The server-rendered page reserves the app bar, the rail and the shell list,
// so it does not move when it hydrates (patches/README.md). Requested without
// client hints, as on a first visit or in browsers that send none.

const motorShell = 'urn:fraunhofer:iese:dte:aas:drivemotor-dm3000:001'

/** The layout offsets the server rendered on `v-main`, in pixels. */
function mainOffsets (html: string) {
  const style = /class="v-main"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? ''
  const offset = (name: string) => Number(new RegExp(String.raw`--v-layout-${name}:(\d+)px`).exec(style)?.[1] ?? Number.NaN)
  return { top: offset('top'), left: offset('left') }
}

test('reserves the app bar and the drawers in server-rendered pages', async ({ page }) => {
  await signIn(page, 'studio-admin')
  const targetId = await registerOpenEnvironment(page, 'E2E layout environment')

  const targets = await (await page.request.get('/')).text()
  expect(mainOffsets(targets)).toEqual({ top: 56, left: 56 })

  // The rail (56 px) and the shell list (340 px) on the left.
  const shell = await (await page.request.get(`/targets/${targetId}/shells/${key(motorShell)}`)).text()
  expect(mainOffsets(shell)).toEqual({ top: 56, left: 396 })

  // And the page does not move once it is interactive.
  await page.addInitScript(() => {
    const shifts: number[] = []
    Object.assign(window, { layoutShifts: shifts })
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number })[]) {
        shifts.push(entry.value)
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(`/targets/${targetId}/shells/${key(motorShell)}`)
  await expect(page.getByRole('heading', { name: 'Servo Motor DM-3000 (Fraunhofer IESE)' })).toBeVisible()
  const shift = await page.evaluate(() => (window as unknown as { layoutShifts: number[] }).layoutShifts.reduce((sum, value) => sum + value, 0))
  expect(shift).toBeLessThan(0.1)
})
