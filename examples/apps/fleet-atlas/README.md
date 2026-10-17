# Fleet Atlas

A living, zoomable map of every twin on a target. It's an example app that you
install at runtime; it is not bundled with Studio.

- **One continuous world.** Groups and assemblies are circles that contain
  their parts (circle packing over Hierarchical Structures), so zooming into a
  line reveals its machines, and zooming into a machine reveals its components.
  Close up, a twin turns into its card. The camera flies along smooth
  zoom-and-pan paths.
- **Lenses** re-encode the same map, with animated transitions:
  - *Passport*: product passport readiness (Digital Nameplate fields, Technical
    Data, Carbon Footprint, Handover Documentation).
  - *Carbon*: circle size and color show the product carbon footprint (CO₂e).
  - *Live*: operational data against its limits.
  - *Age*: year of construction.
- **Groupings**: plant structure, manufacturer or category.
- **Ask the fleet**: plain-language questions such as "motors over 5 kW
  without carbon footprint", "pumps from hydra in utilities" or "older than 12
  years". The backend turns a question into explainable clauses, shown as
  chips. Matches light up, and the camera flies to them.
- **Live alarms** pulse through every assembly above the affected twin, and
  each new alarm raises a Studio notification.
- **Fix passport gaps** in edit mode: fill a field in the twin panel, or
  lasso an area (the lasso button, or Shift + drag) and fill one field on many
  twins at once. Every write reads the current revision first.
- **Tour** mode flies through the fleet with captions, for demos and screens.

Keys: `/` focuses the question. `Esc` clears the selection or the question,
or zooms out one level.

## How it works

| Part | Runs in | Does |
| --- | --- | --- |
| `backend/main.js` (`scan`, `ask`, `pulse`, `fix`) | Studio's isolated Deno runner, with the caller's rights | Reads shells page by page and condenses them into twin digests (`digest.js`), parses questions (`ask.js`), reads live values in bulk, applies fleet-wide fixes |
| `ui/` (Vue, Vuetify, canvas, `d3-hierarchy`) | Sandboxed frame on the app origin | Renders and animates the map, and evaluates the clauses |

Permissions: `studio.aas.read`, `studio.aas.write` (only in edit mode),
`studio.ui.notifications`, `studio.backend`.

Fleet Atlas reads any target. It recognizes the following by semantic ID or
idShort:

- Nameplate
- TechnicalData
- CarbonFootprint
- HandoverDocumentation / VDI 2770
- HierarchicalStructures
- `OperationalData`-like submodels. Numeric Properties are read with the
  qualifiers `Unit`, `WarningAbove`, `AlarmAbove`, `WarningBelow` and
  `AlarmBelow`.

## Build, install, demo

```bash
pnpm apps:build          # → examples/apps/dist/fleet-atlas.zip
pnpm testenv:demo        # demo target on http://localhost:18084 (see below)
pnpm testenv:demo:live   # animates its operational data, including a recurring incident
```

1. Register the demo target in Studio as an *AAS environment* at
   `http://localhost:18084`, with loopback addresses allowed.
2. Install `fleet-atlas.zip` on the *Apps* page (developer mode:
   `STUDIO_APPS_ALLOW_UNSIGNED=true`). A newer version installs as an update.
3. Open *Fleet Atlas* in the target's navigation rail.

### The demo world

`demo/generate-fleet.mjs` builds three fictitious sites with about 320 twins
from about 20 invented manufacturers (`demo/catalog.mjs`), and writes one AASX
package per site to `test-setup/fixtures/demo/`:

| Site | Contents |
| --- | --- |
| Rheinfeld Bottling Plant | Filling and packaging lines, utilities |
| Nordhafen Battery Module Plant | Stacking, laser welding, end-of-line testing, mobile robots, two dispatch pallets of battery modules |
| Lindental Machining Center | 5-axis milling and turning cells, quality lab, utilities, mobile robots |

Each twin has complete submodels, so all of Studio's views have something to
show, not only Fleet Atlas:

- Digital Nameplate 3.0, with address, company logo and CE/UKCA/RoHS/WEEE
  markings
- Technical Data 1.2, with a product image, a classification and properties
  whose IEC 61360 concept descriptions give units and definitions
- Carbon Footprint 1.0, with three life cycle phases
- Handover Documentation 2.0, with VDI 2770 PDFs: operating instructions,
  data sheet, EU declaration of conformity, and a factory acceptance test
  report for every machine
- Hierarchical Structures 1.1
- Operational data with limits

Every shell has a product picture as its thumbnail. `demo/media.mjs` renders
the pictures, logos, markings and PDFs with headless Chromium (Playwright).

The output is the same on every run. AAS Core 3.1 verifies it before
packaging. Some values are left empty on purpose (about one passport field
in ten on components), so passport readiness has gaps to find and fix. A
fix changes the target; `pnpm testenv:down` and then `pnpm testenv:demo`
restore it.
