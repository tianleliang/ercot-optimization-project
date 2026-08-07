# ERCOT Climate-Resilience Project Page

Combined research report and browser-native allocation simulator. Static Vite + React + TypeScript. No AMPL, SNOPT, backend, or credentials.

## Commands

```bash
npm install
npm run dev      # local preview
npm test         # unit + golden tests
npm run build    # production build → dist/
npm run preview  # serve dist/
```

Open `http://localhost:5173` after `npm run dev`. The **Project Report** tab is active by default; **Interactive Simulator** keeps state when you switch tabs.

## Combined page structure

| Piece | Role |
|---|---|
| Shared header | Project title, short description, compact method/attribution |
| Internal tabs | React state only — no URL change, no reload |
| `content/report.md` | Editable portable Markdown report (GFM + math) |
| `public/report-assets/` | Six report figures |
| `src/ReportView.tsx` | Renders the report in an ~850–950px reading column |
| `src/SimulatorView.tsx` | Full V2 simulator dashboard (wider layout) |
| `public/data/texas-boundary.geojson` | Local Texas outline for the map |

## Editing the report

1. Edit **`content/report.md` only** (do not rewrite it as JSX).
2. Keep image paths as `/report-assets/...`; the app rewrites them for the static `base: "./"` build.
3. Place figure PNGs in `public/report-assets/`.
4. Obsidian-style `> [!note] Title` callouts are converted to a research-status callout in the UI.
5. Display math uses `$$ ... $$` (KaTeX).
6. Rebuild / refresh `npm run dev` to preview.

The original vault report outside `simulation/` remains editorial source; the deployable app uses `content/report.md`.

## Simulator notes

- V2 controls: total loss, budget, scenario, published/custom loss distribution.
- Changing losses recomputes median `L_rep` and derived `b` (V4 behavior).
- Solver: exact KKT/bisection for the separable residual-loss model.
- Golden tests lock the published Moderate $5B case.

## Texas boundary

```bash
pip install pyshp shapely
python scripts/convert_texas_boundary.py
```
