---
date: 2026-08-07
description: Focused build brief for combining the editable research report and validated simulator into one deployable two-tab project page.
tags:
  - project
  - website
  - cursor
  - handoff
status: active
---

# Cursor Brief — Combined Report and Simulator

## Goal

Turn the existing simulator into a minimal combined project website with two internal views:

1. **Project Report** — the default landing view.
2. **Interactive Simulator** — the existing complete V2 dashboard.

This is assembly work, not a redesign. Preserve the validated simulator, its state, calculations, charts, tables, tests, exports, and current visual language. Do not change scientific logic.

## Prepared content

- Editable, portable web report: `content/report.md`
- Six report figures: `public/report-assets/`
- Existing simulator: `src/`
- Existing local Texas map asset: `public/data/texas-boundary.geojson`

The original vault report remains outside this app for editorial preservation. The deployable application must use `content/report.md`, which contains standard Markdown and portable `/report-assets/...` image paths.

## Page structure

Create one shared site shell:

```text
Project title
Short project description
Compact attribution/method note

[ Project Report ] [ Interactive Simulator ]

Active view
```

Use this title:

**From Climate-Risk Forecasts to Resilience Investment Decisions in ERCOT**

Use a restrained one- or two-sentence description explaining that this is an interactive optimization continuation of prior ERCOT climate-risk forecasting research, allocating resilience investment across seven sources and 18 source-specific clusters.

Keep the existing blue-gray academic/dashboard visual system. The header should feel like a research-project page, not a startup landing page: no oversized marketing hero, gradients beyond the current subtle background, decorative illustrations, Stanford branding, seal, or endorsement claim.

## Tab behavior

- Tabs are internal React state and **must not change the URL or reload the page**.
- `Project Report` is active on first load.
- Use accessible tab semantics, keyboard focus states, and a clear active indicator.
- Preserve simulator inputs and generated results when switching away and returning. Refactor or mount views accordingly; do not reset the simulator merely because its tab was hidden.
- Avoid chart sizing errors when the simulator becomes visible after being hidden.

## Report view

- Render `content/report.md` at build/runtime as trusted local Markdown; do not manually duplicate the report as JSX.
- Support GFM tables, headings, blockquotes, links, images, and display math. A lightweight Markdown stack such as `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, and KaTeX CSS is acceptable.
- Present the report in a centered reading column around 850–950 px wide.
- Use strong readable typography, generous section spacing, restrained table styling, responsive figures, captions, and horizontal overflow for wide tables.
- Render the existing `> [!note] Research status` block as a visually distinct research-status callout rather than showing ugly raw Obsidian syntax. A small preprocessing step is acceptable.
- Do not edit, expand, humanize, or fact-check the report in this task. Preserve its current words.

## Simulator view

- Preserve the current V2 simulator essentially unchanged.
- Allow the dashboard to use the wider existing layout rather than forcing it into the report reading column.
- Remove or reduce only genuinely duplicative top-level title copy now supplied by the shared project header.
- Do not alter model code, default inputs, custom-distribution behavior, map behavior, Monte Carlo, exports, or progressive stages.

## Responsive behavior

- Desktop: shared centered shell; report constrained for reading; simulator uses the full existing application width.
- Mobile: tabs remain obvious and usable, figures scale to the viewport, tables scroll horizontally, and no existing simulator controls break.

## Boundaries

- No router is needed.
- No second URL, iframe, backend, network API, CMS, authentication, analytics, or new deployment service.
- Do not move or rename the current simulator project.
- Do not add extra navigation, portfolio sections, contact forms, animations, or UI polish beyond what is needed for a coherent combined page.

## Verification

1. Run all existing tests without weakening them.
2. Add only minimal UI tests if genuinely useful; do not delay the build for a new testing framework.
3. Run `npm run build`.
4. Manually verify both tabs, report tables/equations/figures, tab-state preservation, and the simulator charts after returning to its tab.
5. Update `README.md` and `HANDOFF.md` to identify the combined project page and `content/report.md` editing workflow.
6. Report changed files, test/build results, and any remaining presentation limitations.

## Related

- [[03 Projects/active/Stanford Web page/simulation/CURSOR_V2_BRIEF|Simulator V2 Brief]]
- [[03 Projects/active/Stanford Web page/03 Native Website Report|Original Native Website Report]]
- [[03 Projects/active/Stanford Web page/simulation/HANDOFF|Technical Handoff]]
