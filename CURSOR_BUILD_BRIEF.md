---
date: 2026-08-07
description: Definitive implementation contract for Cursor to build, validate, render, and package the browser-native ERCOT resilience simulator.
tags:
  - project
  - specification
  - simulation
  - cursor
status: active
---

# Cursor Build Brief — ERCOT Climate-Resilience Simulator

## Your role

Build the first complete browser implementation of the ERCOT climate-resilience optimization continuation inside this `simulation/` directory.

Treat every file outside `simulation/` as read-only source material. Create or modify application files only inside `simulation/` unless the user explicitly authorizes another path.

Do not merely mock the interface. Implement, test, and display the full deterministic and Monte Carlo pipeline described below. Keep the first visual design clean and neutral; mathematical correctness, traceability, and a working static build matter more than polish.

Before editing code, read this entire brief and inspect the authoritative files listed below. Then present a concise implementation plan. After the plan, proceed through the engine, tests, interface, and production build without waiting for repeated user confirmation unless a genuine source contradiction blocks correctness.

## Project-root context

Cursor is opened at `Stanford Web page/`. Treat paths in this brief as relative to that folder.

### Source priority

1. `simulation/CURSOR_BUILD_BRIEF.md` — implementation contract and scope.
2. `results export v4/results.json` — canonical machine-readable inputs and expected results.
3. `code changes/AMPL_SNOPT_grid_optimization_webpage_v4.ipynb` — authoritative executable reference for pipeline order, formulas, transformations, experiments, and output construction.
4. `results export v4/tables/` — CSV mirrors for auditing.
5. `04 Interactive Simulation Specification.md` — product and handoff rationale.
6. `03 Native Website Report.md` — approved explanatory language, definitions, and limitations.

If prose and code disagree numerically, use `results.json`. Do not silently invent or “improve” scientific assumptions.

## Port the existing V4 pipeline; do not reinvent it

The notebook already contains the working analysis. Base the browser engine directly on its implemented pipeline. Translate the Python/Pandas/AMPL operations into TypeScript while preserving the same formulas, constants, scenario order, caps, table schemas, aggregation rules, and experiment flow.

Do **not** independently design a new optimization workflow from this prose. Use this brief to identify what belongs in the browser and use the notebook to see exactly how the existing computation performs it. The one intentional algorithmic substitution is the solve call: replace AMPL/SNOPT with the exact KKT/bisection routine specified below. Everything around the solve should remain behaviorally equivalent unless this brief explicitly changes it for interactivity.

Before implementation, create `simulation/PORTING_MAP.md` that maps each relevant V4 notebook section/cell to its TypeScript module and identifies what is copied, translated, replaced, or excluded.

### Notebook porting map to follow

Cell positions below refer to the current V4 notebook:

| V4 cells | Existing responsibility | Browser treatment |
|---|---|---|
| 5–6 | Flatten cluster losses and total the baseline | Replace file-loading dependency with canonical V4 JSON; preserve names, values, and reconciliation |
| 9 | AMPL residual-loss objective and budget constraint | Preserve the exact mathematical model; replace only the AMPL representation |
| 10–12 | Source assumptions, annuity factor, representative source loss, and `b` calibration | Port directly into pure TypeScript |
| 15–19 | Caps, frontier execution, scenario scaling, and golden-cap selection | Port directly; replace each `ampl.solve()` with KKT/bisection |
| 23–29 | Cluster-to-source mapping and $1B/$5B/$10B Moderate source allocations | Port directly and preserve output fields |
| 31 | Detailed golden/reference cluster allocation and share calculation | Generalize to the visitor-selected scenario and budget while preserving the default result |
| 33 | Coordinate mapping and geographic aggregation | Port the data transformations directly; replace Matplotlib/GeoPandas rendering with browser charts |
| 35–39 | Moderate-centered Monte Carlo, trial metrics, source aggregation, and distributions | Port the logic and draw order; generalize the center to the visitor-selected scenario and budget |
| 41 | Canonical export schemas, qualifications, and table construction | Use as the schema reference for browser result objects and downloads |

Explicitly exclude or replace:

