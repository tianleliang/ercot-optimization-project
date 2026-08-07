/**
 * Input preparation and source calibration.
 * Ports V4 notebook cells 5–6, 10–12.
 */

import type {
  CalibratedSource,
  ClusterInput,
  SourceAssumption,
  ValidationError,
  VisitorInputs,
} from "./types";
import { billionToMillion, millionToBillion } from "./units";

export interface CanonicalClusterRow {
  cluster: string;
  source: string;
  source_label: string;
  latitude: number;
  longitude: number;
  baseline_loss_B: number;
}

export function validateVisitorInputs(
  inputs: VisitorInputs,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Number.isFinite(inputs.totalLoss_B) || inputs.totalLoss_B <= 0) {
    errors.push({
      field: "totalLoss_B",
      message: "Total modeled cumulative loss must be a finite number greater than zero.",
    });
  }
  if (!Number.isFinite(inputs.budget_B) || inputs.budget_B < 0) {
    errors.push({
      field: "budget_B",
      message: "Budget must be a finite nonnegative number.",
    });
  }
  if (
    inputs.scenario !== "Pessimistic" &&
    inputs.scenario !== "Moderate" &&
    inputs.scenario !== "Optimistic"
  ) {
    errors.push({
      field: "scenario",
      message: "Scenario must be Pessimistic, Moderate, or Optimistic.",
    });
  }
  return errors;
}

/** Scale published cluster losses so they sum exactly to visitor total. */
export function prepareClusterInputs(
  published: CanonicalClusterRow[],
  totalLoss_B: number,
): ClusterInput[] {
  const publishedTotal = published.reduce((s, c) => s + c.baseline_loss_B, 0);
  if (!(publishedTotal > 0)) {
    throw new Error("Published cluster losses sum to zero; cannot scale.");
  }

  const scaled = published.map((c) => {
    const share = c.baseline_loss_B / publishedTotal;
    const loss_B = totalLoss_B * share;
    return {
      cluster: c.cluster,
      source: c.source,
      source_label: c.source_label,
      latitude: c.latitude,
      longitude: c.longitude,
      baseline_loss_B: c.baseline_loss_B,
      published_share: share,
      loss_B,
      loss_M: billionToMillion(loss_B),
    };
  });

  // Exact reconciliation: assign residual to the largest cluster.
  const sum = scaled.reduce((s, c) => s + c.loss_B, 0);
  const drift = totalLoss_B - sum;
  if (Math.abs(drift) > 0) {
    let maxIdx = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i].loss_B > scaled[maxIdx].loss_B) maxIdx = i;
    }
    scaled[maxIdx] = {
      ...scaled[maxIdx],
      loss_B: scaled[maxIdx].loss_B + drift,
      loss_M: billionToMillion(scaled[maxIdx].loss_B + drift),
    };
  }

  return scaled;
}

/** Annuity factor AF(r,H) — V4 cell 10. */
export function annuityFactor(r: number, H: number): number {
  if (!(r > 0) || !(H > 0)) {
    throw new Error("Annuity factor requires positive discount rate and horizon.");
  }
  return (1 - Math.pow(1 + r, -H)) / r;
}

/** b = a * L_rep / PV — V4 cell 10 calibrate_b. */
export function calibrateB(
  a: number,
  L_rep_M: number,
  R_per_year: number,
  r: number,
  H: number,
): number {
  const af = annuityFactor(r, H);
  const pv = R_per_year * af;
  if (!(pv > 0)) {
    throw new Error(
      `Present value per $1M invested is non-positive (PV=${pv}); cannot calibrate b.`,
    );
  }
  return (a * L_rep_M) / pv;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Recompute representative losses and base (a,b) from scaled clusters.
 * Ports V4 cells 11–12.
 */
export function calibrateSources(
  clusters: ClusterInput[],
  assumptions: SourceAssumption[],
): CalibratedSource[] {
  const bySource = new Map<string, number[]>();
  for (const c of clusters) {
    const list = bySource.get(c.source) ?? [];
    list.push(c.loss_M);
    bySource.set(c.source, list);
  }

  const allLosses = clusters.map((c) => c.loss_M);
  const fallback = median(allLosses);

  return assumptions.map((assump) => {
    const losses = bySource.get(assump.source) ?? [];
    const L_rep_M = losses.length ? median(losses) : fallback;
    const af = annuityFactor(assump.discount_rate, assump.planning_horizon_years);
    const b_M = calibrateB(
      assump.max_avoidable_fraction_a,
      L_rep_M,
      assump.annual_avoided_loss_per_1M_invested_M,
      assump.discount_rate,
      assump.planning_horizon_years,
    );
    return {
      source: assump.source,
      source_label: assump.source_label,
      L_rep_M,
      a: assump.max_avoidable_fraction_a,
      annual_avoided_loss_per_1M_invested_M:
        assump.annual_avoided_loss_per_1M_invested_M,
      planning_horizon_years: assump.planning_horizon_years,
      discount_rate: assump.discount_rate,
      annuity_factor: af,
      b_M,
    };
  });
}

export function reconciliationStatus(
  clusters: ClusterInput[],
  totalLoss_B: number,
  tol = 1e-12,
): { ok: boolean; sum_B: number; drift_B: number } {
  const sum_B = clusters.reduce((s, c) => s + c.loss_B, 0);
  const drift_B = sum_B - totalLoss_B;
  return {
    ok: Math.abs(drift_B) <= tol * Math.max(1, Math.abs(totalLoss_B)),
    sum_B,
    drift_B,
  };
}

export function publishedTotal_B(clusters: CanonicalClusterRow[]): number {
  return clusters.reduce((s, c) => s + c.baseline_loss_B, 0);
}

export function toDisplayLoss_B(loss_M: number): number {
  return millionToBillion(loss_M);
}
