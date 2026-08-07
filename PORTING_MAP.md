# Porting Map — V4 Notebook → Browser TypeScript

Maps `code changes/AMPL_SNOPT_grid_optimization_webpage_v4.ipynb` cells to `simulation/src` modules.

| V4 cells | Responsibility | Browser treatment | Module |
|---|---|---|---|
| 1–4 | Imports, Drive mount, AMPL install, license | **Excluded** (security) | — |
| 5–6 | Flatten cluster losses; total baseline | Translated; load from sanitized `canonical.json` | `calibration.ts` `prepareClusterInputs` |
| 7–8 | Project plan / ROI research markdown | Explanatory UI copy only | `components/` |
| 9 | AMPL residual-loss model + budget | Math preserved; AMPL replaced by KKT/bisection | `solver.ts` |
| 10–12 | Source assumptions, AF, L_rep median, `b` | Ported directly | `calibration.ts` |
| 14 | Static figure capture | **Excluded** | — |
| 15–16 | Caps, frontiers, scenario `scale_ab` | Ported; `ampl.solve` → `solve()` | `frontier.ts`, `scenarios.ts` |
| 18 | Golden / threshold cap finder | Ported | `frontier.ts` `selectThresholdBudget` |
| 20–21 | Matplotlib frontier plots | Replaced with Chart.js | `charts/` |
| 23–25 | Moderate $1B/$5B/$10B source allocs | Ported | `aggregation.ts`, `pipeline.ts` |
| 31 | Detailed Moderate $5B cluster table | Generalized to visitor scenario/budget | `pipeline.ts` |
| 33 | Lat/lon map + Texas shapefile | Data agg ported; shapefile → lat/lon bubbles | `aggregation.ts` |
| 35–39 | Monte Carlo (seed 42, 300 trials) | Ported; NumPy RNG → Mulberry32+Box–Muller | `monteCarlo.ts` |
| 41 | Formal export schemas | Schema reference for types + downloads | `types.ts`, export helpers |

## Intentional substitutions

- **Solver:** SNOPT → exact KKT allocation with λ bisection (same separable convex model).
- **RNG:** `np.random.seed(42)` → seeded Mulberry32 (deterministic in-browser; not trial-identical to NumPy).
- **Maps:** GeoPandas Texas boundary → local lat/lon centroid scatter (no runtime map fetch).

## Copied data asset

- `src/data/canonical.json` — sanitized from `results export v4/results.json` (no Drive paths, no figure filesystem paths, frontiers as array).