- Cells 1–4: general notebook imports, Google Drive mounting, file loading, AMPL installation, license UUID, and Colab setup.
- Cell 14: notebook-only automatic static figure capture.
- AMPL object setup, solver logs, notebook `display()` calls, and filesystem export/download mechanics.
- Matplotlib, Seaborn, GeoPandas, and pandas presentation code; translate their data transformations and reproduce their output concepts with browser-native tables/charts.

Preserve recognizable domain variable names such as `a`, `b`, `L`, `budget`, `avoided_loss`, `residual_loss`, `mROI`, `cluster`, and `source` where they improve traceability. Add comments that cite the corresponding V4 cell or function for non-obvious translations.

## Security boundary

- Never copy any AMPL license UUID, private credential, Google Drive path, Colab setup, or SNOPT runtime into `simulation/`.
- Do not expose or ship the V4 notebook.
- Do not claim Stanford endorsement or use Stanford seals/branding.
- Do not add analytics, trackers, external APIs, or production network dependencies.
- Bundle runtime dependencies locally. The finished static application must run without a backend.

## V1 visitor controls

Keep editable inputs intentionally limited:

1. **Total modeled cumulative loss ($B)** — default `43.1`.
2. **Detailed allocation budget ($B)** — default `5.0`.
3. **Detailed allocation scenario** — default `Moderate`; options `Pessimistic`, `Moderate`, `Optimistic`.

Include **Run full analysis** and **Reset published case** actions.

For V1, preserve the published relative distribution across the 18 clusters. When total loss changes, scale every cluster proportionally from its canonical `baseline_loss_B` share in `results.json`, so scaled cluster losses reconcile exactly to the visitor’s total.

Display the 18 resulting inputs, but do not make source or cluster weights editable yet. Architect the state and model types so a distribution editor can be added later without rewriting the solver.

Validation rules:

- Total loss must be finite and greater than zero.
- Budget must be finite and nonnegative.
- Permit budgets above total modeled loss but show a plain-language warning that the model will continue allocating against an asymptotic response.
- Never silently substitute defaults after invalid input.

## What “full pipeline” means

The application must run and display these stages in order:

1. Input preparation
2. Source calibration
3. Three scenario frontiers
4. Threshold-selected budgets
5. Moderate source allocation at $1B, $5B, and $10B
6. Detailed allocation at the visitor’s chosen budget and scenario
7. Geographic aggregation at ten centroids
8. Monte Carlo sensitivity at the visitor’s chosen budget and scenario

This is the V4 optimization continuation, not the upstream machine-learning forecasting pipeline. Do not add TensorFlow, train models, or imply that the browser forecasts loss. The visitor supplies a total modeled loss scenario; the browser allocates resilience investment against it.

## Units

Use **millions of dollars ($M)** internally to match the original formulation:

- `loss_M = loss_B * 1000`
- `budget_M = budget_B * 1000`
- `b` is in $M

Convert to $B only for display and exported report-friendly results. Centralize all conversions and formatting.

## Canonical model

For source-specific cluster (i), with source (s(i)):

$$
\min_{x_i\ge 0}\;\Phi(x)
=\sum_i L_i\left(1-\frac{a_{s(i)}x_i}{x_i+b_{s(i)}}\right)
\quad\text{subject to}\quad
\sum_i x_i\le B.
$$

Definitions:

- (L_i): cumulative modeled cluster loss in $M.
- (x_i): cluster investment allocation in $M.
- (a_s): maximum modeled avoidable fraction for source (s).
- (b_s): source diminishing-return scale in $M.
- (B): budget in $M.

Per-cluster avoided loss:

$$
A_i(x_i)=L_i\frac{a_sx_i}{x_i+b_s}.
$$

Residual loss is `sum(L_i) - sum(A_i)`.

The displayed “ROI” from the notebook must be labeled **modeled avoided-loss / budget ratio** in the visitor interface. It is not accounting ROI or IRR.

## Base source calibration

Read source assumptions from `results.json -> inputs.source_assumptions`. Recompute rather than hard-code derived values when total loss changes.

For each source:

1. Collect the scaled cluster losses belonging to that source.
2. Set representative loss (L_{rep,s}) to their median in $M.
3. Calculate the annuity factor:

