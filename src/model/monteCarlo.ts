/**
 * Seeded Monte Carlo sensitivity. Ports V4 cell 35.
 * Uses a deterministic PRNG (Mulberry32 + Box–Muller). Does not reproduce
 * NumPy trial-for-trial; must be repeatable in-browser and statistically
 * consistent with the frozen V4 experiment.
 */

import { solve, toSolveInputs } from "./solver";
import type {
  ClusterSolveInput,
  MetricSummary,
  MonteCarloTrial,
  SourceShareSummary,
} from "./types";
import { SOURCE_ORDER } from "./types";

export interface MonteCarloSettings {
  trials: number;
  seed: number;
  aStd: number;
  bStd: number;
  lossStd: number;
  aClip: [number, number];
  bMin_M: number;
  lossMultMin: number;
  budget_M: number;
}

export const DEFAULT_MC_SETTINGS: Omit<MonteCarloSettings, "budget_M"> = {
  trials: 300,
  seed: 42,
  aStd: 0.1,
  bStd: 0.2,
  lossStd: 0.15,
  aClip: [0.05, 0.95],
  bMin_M: 1e-6,
  lossMultMin: 0.1,
};

/** Mulberry32 — small deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller normal(mean, std) from a [0,1) PRNG. */
export function normalFromUniform(
  rand: () => number,
  mean: number,
  std: number,
): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + std * z;
}

export interface MonteCarloProgress {
  completed: number;
  total: number;
  trials: MonteCarloTrial[];
}

export async function runMonteCarlo(
  baseClusters: ClusterSolveInput[],
  settings: MonteCarloSettings,
  onProgress?: (p: MonteCarloProgress) => void,
  shouldCancel?: () => boolean,
  yieldEvery = 25,
): Promise<MonteCarloTrial[]> {
  const rand = mulberry32(settings.seed);
  const trials: MonteCarloTrial[] = [];

  // Stable unique sources from base
  const sources = [...new Set(baseClusters.map((c) => c.source))];
  const centerA = new Map(sources.map((s) => {
    const c = baseClusters.find((x) => x.source === s)!;
    return [s, c.a] as const;
  }));
  const centerB = new Map(sources.map((s) => {
    const c = baseClusters.find((x) => x.source === s)!;
    return [s, c.b] as const;
  }));

  for (let i = 0; i < settings.trials; i++) {
    if (shouldCancel?.()) break;

    const shockedA = new Map<string, number>();
    const shockedB = new Map<string, number>();
    for (const s of sources) {
      const aMult = normalFromUniform(rand, 1, settings.aStd);
      const bMult = normalFromUniform(rand, 1, settings.bStd);
      const a0 = centerA.get(s)!;
      const b0 = centerB.get(s)!;
      shockedA.set(
        s,
        clamp(a0 * aMult, settings.aClip[0], settings.aClip[1]),
      );
      shockedB.set(s, Math.max(b0 * bMult, settings.bMin_M));
    }

    const shocked: ClusterSolveInput[] = baseClusters.map((c) => {
      const Lmult = Math.max(
        normalFromUniform(rand, 1, settings.lossStd),
        settings.lossMultMin,
      );
      return {
        ...c,
        L: c.L * Lmult,
        a: shockedA.get(c.source)!,
        b: shockedB.get(c.source)!,
      };
    });

    const result = solve(shocked, settings.budget_M);
    const sourceTotals = new Map<string, number>();
    for (const a of result.allocations) {
      sourceTotals.set(
        a.source,
        (sourceTotals.get(a.source) ?? 0) + a.allocation_M,
      );
    }
    const sumM = [...sourceTotals.values()].reduce((s, v) => s + v, 0);
    const source_shares: Record<string, number> = {};
    for (const s of SOURCE_ORDER) {
      source_shares[s] =
        sumM > 0 ? ((sourceTotals.get(s) ?? 0) / sumM) * 100 : 0;
    }
    for (const [s, v] of sourceTotals) {
      if (!(s in source_shares)) {
        source_shares[s] = sumM > 0 ? (v / sumM) * 100 : 0;
      }
    }

    trials.push({
      trial: i,
      baseline_loss_B: result.baseline_loss_B,
      residual_loss_B: result.residual_loss_B,
      avoided_loss_B: result.avoided_loss_B,
      ratio: result.ratio,
      source_shares,
    });

    if (onProgress && ((i + 1) % yieldEvery === 0 || i + 1 === settings.trials)) {
      onProgress({ completed: i + 1, total: settings.trials, trials: [...trials] });
      await yieldToBrowser();
    }
  }

  return trials;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function summarizeMetric(
  values: number[],
  metric: string,
  includeShareAboveOne = false,
): MetricSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n ? values.reduce((s, v) => s + v, 0) / n : NaN;
  const variance =
    n > 1
      ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
      : 0;
  const std = Math.sqrt(variance);
  return {
    metric,
    count: n,
    mean,
    std,
    min: n ? sorted[0] : NaN,
    p5: percentile(sorted, 5),
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: n ? sorted[n - 1] : NaN,
    share_above_one: includeShareAboveOne
      ? (n ? (values.filter((v) => v > 1).length / n) * 100 : null)
      : null,
  };
}

export function summarizeSourceShares(
  trials: MonteCarloTrial[],
): SourceShareSummary[] {
  return SOURCE_ORDER.map((source) => {
    const values = trials.map((t) => t.source_shares[source] ?? 0);
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = n ? values.reduce((s, v) => s + v, 0) / n : NaN;
    const variance =
      n > 1
        ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
        : 0;
    return {
      source,
      mean,
      std: Math.sqrt(variance),
      p25: percentile(sorted, 25),
      median: percentile(sorted, 50),
      p75: percentile(sorted, 75),
    };
  });
}

/** Linear interpolation percentile on a sorted array (numpy-like default). */
export function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const w = rank - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function buildMcSolveInputs(
  clusters: {
    cluster: string;
    source: string;
    loss_M: number;
    latitude: number;
    longitude: number;
  }[],
  scenarioParams: Map<string, { a: number; b_M: number }>,
): ClusterSolveInput[] {
  return toSolveInputs(clusters, scenarioParams);
}
