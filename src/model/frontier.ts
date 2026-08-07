/**
 * Scenario frontiers and threshold ("golden cap") selection.
 * Ports V4 cells 15–18.
 */

import { solve, toSolveInputs, budgetBToM } from "./solver";
import { scenarioParamsMap, applyScenarioScaling } from "./scenarios";
import type {
  CalibratedSource,
  ClusterInput,
  FrontierRow,
  ScenarioName,
  ThresholdSelection,
} from "./types";
import { BUDGET_CAPS_B } from "./types";

const SCENARIOS: ScenarioName[] = ["Pessimistic", "Moderate", "Optimistic"];

export function runFrontierForScenario(
  clusters: ClusterInput[],
  calibrated: CalibratedSource[],
  scenario: ScenarioName,
  caps_B: readonly number[] = BUDGET_CAPS_B,
): FrontierRow[] {
  const params = applyScenarioScaling(calibrated, scenario);
  const map = scenarioParamsMap(params);
  const solveInputs = toSolveInputs(clusters, map);

  const rows: FrontierRow[] = [];
  for (const budget_B of caps_B) {
    const result = solve(solveInputs, budgetBToM(budget_B));
    rows.push({
      scenario,
      budget_B,
      budget_amount: budget_B * 1e9,
      residual_amount: result.residual_loss_B * 1e9,
      avoided_amount: result.avoided_loss_B * 1e9,
      ROI: result.ratio,
      mROI: null,
      residual_loss_B: result.residual_loss_B,
      avoided_loss_B: result.avoided_loss_B,
      ratio: result.ratio,
      marginal_ratio: null,
    });
  }

  rows.sort((a, b) => a.budget_B - b.budget_B);
  for (let i = 1; i < rows.length; i++) {
    const dA = rows[i].avoided_amount - rows[i - 1].avoided_amount;
    const dB = rows[i].budget_amount - rows[i - 1].budget_amount;
    const m = dB !== 0 ? dA / dB : NaN;
    rows[i].mROI = Number.isFinite(m) ? m : null;
    rows[i].marginal_ratio = rows[i].mROI;
  }
  return rows;
}

export function runAllFrontiers(
  clusters: ClusterInput[],
  calibrated: CalibratedSource[],
): FrontierRow[] {
  const out: FrontierRow[] = [];
  for (const scenario of SCENARIOS) {
    out.push(...runFrontierForScenario(clusters, calibrated, scenario));
  }
  return out;
}

/**
 * Largest tested cap with avoided ≥ $10B, ROI ≥ 1, mROI ≥ 1.
 * Fallback: highest ROI among tested points. V4 cell 18.
 */
export function selectThresholdBudget(
  frontier: FrontierRow[],
  scenario: ScenarioName,
  savingsMin_B = 10,
  roiMin = 1,
  mroiMin = 1,
): ThresholdSelection {
  const rows = frontier.filter((r) => r.scenario === scenario);
  const qualified = rows.filter(
    (r) =>
      r.avoided_loss_B >= savingsMin_B &&
      r.ratio >= roiMin &&
      r.marginal_ratio != null &&
      r.marginal_ratio >= mroiMin,
  );

  if (qualified.length > 0) {
    const best = qualified.reduce((a, b) =>
      a.budget_B >= b.budget_B ? a : b,
    );
    return {
      scenario,
      selected_budget_B: best.budget_B,
      avoided_loss_B: best.avoided_loss_B,
      ratio: best.ratio,
      marginal_ratio: best.marginal_ratio,
      is_fallback: false,
      selection_note:
        "largest tested budget meeting savings, ROI, and marginal-ROI thresholds",
    };
  }

  const fallback = rows.reduce((a, b) => (a.ratio >= b.ratio ? a : b));
  return {
    scenario,
    selected_budget_B: fallback.budget_B,
    avoided_loss_B: fallback.avoided_loss_B,
    ratio: fallback.ratio,
    marginal_ratio: fallback.marginal_ratio,
    is_fallback: true,
    selection_note:
      "fallback to highest sampled ROI; no tested point met all thresholds",
  };
}

export function selectAllThresholds(
  frontiers: FrontierRow[],
): ThresholdSelection[] {
  return SCENARIOS.map((s) => selectThresholdBudget(frontiers, s));
}