$$
AF(r,H)=\frac{1-(1+r)^{-H}}{r}.
$$

4. Calculate present value per $1M invested:

$$
PV_s=R_sAF(r_s,H_s).
$$

5. Calculate:

$$
b_s=\frac{a_sL_{rep,s}}{PV_s}.
$$

Use the canonical base inputs from `results.json`: maximum avoidable fraction, annual avoided loss per $1M invested, horizon, and discount rate. If `PV <= 0`, fail validation rather than returning an infinite or misleading result.

Display a calibration table containing source, scaled representative loss, base (a), annual avoided loss assumption, horizon, discount rate, annuity factor, and derived (b).

## Scenario scaling

Apply the following after base calibration:

| Scenario | `a_scale` | `b_scale` |
|---|---:|---:|
| Pessimistic | 1.00 | 1.00 |
| Moderate | 1.15 | 0.85 |
| Optimistic | 1.30 | 0.70 |

For each source:

```text
scenario_a = min(0.95, base_a * a_scale)
scenario_b_M = max(1e-9, base_b_M * b_scale)
```

These scenarios change modeled investment effectiveness. They do not change the total-loss scenario.

## Browser solver

Do not use SNOPT, AMPL, or a server-side Ipopt dependency. Implement the exact KKT solution for this separable convex model.

For multiplier (\lambda>0):

$$
x_i(\lambda)=\max\left(0,\sqrt{\frac{L_i a_i b_i}{\lambda}}-b_i\right).
$$

Use bisection to find (\lambda) such that:

$$
\sum_i x_i(\lambda)=B.
$$

Implementation requirements:

- Return all-zero allocations when budget is zero.
- Use the maximum zero-investment marginal benefit, (\max_i(L_i a_i/b_i)), as a safe upper bracket for (\lambda).
- Find a positive lower bracket whose allocation sum is at least the budget; never divide by zero.
- Stop when budget reconciliation is within `1e-9 * max(1, budget_M)` or after a documented maximum iteration count.
- Clamp only tiny floating-point negatives to zero.
- Return allocations for every cluster, including zero-funded clusters.
- Calculate avoided and residual loss directly from the canonical response equation after solving.
- Keep the model implementation as pure TypeScript with no DOM or chart dependencies.

## Stage 1 — Input preparation

Output immediately:

- Total scaled loss
- Counts: seven sources, 18 source-clusters, ten geographic cells
- Full cluster input table: cluster, source, scaled loss, published share, latitude, longitude
- Reconciliation status showing cluster losses sum to the selected total

## Stage 2 — Calibration

Output the complete seven-source calibration table and scenario-adjusted (a,b) table. These are technical outputs and may be presented in an expandable section, but they must be visible to the visitor.

## Stage 3 — Scenario frontiers

For all three scenarios, solve these 20 caps in $B:

```text
0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5,
7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 35, 40
```

For every row calculate:

- budget
- residual loss
- avoided loss
- avoided-loss/budget ratio
- marginal ratio between adjacent caps

Render progressively:

- All-scenario budget-versus-avoided-loss chart
- All-scenario budget-versus-ratio chart
- Expandable 60-row frontier table

## Stage 4 — Threshold selection

For each scenario, select the **largest tested cap** satisfying all three:

```text
avoided loss >= $10B
avoided-loss/budget ratio >= 1.0
marginal ratio >= 1.0
```

If no point satisfies all three, select the tested point with the highest total ratio and label it explicitly as a fallback.

Display scenario, selected/fallback budget, avoided loss, total ratio, marginal ratio, and selection note.

Keep the absolute $10B threshold unchanged when the visitor changes total loss; it is part of the published experiment. Add a note that custom total-loss scenarios may therefore produce no threshold-qualified cap.

## Stage 5 — Source allocation comparison

Using the **Moderate** scenario, solve $1B, $5B, and $10B regardless of the visitor’s detailed budget. Aggregate cluster allocations by source.

Display:

- Grouped source-share chart matching the V4 comparison concept
- Source allocation dollars and shares table for all seven sources and all three caps

## Stage 6 — Detailed custom allocation

