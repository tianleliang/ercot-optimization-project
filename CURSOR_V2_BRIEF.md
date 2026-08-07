---
date: 2026-08-07
description: Focused V2 implementation brief for adding custom loss distributions, a Texas boundary map, and explanatory context without rebuilding the validated simulator.
tags:
  - project
  - simulation
  - cursor
  - specification
status: active
---

# Cursor V2 Brief — Focused Simulator Upgrade

## Objective

Upgrade the existing working V1 simulator in place. **Do not rebuild it, change its visual direction, or replace the validated calculation pipeline.** Preserve V1 behavior and tests while adding only the V2 capabilities below.

Before editing, read:

1. `simulation/CURSOR_BUILD_BRIEF.md`
2. `simulation/PORTING_MAP.md`
3. `simulation/README.md`
4. `simulation/HANDOFF.md`
5. `04 Interactive Simulation Specification.md`
6. the current `simulation/src/` implementation and tests

## 1. Add the two-level loss-distribution editor

Keep **Published distribution** as the default. Add a **Custom distribution** mode with:

- **Level 1:** editable nonnegative relative weights for the seven energy sources, shown with numeric controls and a clear visual summary such as a stacked bar.
- **Level 2:** expandable within-source controls for all 18 source-specific clusters (two to four clusters per source).
- Continuously normalize source weights and each source's cluster weights to 100%; clearly show both normalized percentages and the resulting dollar loss per cluster.
- Compute each cluster loss as `total modeled loss × normalized source weight × normalized within-source cluster weight`.
- If a source has positive weight, prevent or clearly resolve the invalid case where all of its cluster weights are zero.
- Add **Reset source** and **Reset published distribution** actions.
- Changing total loss or custom weights must run the same complete V1 pipeline and update every downstream output.

Follow the V4 method: when cluster losses change, recompute each source's representative median loss and the derived `b` calibration before applying the selected response scenario. Do not silently hold `b` fixed. Briefly disclose this behavior in the interface.

Include distribution mode, raw weights, normalized weights, cluster losses, and recalculated parameters in exported JSON/CSV.

## 2. Replace the coordinate-only map with a local Texas boundary

Authoritative raw files are in:

`source/texas-county-subdivisions/cb_2018_48_cousub_500k.*`

Use the five-file shapefile bundle (`.shp`, `.shx`, `.dbf`, `.prj`, `.cpg`) only as a build-time/source asset. Convert it once to a simplified browser-friendly GeoJSON asset under:

`simulation/public/data/texas-boundary.geojson`

Do **not** add a runtime shapefile parser, network request, backend, or dependency on Google Drive. The production map should load the local GeoJSON. Preserve either useful subdivision lines or a clean dissolved Texas outline, whichever reads better and keeps the asset reasonably small.

Plot the existing ten geographic centroids over the boundary. Map colors and marker radii must rescale dynamically for the selected metric and custom input distribution, while keeping zero and near-zero values legible. Preserve the existing loss/allocation toggle or comparison behavior.

## 3. Add concise explanatory context above the simulator

Add a compact intro and usage block—not a long report. It should explain:

- the simulator allocates a selected resilience budget across 18 fixed source-specific ERCOT clusters;
- the published analysis was formulated in AMPL and solved with SNOPT;
- the browser uses the exact KKT/bisection solution for this separable model, independently validated against the archived SNOPT reference;
- users choose total modeled loss, budget, response scenario, and optionally a custom relative loss distribution;
- the simulator reallocates assumed loss and **does not rerun the upstream machine-learning forecasts**;
- outputs are scenario-dependent modeled results;
- avoided loss divided by budget is a modeled benefit-cost ratio, not accounting ROI or IRR;
- the 18 clusters and ten geographic centroids are fixed to the published project structure.

Include a three-step usage cue: set inputs, optionally edit the distribution, then run and review the progressively rendered outputs.

## 4. Regression and edge-case requirements

- Preserve every existing V1 golden test and the default Moderate $5B match.
- Add tests for: zero budget; one source at zero weight; one cluster holding all weight within a source; highly concentrated distributions; normalization; reset behavior; and reconciliation of cluster, source, geographic, and total values.
- Reset must restore all published weights, calibration values, controls, and outputs exactly.
- Keep the current progressive output rendering, export functionality, responsiveness, and static no-backend build.
- Do not introduce private credentials, the SNOPT license UUID, or new production network dependencies.
- Keep the V1 design. Make only the minimum layout changes needed for the editor, boundary map, and explanatory block.

## Completion checklist

1. Run the full test suite.
2. Run the production build.
3. Update `simulation/README.md` and `simulation/HANDOFF.md` only where V2 changes behavior or assets.
4. Report changed files, test/build results, GeoJSON generation method and size, and any remaining limitations.

## Related

- [[03 Projects/active/Stanford Web page/simulation/CURSOR_BUILD_BRIEF|V1 Cursor Build Brief]]
- [[03 Projects/active/Stanford Web page/04 Interactive Simulation Specification|Interactive Simulation Specification]]
- [[03 Projects/active/Stanford Web page/01 Project Plan|Project Plan]]
