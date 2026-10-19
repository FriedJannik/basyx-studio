# 0041: ApexCharts for the Time Series Data view

- Status: Proposed
- Date: 2026-10-19
- Deciders: BaSyx Studio maintainers
- Requirements: PROD-001, ARCH-002, ARCH-005

## Context

The bundled *Time Series Data* app ports the BaSyx AAS Web UI's plugin for
IDTA 02008 ([time series plan](../development/time-series-plan.md)). Users
of both tools should see the same line, area, scatter, histogram and gauge
charts with the same zoom, pan and tooltips. Studio has no chart library.

## Decision

- The app uses **ApexCharts 7.1** (MIT) through its imperative API, as the
  Web UI does, with the chart options ported from the Web UI's widgets.
- It is a dependency of `apps/time-series` only, not of Studio. Studio's
  bundle does not grow; the app's package carries the library.
- The charts follow Studio's theme: the app passes the theme's mode and
  colours to ApexCharts whenever Studio's context changes.
- ApexCharts sets inline styles and injects a stylesheet. The app frames'
  CSP already allows inline styles (ADR 0017), so no CSP change is needed.
  The *Display field* chart type is a Vuetify card, not a chart.

## Consequences

- The app package grows by about 150 KB (gzip).
- The library needs Eclipse IP review, as the libraries of ADR 0034 and
  ADR 0039 did.
- A future chart library for Studio itself (dashboards, ADR 0009) is not
  decided here.

## Alternatives considered

- **ECharts:** more chart types, but larger, and the port would change how
  the charts look and behave compared with the Web UI.
- **Chart.js:** smaller, but zoom and time axes need plugins, and the
  Web UI's options would have to be rewritten.
- **Vuetify's sparkline:** no axes, legend, zoom or tooltips.