Solve the visitor’s selected scenario and selected budget.

Display summary cards as soon as this solve completes:

- Budget
- Modeled avoided loss
- Residual loss
- Modeled avoided-loss/budget ratio

Then display the 18-cluster table:

- cluster
- source
- scaled baseline loss
- allocation
- allocation share
- latitude
- longitude

Also display a ranked cluster-allocation bar chart. Make zero-funded but nonzero-loss clusters visible.

## Stage 7 — Geographic aggregation

Aggregate the 18 detailed results by exact `(latitude, longitude)` pairs. Preserve the list of source-clusters in each cell and the upstream risk rank from `results.json`.

Display two dynamic geographic bubble panels:

- cumulative modeled loss by grid cell
- optimized allocation by grid cell

Circle area and color should encode magnitude. Make clear that circles do not represent geographic coverage. If a polished Texas boundary cannot be bundled locally without adding fragility, use a clean longitude/latitude centroid view for V1 rather than fetching map assets at runtime.

Include the ten-row geographic table.

## Stage 8 — Monte Carlo sensitivity

Run 300 trials at the visitor’s selected scenario and budget. Use a deterministic seeded PRNG; do not use unseeded `Math.random()`.

For each trial:

1. Center (a,b) on the visitor’s selected scenario values.
2. For each source, draw independent normal multipliers:
   - (a\): mean 1, standard deviation 0.10
   - (b\): mean 1, standard deviation 0.20
3. Clip shocked (a) to `[0.05, 0.95]`.
4. Floor shocked (b) at `1e-6` $M.
5. For every cluster, draw an independent loss multiplier with mean 1 and standard deviation 0.15, floored at `0.10`.
6. Solve with the same KKT engine.
7. Store shocked baseline loss, residual loss, avoided loss, ratio, and source allocation shares.

Yield to the browser at regular intervals and update a real progress indicator such as `175 / 300 trials`. Support cancellation if straightforward, but do not let cancellation delay the MVP.

Display:

- Avoided-loss histogram and summary: count, mean, standard deviation, min, 5th, median, 95th, max
- Ratio histogram and the same summary plus share of trials above one
- Source-share distribution chart for all seven sources
- Source-share summary: mean, standard deviation, 25th, median, 75th
- Expandable/downloadable trial data

The JavaScript seeded normal generator does not need to reproduce NumPy trial-for-trial. It must be deterministic within the browser and statistically consistent with the frozen V4 experiment. State this in the technical notes.

## Progressive interface

Build a sequential pipeline dashboard rather than a single results dump:

```text
Controls
  -> Input preparation
  -> Calibration
  -> Scenario frontiers
  -> Threshold selection
  -> Source allocation
  -> Detailed cluster allocation
  -> Geographic aggregation
  -> Monte Carlo sensitivity
```

Each stage needs:

- pending/running/completed/error status
- short plain-language explanation
- its outputs when available
- expandable technical tables where appropriate

Do not introduce artificial multi-second delays. Compute a stage, update state/render, yield to the browser, and continue. The deterministic selected-budget result should appear before the longer frontier and Monte Carlo work when practical.

## Interface and language

- First version: clean, restrained, responsive, and neutral—not Stanford branded.
- Use the report’s scientific language rather than generic marketing copy.
- Always distinguish modeled results, assumptions, and user inputs.
- Always describe $43.1B as cumulative 2025–2050 modeled provider loss, not annual loss.
- Label threshold-selected budgets as reference points, not unique optima.
- Include a visible limitations/disclaimer section.
- Include a link or reference to the upstream paper, but do not rely on Obsidian wikilinks in the production build.
- Ensure keyboard usability, proper labels, readable tables, and sufficient color contrast.

## Technical architecture

Priority zero is a working static application and iframe-ready build.

- Use Vite + TypeScript.
- React is acceptable for the interface if it speeds reliable delivery.
- Keep all mathematical and data modules framework-independent.
- Choose one charting library and bundle it locally; do not use CDN scripts.
- Load a copied/sanitized data asset inside `simulation/`, derived from canonical V4 JSON. Do not make the runtime reach outside `simulation/`.
- No backend, database, authentication, or server-side rendering.
- Keep generated build artifacts in `simulation/dist/`.
- A Web Component/library build is desirable but secondary to the static preview; do not compromise the working MVP to force it before the design company confirms its stack.

