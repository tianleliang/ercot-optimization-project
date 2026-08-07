/**
 * Scenario scaling of (a,b). Ports V4 cell 16 scale_ab.
 */

import type { CalibratedSource, ScenarioName, ScenarioSourceParams } from "./types";
import { SCENARIO_SCALES } from "./types";

const A_CAP = 0.95;
const B_FLOOR = 1e-9;

export function applyScenarioScaling(
  calibrated: CalibratedSource[],
  scenario: ScenarioName,
): ScenarioSourceParams[] {
  const { a_scale, b_scale } = SCENARIO_SCALES[scenario];
  return calibrated.map((c) => ({
    source: c.source,
    a: Math.min(A_CAP, c.a * a_scale),
    b_M: Math.max(B_FLOOR, c.b_M * b_scale),
    a_scale,
    b_scale,
  }));
}

export function scenarioParamsMap(
  params: ScenarioSourceParams[],
): Map<string, { a: number; b_M: number }> {
  return new Map(params.map((p) => [p.source, { a: p.a, b_M: p.b_M }]));
}

export function allScenarioParams(
  calibrated: CalibratedSource[],
): Record<ScenarioName, ScenarioSourceParams[]> {
  return {
    Pessimistic: applyScenarioScaling(calibrated, "Pessimistic"),
    Moderate: applyScenarioScaling(calibrated, "Moderate"),
    Optimistic: applyScenarioScaling(calibrated, "Optimistic"),
  };
}
