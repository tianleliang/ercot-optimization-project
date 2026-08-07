/**
 * Exact KKT / bisection solver for the separable convex residual-loss model.
 * Replaces AMPL+SNOPT (V4 cell 9 solve) with the closed-form allocation rule.
 *
 * x_i(λ) = max(0, sqrt(L_i a_i b_i / λ) - b_i)
 * Find λ > 0 such that Σ x_i(λ) = B.
 */

import type { ClusterAllocation, ClusterSolveInput, SolveResult } from "./types";
import {
  billionToMillion,
  clampTinyNegative,
  millionToBillion,
} from "./units";

const MAX_ITERS = 80;

export function avoidedLossForCluster(
  L: number,
  a: number,
  b: number,
  x: number,
): number {
  if (!(L > 0) || !(a > 0) || !(b > 0) || !(x > 0)) return 0;
  return L * ((a * x) / (x + b));
}

/** Marginal benefit at x=0: L*a/b (λ upper bracket). */
export function zeroInvestmentMarginal(L: number, a: number, b: number): number {
  if (!(b > 0)) return 0;
  return (L * a) / b;
}

export function allocationAtLambda(
  clusters: ClusterSolveInput[],
  lambda: number,
): number[] {
  return clusters.map(({ L, a, b }) => {
    if (!(lambda > 0) || !(L > 0) || !(a > 0) || !(b > 0)) return 0;
    const raw = Math.sqrt((L * a * b) / lambda) - b;
    return clampTinyNegative(Math.max(0, raw));
  });
}

function sum(xs: number[]): number {
  let s = 0;
  for (const v of xs) s += v;
  return s;
}

function buildAllocations(
  clusters: ClusterSolveInput[],
  xs: number[],
): ClusterAllocation[] {
  const totalX = sum(xs);
  return clusters.map((c, i) => {
    const allocation_M = clampTinyNegative(xs[i] ?? 0);
    return {
      cluster: c.cluster,
      source: c.source,
      loss_M: c.L,
      loss_B: millionToBillion(c.L),
      allocation_M,
      allocation_B: millionToBillion(allocation_M),
      share_pct: totalX > 0 ? (allocation_M / totalX) * 100 : 0,
      latitude: c.latitude,
      longitude: c.longitude,
    };
  });
}

function evaluate(
  clusters: ClusterSolveInput[],
  budget_M: number,
  xs: number[],
  lambda: number | null,
  iterations: number,
): SolveResult {
  const allocations = buildAllocations(clusters, xs);
  const baseline_loss_M = sum(clusters.map((c) => c.L));
  let avoided_loss_M = 0;
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    avoided_loss_M += avoidedLossForCluster(c.L, c.a, c.b, xs[i] ?? 0);
  }
  avoided_loss_M = clampTinyNegative(avoided_loss_M);
  const residual_loss_M = clampTinyNegative(baseline_loss_M - avoided_loss_M);
  return {
    budget_M,
    budget_B: millionToBillion(budget_M),
    baseline_loss_M,
    baseline_loss_B: millionToBillion(baseline_loss_M),
    residual_loss_M,
    residual_loss_B: millionToBillion(residual_loss_M),
    avoided_loss_M,
    avoided_loss_B: millionToBillion(avoided_loss_M),
    ratio: budget_M > 0 ? avoided_loss_M / budget_M : NaN,
    allocations,
    lambda,
    iterations,
  };
}

/**
 * Solve min Σ residual subject to Σ x ≤ budget_M.
 * Returns all-zero allocations when budget is zero.
 */
export function solve(
  clusters: ClusterSolveInput[],
  budget_M: number,
): SolveResult {
  const zeros = clusters.map(() => 0);
  if (!(budget_M > 0) || clusters.length === 0) {
    return evaluate(clusters, Math.max(0, budget_M), zeros, null, 0);
  }

  let lambdaHi = 0;
  for (const c of clusters) {
    const m = zeroInvestmentMarginal(c.L, c.a, c.b);
    if (m > lambdaHi) lambdaHi = m;
  }
  if (!(lambdaHi > 0)) {
    return evaluate(clusters, budget_M, zeros, null, 0);
  }

  // Positive lower bracket whose allocation sum is at least the budget.
  let lambdaLo = lambdaHi;
  let sumLo = sum(allocationAtLambda(clusters, lambdaLo));
  let guard = 0;
  while (sumLo < budget_M && guard < 60) {
    lambdaLo /= 2;
    if (!(lambdaLo > 0)) break;
    sumLo = sum(allocationAtLambda(clusters, lambdaLo));
    guard += 1;
  }

  // Saturation: cannot spend full budget even as λ→0.
  if (!(sumLo >= budget_M) || !(lambdaLo > 0)) {
    const xs = allocationAtLambda(clusters, Math.max(lambdaLo, Number.MIN_VALUE));
    return evaluate(clusters, budget_M, xs, lambdaLo, guard);
  }

  const tol = 1e-9 * Math.max(1, budget_M);
  let lo = lambdaLo;
  let hi = lambdaHi;
  let mid = lo;
  let xs = allocationAtLambda(clusters, mid);
  let iters = 0;

  for (; iters < MAX_ITERS; iters++) {
    mid = 0.5 * (lo + hi);
    if (!(mid > 0)) break;
    xs = allocationAtLambda(clusters, mid);
    const s = sum(xs);
    if (Math.abs(s - budget_M) <= tol) break;
    if (s > budget_M) lo = mid;
    else hi = mid;
  }

  let finalXs = xs;
  const s = sum(finalXs);
  if (s > 0 && Math.abs(s - budget_M) / Math.max(1, budget_M) < 1e-6) {
    const factor = budget_M / s;
    finalXs = finalXs.map((x) => clampTinyNegative(x * factor));
  }

  return evaluate(clusters, budget_M, finalXs, mid, iters);
}

export function toSolveInputs(
  clusters: {
    cluster: string;
    source: string;
    loss_M: number;
    latitude: number;
    longitude: number;
  }[],
  scenarioParams: Map<string, { a: number; b_M: number }>,
): ClusterSolveInput[] {
  return clusters.map((c) => {
    const p = scenarioParams.get(c.source);
    if (!p) {
      throw new Error(`Missing scenario parameters for source ${c.source}`);
    }
    return {
      cluster: c.cluster,
      source: c.source,
      L: c.loss_M,
      a: p.a,
      b: p.b_M,
      latitude: c.latitude,
      longitude: c.longitude,
    };
  });
}

export function budgetBToM(budget_B: number): number {
  return billionToMillion(budget_B);
}