Suggested structure:

```text
simulation/
  src/
    data/
    model/
      types.ts
      calibration.ts
      solver.ts
      scenarios.ts
      frontier.ts
      monteCarlo.ts
      aggregation.ts
    components/
    charts/
    App.tsx or app.ts
    main.tsx or main.ts
  tests/
  public/
  dist/
  README.md
  HANDOFF.md
  package.json
  vite.config.ts
```

## Validation contract

Automated tests must cover:

1. Cluster scaling sums exactly to the visitor’s total within tolerance.
2. Median representative losses and all base (b) values match canonical V4 at the published input.
3. Scenario scaling and clipping match `inputs.scenario_parameters`.
4. Every allocation is nonnegative.
5. Every positive-budget deterministic allocation sums to budget within tolerance.
6. Avoided plus residual loss equals baseline loss.
7. Source and geographic aggregation reconcile to cluster results.
8. Reset reconstructs the published case exactly.
9. Invalid inputs produce visible errors and no misleading results.
10. Seeded Monte Carlo is repeatable in-browser.

Golden deterministic tests at the published input must compare against `results.json`:

- All 60 frontier rows
- All three threshold-selected rows
- Moderate $1B/$5B/$10B source allocations
- Moderate $5B reference summary
- All 18 Moderate $5B cluster allocations
- All ten Moderate $5B geographic rows

Target tolerance:

- allocation: within `0.001` $M per cluster
- displayed $B results: within `1e-6` $B before formatting
- shares: within `1e-6` percentage points before formatting

Monte Carlo validation is statistical rather than trial-identical. At the published case, require reasonable tolerances around the frozen V4 summaries and document them in tests; do not hard-code the displayed V4 distributions as if they were newly simulated.

## Required scripts and deliverables

The finished project must support:

```text
npm install
npm run dev
npm test
npm run build
npm run preview
```

Produce:

- Functional source under `simulation/src/`
- Automated tests
- Local production build under `simulation/dist/`
- `README.md` with local commands and architecture
- `HANDOFF.md` with data-update points, iframe integration, asset list, solver explanation, and known limitations
- No secrets and no absolute machine-specific paths

## Implementation sequence

### Pass 1 — inspect and plan

- Read this brief and authoritative sources.
- Inventory the canonical schema and exact golden values.
- State the proposed dependency set and file structure.
- Identify genuine contradictions before coding.

### Pass 2 — engine and tests

- Copy/sanitize the required canonical data.
- Implement pure TypeScript calibration, solver, scenarios, frontier, aggregation, and Monte Carlo.
- Make deterministic golden tests pass before building charts.

### Pass 3 — progressive dashboard

- Implement the three controls and reset.
- Build sequential stage rendering.
- Add all required tables and charts.
- Add export/download and technical details.

### Pass 4 — audit and package

- Run tests and production build.
- Inspect browser console and responsive layouts.
- Confirm no credentials, external runtime calls, or Stanford claims.
- Complete README and HANDOFF.
- Report exact validation results and any remaining limitations.

## Definition of done

The task is complete only when:

- A visitor can change the three approved inputs and run the full pipeline.
- Results render stage by stage.
- Every required chart and table is present.
- The published default case passes deterministic golden tests.
- Monte Carlo is seeded, progressive, and statistically validated.
- `npm test` and `npm run build` succeed.
- `dist/` can be served statically without a backend.
- The design company can understand integration and future data updates from `HANDOFF.md`.

## Final response format

When finished, report:

1. What was built
2. Exact files created or changed
3. Test and build results
4. Default-case numerical validation results
5. How to open the preview
6. Remaining limitations or decisions for the human reviewer

## Related

- [[03 Projects/active/Stanford Web page/04 Interactive Simulation Specification|Interactive Simulation Specification]]
- [[03 Projects/active/Stanford Web page/01 Project Plan|Project Plan]]
- [[03 Projects/active/Stanford Web page/results export v4/results.json|Canonical V4 Results]]
