// Renders the demo's media with headless Chromium (Playwright): product
// pictures, manufacturer logos and markings as PNG, documents as PDF. Icons
// come from Material Design Icons, the font the apps already ship.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '..', 'package.json'))
const rootRequire = createRequire(join(here, '..', '..', '..', '..', 'package.json'))
const { chromium } = rootRequire('@playwright/test')
const mdiCss = require.resolve('@mdi/font/css/materialdesignicons.css')

const font = `-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`
const escape = text => String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ${font}; color: #1f2933; }
.tile { position: relative; width: 512px; height: 512px; overflow: hidden;
  background: radial-gradient(circle at 50% 36%, #ffffff 0%, #f1f3f7 46%, #d8dde6 100%); }
.tile .halo { position: absolute; left: 106px; top: 60px; width: 300px; height: 300px; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--c) 22%, transparent), transparent 70%); }
.tile .icon { position: absolute; left: 0; right: 0; top: 46px; text-align: center; font-size: 300px; line-height: 1;
  background: linear-gradient(160deg, color-mix(in srgb, var(--c) 55%, white) 0%, var(--c) 48%, color-mix(in srgb, var(--c) 60%, black) 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 22px 18px rgba(15, 23, 42, .28)); }
.tile .floor { position: absolute; left: 136px; top: 372px; width: 240px; height: 26px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(15, 23, 42, .28), transparent 70%); }
.tile .badge { position: absolute; left: 22px; bottom: 22px; display: flex; align-items: center; gap: 8px; padding: 7px 14px 7px 10px;
  background: #fff; border-radius: 999px; box-shadow: 0 2px 8px rgba(15, 23, 42, .12); font-weight: 700; font-size: 18px; color: var(--c); }
.tile .badge i { width: 12px; height: 12px; border-radius: 50%; background: var(--c); }
.tile .model { position: absolute; right: 24px; bottom: 28px; font-size: 15px; color: #52606d; font-weight: 600; max-width: 260px; text-align: right; }
.tile.dark { background: radial-gradient(circle at 50% 30%, #2b3646 0%, #172030 55%, #0c121d 100%); }
.tile.dark .model { color: #cbd2d9; }
.logo { width: 640px; height: 180px; display: flex; align-items: center; gap: 26px; padding: 0 30px; background: #fff; }
.logo .mark { width: 120px; height: 120px; border-radius: 30px; background: linear-gradient(145deg, color-mix(in srgb, var(--c) 75%, white), var(--c));
  display: flex; align-items: center; justify-content: center; color: #fff; font-size: 64px; font-weight: 800; letter-spacing: -2px; }
.logo .word { font-size: 64px; font-weight: 800; color: var(--c); letter-spacing: -1.5px; line-height: 1; }
.logo .legal { font-size: 19px; color: #616e7c; margin-top: 8px; letter-spacing: .3px; }
.marking { width: 256px; height: 256px; display: flex; align-items: center; justify-content: center; background: #fff; }
.page { width: 210mm; min-height: 297mm; padding: 22mm 20mm 18mm; position: relative; page-break-after: always; font-size: 10.5pt; line-height: 1.5; }
.page:last-child { page-break-after: auto; }
.page h1 { font-size: 26pt; line-height: 1.15; margin: 10mm 0 4mm; color: #102a43; }
.page h2 { font-size: 13pt; margin: 7mm 0 2mm; color: var(--c); }
.page p { margin: 0 0 2.5mm; }
.page .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid var(--c); padding-bottom: 4mm; }
.page .head img { height: 15mm; }
.page .meta { color: #52606d; font-size: 9pt; text-align: right; }
.page .hero { display: flex; gap: 10mm; align-items: center; margin-top: 12mm; }
.page .hero img { width: 75mm; height: 75mm; border-radius: 6mm; }
.page .subtitle { font-size: 14pt; color: #334e68; }
.page table { width: 100%; border-collapse: collapse; margin-top: 3mm; }
.page th, .page td { text-align: left; padding: 2.2mm 3mm; border-bottom: 1px solid #d9e2ec; vertical-align: top; }
.page th { background: color-mix(in srgb, var(--c) 10%, white); font-weight: 700; }
.page .foot { position: absolute; left: 20mm; right: 20mm; bottom: 10mm; border-top: 1px solid #d9e2ec; padding-top: 2mm; font-size: 8pt; color: #7b8794; display: flex; justify-content: space-between; }
.page .pass { color: #1f7a3a; font-weight: 700; }
.page .sign { margin-top: 18mm; display: flex; gap: 30mm; }
.page .sign div { border-top: 1px solid #52606d; padding-top: 2mm; width: 60mm; font-size: 9pt; color: #52606d; }
.page .stamp { position: absolute; right: 24mm; bottom: 42mm; width: 34mm; height: 34mm; border-radius: 50%; border: 3px solid #1f7a3a; color: #1f7a3a;
  display: flex; align-items: center; justify-content: center; font-weight: 800; transform: rotate(-12deg); font-size: 13pt; }
`

function ceMark () {
  // The CE mark: two arcs of the same circle size, the E with a shorter middle bar.
  return `<svg width="240" height="160" viewBox="0 0 240 160"><g fill="none" stroke="#111" stroke-width="18">
    <path d="M 100 24 A 62 62 0 1 0 100 136" /><path d="M 212 24 A 62 62 0 1 0 212 136" /></g>
    <rect x="128" y="71" width="70" height="18" fill="#111" /></svg>`
}

function markingHtml (key) {
  switch (key) {
    case 'ce': { return `<div class="marking">${ceMark()}</div>`
    }
    case 'ukca': { return `<div class="marking"><div style="border:12px solid #111;width:190px;height:190px;display:grid;grid-template-columns:1fr 1fr;font:900 78px/1 Arial;align-items:center;justify-items:center">
      <span>U</span><span>K</span><span>C</span><span>A</span></div></div>`
    }
    case 'rohs': { return `<div class="marking"><div style="width:220px;height:220px;border-radius:50%;background:#2e7d32;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <i class="mdi mdi-leaf" style="font-size:86px;line-height:1"></i><b style="font-size:46px">RoHS</b><span style="font-size:20px">compliant</span></div></div>`
    }
    default: { return `<div class="marking" style="flex-direction:column"><i class="mdi mdi-delete-off-outline" style="font-size:190px;line-height:1;color:#111"></i><div style="width:150px;height:16px;background:#111"></div></div>`
    }
  }
}

export async function openRenderer () {
  const directory = mkdtempSync(join(tmpdir(), 'fleet-atlas-media-'))
  const pagePath = join(directory, 'render.html')
  writeFileSync(pagePath, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(mdiCss)}"><style>${css}</style></head><body></body></html>`)
  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(pagePath).href)
  await page.evaluate(() => document.fonts.load('24px "Material Design Icons"'))

  const show = async html => {
    await page.evaluate(content => {
      document.body.innerHTML = content
    }, html)
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode().catch(() => {}))))
  }
  const snap = async (html, selector, type = 'png') => {
    await show(html)
    return page.locator(selector).first().screenshot(type === 'jpeg' ? { type, quality: 86 } : { type })
  }
  const dataUrl = (bytes, type = 'image/png') => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`

  return {
    /** A product picture (JPEG): the family's icon in the brand color on a studio backdrop. */
    product: ({ icon, color, brand, model, dark = false }) => snap(
      `<div class="tile${dark ? ' dark' : ''}" style="--c:${color}"><div class="halo"></div><i class="mdi ${icon} icon"></i><div class="floor"></div>
        <div class="badge"><i></i>${escape(brand)}</div><div class="model">${escape(model)}</div></div>`,
      '.tile',
      'jpeg',
    ),
    logo: maker => snap(
      `<div class="logo" style="--c:${maker.color}"><div class="mark">${escape(maker.short.slice(0, 1))}</div>
        <div><div class="word">${escape(maker.short)}</div><div class="legal">${escape(maker.name)}</div></div></div>`,
      '.logo',
    ),
    marking: key => snap(markingHtml(key), '.marking'),
    /** A PDF document; `pages` are HTML strings of A4 pages, `color` the brand color. */
    pdf: async ({ color, pages }) => {
      await show(`<div style="--c:${color}">${pages.map(content => `<section class="page">${content}</section>`).join('')}</div>`)
      return page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
    },
    dataUrl,
    close: async () => {
      await browser.close()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export { escape }
