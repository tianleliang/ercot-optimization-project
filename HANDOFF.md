# Handoff — ERCOT Combined Report + Simulator

## What you are receiving

A single static site with two internal views:

1. **Project Report** (default) — rendered from `content/report.md`
2. **Interactive Simulator** — validated V2 dashboard

Also included:

- Source under `simulation/src/`
- Tests under `simulation/tests/`
- Production build under `simulation/dist/` (after `npm run build`)
- `src/data/canonical.json`, `public/data/texas-boundary.geojson`, `public/report-assets/`

No backend, AMPL license, SNOPT runtime, analytics, or Stanford endorsement.

## How to run

```bash
cd simulation
npm install
npm run build
npm run preview
```

Deploy the entire `dist/` folder (includes `dist/data/` and `dist/report-assets/`).

## Iframe integration

```html
<iframe
  src="/path/to/simulation/dist/index.html"
  title="ERCOT climate-resilience project"
  style="width:100%;min-height:1400px;border:0;"
></iframe>
```

Tabs do not change the URL. No router is required.

## Report editing workflow

1. Edit `content/report.md` (portable Markdown; do not paste vault-only wikilinks).
2. Update figures under `public/report-assets/` if needed; keep `/report-assets/...` paths in Markdown.
3. `> [!note] Research status` becomes a styled callout automatically.
4. Run `npm run dev` or `npm run build` to review.
5. Do not duplicate the report body into React components.

## Simulator / data update points

1. Regenerate `src/data/canonical.json` from a new V4+ `results.json` when quantitative inputs change.
2. Re-run `npm test` (published golden case + distribution edge cases).
3. Refresh Texas outline via `python scripts/convert_texas_boundary.py` if the shapefile source changes.
4. Rebuild with `npm run build`.

## Tab / state behavior

- Both panels use React state; the simulator stays mounted while hidden so inputs and results persist.
- Returning to the simulator dispatches a resize event so Chart.js canvases reflow.

## Known limitations

- Report H1 is omitted in the reading pane because the shared site header already shows the project title; the report subtitle and body are unchanged.
- Figure captions that are italic paragraphs after images are styled as captions; caption text is not rewritten.
- Monte Carlo remains statistically validated, not NumPy trial-identical.
- Custom distributions reallocate assumed loss; they do not regenerate upstream ML forecasts.
- Dissolved Texas outline, not full county-subdivision fill.

## Security checklist

- No license UUIDs or Drive paths in the shipped tree
- No network calls required at runtime
- No Stanford branding/endorsement claims
