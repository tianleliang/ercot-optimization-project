import { describe, expect, it } from "vitest";
import canonical from "../src/data/canonical.json";
import {
  calibrateSources,
  prepareClusterInputs,
  reconciliationStatus,
  validateVisitorInputs,
} from "../src/model/calibration";
import { applyScenarioScaling } from "../src/model/scenarios";
import { budgetBToM, toSolveInputs } from "../src/model/solver";
import { runAllFrontiers, selectAllThresholds } from "../src/model/frontier";
import {
  aggregateBySource,
  moderateCompareCapLabel,
} from "../src/model/aggregation";
import {
  DEFAULT_MC_SETTINGS,
  mulberry32,
  runMonteCarlo,
  summarizeMetric,
} from "../src/model/monteCarlo";
import {
  defaultPublishedWeights,
  publishedClustersFromCanonical,
  runDeterministicPipeline,
  resetInputs,
} from "../src/model/pipeline";
import {
  cloneWeights,
  normalizeDistribution,
  prepareClusterInputsFromDistribution,
  publishedWeightsFromClusters,
  resetSourceWeights,
} from "../src/model/distribution";
import { scenarioParamsMap } from "../src/model/scenarios";
import type { CanonicalData } from "../src/model/pipeline";
import type { VisitorInputs } from "../src/model/types";
import { MODERATE_COMPARE_CAPS_B, SOURCE_ORDER } from "../src/model/types";

const data = canonical as unknown as CanonicalData & typeof canonical;

const ALLOC_TOL_M = 0.001;
const B_TOL = 1e-6;
const SHARE_TOL = 1e-6;

function publishedCase(overrides: Partial<VisitorInputs> = {}): VisitorInputs {
  return { ...resetInputs(data), ...overrides };
}

describe("input validation and scaling", () => {
  it("rejects non-positive total loss and negative budget", () => {
    expect(
      validateVisitorInputs(publishedCase({ totalLoss_B: 0 })),
    ).toHaveLength(1);
    expect(
      validateVisitorInputs(publishedCase({ budget_B: -1 })),
    ).toHaveLength(1);
  });

  it("scales clusters to visitor total with exact reconciliation", () => {
    const published = publishedClustersFromCanonical(data);
    const clusters = prepareClusterInputs(published, 50);
    const recon = reconciliationStatus(clusters, 50);
    expect(recon.ok).toBe(true);
    expect(Math.abs(recon.sum_B - 50)).toBeLessThan(1e-12);
  });

  it("reset reconstructs published defaults", () => {
    const r = resetInputs(data);
    expect(r.totalLoss_B).toBe(43.1);
    expect(r.budget_B).toBe(5);
    expect(r.scenario).toBe("Moderate");
    expect(r.distributionMode).toBe("published");
    const pub = defaultPublishedWeights(data);
    expect(r.distribution.sourceWeights).toEqual(pub.sourceWeights);
    expect(r.distribution.clusterWeights).toEqual(pub.clusterWeights);
  });
});

describe("calibration golden (published 43.1B)", () => {
  it("matches median L_rep and derived b for all sources", () => {
    const published = publishedClustersFromCanonical(data);
    const clusters = prepareClusterInputs(published, 43.1);
    const calibrated = calibrateSources(
      clusters,
      data.inputs.source_assumptions,
    );

    for (const assump of data.inputs.source_assumptions) {
      const got = calibrated.find((c) => c.source === assump.source)!;
      expect(got.L_rep_M).toBeCloseTo(
        assump.representative_cluster_loss_M!,
        6,
      );
      expect(got.b_M).toBeCloseTo(
        assump.derived_diminishing_return_scale_b_M!,
        6,
      );
      expect(got.annuity_factor).toBeCloseTo(assump.annuity_factor!, 9);
    }
  });

  it("scenario scaling matches canonical realized a,b", () => {
    const published = publishedClustersFromCanonical(data);
    const clusters = prepareClusterInputs(published, 43.1);
    const calibrated = calibrateSources(
      clusters,
      data.inputs.source_assumptions,
    );

    for (const row of data.inputs.scenario_parameters) {
      const scaled = applyScenarioScaling(
        calibrated,
        row.scenario as "Pessimistic" | "Moderate" | "Optimistic",
      ).find((s) => s.source === row.source)!;
      expect(scaled.a).toBeCloseTo(row.realized_a, 12);
      expect(scaled.b_M).toBeCloseTo(row.realized_b_M, 9);
    }
  });
});

describe("solver feasibility", () => {
  it("allocations nonnegative and sum to budget; avoided+residual=baseline", () => {
    const { result, errors } = runDeterministicPipeline(
      data,
      publishedCase(),
    );
    expect(errors).toHaveLength(0);
    expect(result).not.toBeNull();
    const d = result!.detailed;
    for (const a of d.allocations) {
      expect(a.allocation_M).toBeGreaterThanOrEqual(-1e-12);
    }
    const sumX = d.allocations.reduce((s, a) => s + a.allocation_M, 0);
    expect(Math.abs(sumX - d.budget_M)).toBeLessThan(1e-6);
    expect(
      Math.abs(d.avoided_loss_M + d.residual_loss_M - d.baseline_loss_M),
    ).toBeLessThan(1e-6);
  });

  it("zero budget returns zero allocations", () => {
    const { result } = runDeterministicPipeline(
      data,
      publishedCase({ budget_B: 0 }),
    );
    expect(result!.detailed.allocations.every((a) => a.allocation_M === 0)).toBe(
      true,
    );
    expect(result!.detailed.avoided_loss_M).toBe(0);
  });
});

describe("golden deterministic published case", () => {
  const pipeline = runDeterministicPipeline(data, publishedCase());

  it("runs without errors", () => {
    expect(pipeline.errors).toHaveLength(0);
    expect(pipeline.result).not.toBeNull();
  });

  it("matches all 60 frontier rows", () => {
    const frontiers = pipeline.result!.frontiers;
    expect(frontiers).toHaveLength(60);
    const golden = data.experiments.budget_frontiers;
    expect(golden).toHaveLength(60);

    for (let i = 0; i < 60; i++) {
      const g = golden[i];
      const got = frontiers.find(
        (r) =>
          r.scenario === g.scenario &&
          Math.abs(r.budget_amount - g.budget_amount) < 1,
      );
      expect(got, `missing frontier ${g.scenario} ${g.budget_amount}`).toBeTruthy();
      expect(got!.avoided_amount / 1e9).toBeCloseTo(g.avoided_amount / 1e9, 5);
      expect(got!.residual_amount / 1e9).toBeCloseTo(g.residual_amount / 1e9, 5);
      expect(got!.ROI).toBeCloseTo(g.ROI, 5);
      if (g.mROI == null) {
        expect(got!.mROI).toBeNull();
      } else {
        expect(got!.mROI!).toBeCloseTo(g.mROI, 5);
      }
    }
  });

  it("matches three threshold-selected budgets", () => {
    const thresholds = pipeline.result!.thresholds;
    for (const g of data.experiments.threshold_selected_budgets) {
      const got = thresholds.find((t) => t.scenario === g.scenario)!;
      expect(got.selected_budget_B).toBeCloseTo(g.selected_budget_B, 9);
      expect(got.avoided_loss_B).toBeCloseTo(g.avoided_loss_B, 5);
      expect(got.ratio).toBeCloseTo(g.ROI_avoided_loss_over_budget, 5);
      if (g.marginal_ROI == null) {
        expect(got.is_fallback).toBe(true);
      } else {
        expect(got.marginal_ratio!).toBeCloseTo(g.marginal_ROI, 5);
      }
    }
  });

  it("matches Moderate $1B/$5B/$10B source allocations", () => {
    const rows = pipeline.result!.moderateSourceAllocations;
    for (const g of data.experiments.budget_source_allocations) {
      const got = rows.find(
        (r) =>
          r.source === g.source &&
          r.cap_bin === g.cap_bin &&
          r.scenario === g.scenario,
      );
      expect(got, `${g.cap_bin} ${g.source}`).toBeTruthy();
      expect(Math.abs(got!.allocation_M - g.allocation_M)).toBeLessThan(
        ALLOC_TOL_M,
      );
      expect(Math.abs(got!.share_pct - g.share_pct)).toBeLessThan(
        SHARE_TOL * 100 + 1e-4,
      );
    }
  });

  it("matches Moderate $5B reference summary and 18 cluster allocations", () => {
    const d = pipeline.result!.detailed;
    const ref = data.experiments.reference_case;
    expect(d.avoided_loss_B).toBeCloseTo(ref.avoided_loss_B, 5);
    expect(d.residual_loss_B).toBeCloseTo(ref.residual_loss_B, 5);
    expect(d.ratio).toBeCloseTo(ref.ROI_avoided_loss_over_budget, 5);

    expect(d.allocations).toHaveLength(18);
    for (const g of ref.cluster_allocations) {
      const got = d.allocations.find((a) => a.cluster === g.cluster)!;
      expect(Math.abs(got.allocation_M - g.allocation_M)).toBeLessThan(
        ALLOC_TOL_M,
      );
      expect(Math.abs(got.share_pct - g.share_pct)).toBeLessThan(1e-4);
      expect(got.loss_B).toBeCloseTo(g.baseline_loss_B, 9);
    }
  });

  it("matches ten geographic cells", () => {
    const cells = pipeline.result!.geographic;
    expect(cells).toHaveLength(10);
    for (const g of data.experiments.reference_case.geospatial_cells) {
      const got = cells.find((c) => c.lat === g.lat && c.lon === g.lon)!;
      expect(Math.abs(got.baseline_loss_B - g.baseline_loss_B)).toBeLessThan(
        B_TOL,
      );
      expect(Math.abs(got.allocation_B - g.allocation_B)).toBeLessThan(B_TOL);
      expect(got.allocation_share_pct).toBeCloseTo(g.allocation_share_pct, 4);
      expect(got.upstream_risk_rank).toBe(g.upstream_risk_rank);
    }
  });

  it("source and geographic aggregations reconcile to clusters", () => {
    const d = pipeline.result!.detailed;
    const src = aggregateBySource(
      d.allocations,
      "Moderate",
      5,
      moderateCompareCapLabel(5),
    );
    const sumSrc = src.reduce((s, r) => s + r.allocation_M, 0);
    const sumCl = d.allocations.reduce((s, a) => s + a.allocation_M, 0);
    expect(Math.abs(sumSrc - sumCl)).toBeLessThan(1e-9);

    const geo = pipeline.result!.geographic;
    const sumGeo = geo.reduce((s, c) => s + c.allocation_B, 0);
    expect(Math.abs(sumGeo - d.budget_B)).toBeLessThan(B_TOL);
  });
});

describe("V2 custom distribution", () => {
  it("normalizes source and within-source weights to 100%", () => {
    const published = publishedClustersFromCanonical(data);
    const weights = publishedWeightsFromClusters(published);
    weights.sourceWeights.coal = 2;
    weights.sourceWeights.natural_gas = 2;
    for (const s of SOURCE_ORDER) {
      if (s !== "coal" && s !== "natural_gas") weights.sourceWeights[s] = 0;
    }
    const n = normalizeDistribution(published, weights);
    expect(
      Math.abs(
        Object.values(n.sourceWeightsNorm).reduce((a, b) => a + b, 0) - 1,
      ),
    ).toBeLessThan(1e-12);
    expect(n.sourceWeightsNorm.coal).toBeCloseTo(0.5, 12);
    expect(n.sourceWeightsNorm.natural_gas).toBeCloseTo(0.5, 12);
  });

  it("resolves all-zero within-source cluster weights when source > 0", () => {
    const published = publishedClustersFromCanonical(data);
    const weights = publishedWeightsFromClusters(published);
    for (const c of published.filter((x) => x.source === "wind")) {
      weights.clusterWeights[c.cluster] = 0;
    }
    const n = normalizeDistribution(published, weights);
    const windClusters = published.filter((c) => c.source === "wind");
    const sumWithin = windClusters.reduce(
      (s, c) => s + (n.clusterWeightsWithinSourceNorm[c.cluster] ?? 0),
      0,
    );
    expect(sumWithin).toBeCloseTo(1, 12);
  });

  it("supports one source at zero weight", () => {
    const published = publishedClustersFromCanonical(data);
    const weights = publishedWeightsFromClusters(published);
    weights.sourceWeights.petroleum = 0;
    const { clusters } = prepareClusterInputsFromDistribution(
      published,
      43.1,
      weights,
    );
    expect(
      clusters
        .filter((c) => c.source === "petroleum")
        .every((c) => Math.abs(c.loss_B) < 1e-12),
    ).toBe(true);
    expect(reconciliationStatus(clusters, 43.1).ok).toBe(true);
  });

  it("supports one cluster holding all weight within a source", () => {
    const published = publishedClustersFromCanonical(data);
    const weights = publishedWeightsFromClusters(published);
    const wind = published.filter((c) => c.source === "wind");
    for (const c of wind) weights.clusterWeights[c.cluster] = 0;
    weights.clusterWeights[wind[0].cluster] = 1;
    const { clusters, normalized } = prepareClusterInputsFromDistribution(
      published,
      43.1,
      weights,
    );
    expect(normalized.clusterWeightsWithinSourceNorm[wind[0].cluster]).toBeCloseTo(
      1,
      12,
    );
    const windLoss = clusters
      .filter((c) => c.source === "wind")
      .reduce((s, c) => s + c.loss_B, 0);
    expect(clusters.find((c) => c.cluster === wind[0].cluster)!.loss_B).toBeCloseTo(
      windLoss,
      10,
    );
  });

  it("highly concentrated distribution reconciles and recalibrates b", () => {
    const published = publishedClustersFromCanonical(data);
    const weights = publishedWeightsFromClusters(published);
    for (const s of SOURCE_ORDER) weights.sourceWeights[s] = 0;
    weights.sourceWeights.natural_gas = 1;
    // Keep published within-source relatives for NG so L_rep stays positive.

    const visitor = publishedCase({
      distributionMode: "custom",
      distribution: weights,
    });
    const { result, errors } = runDeterministicPipeline(data, visitor);
    expect(errors).toHaveLength(0);
    expect(result!.reconciliation.ok).toBe(true);
    const ngLoss = result!.clusters
      .filter((c) => c.source === "natural_gas")
      .reduce((s, c) => s + c.loss_B, 0);
    expect(ngLoss).toBeCloseTo(43.1, 8);
    expect(
      result!.clusters
        .filter((c) => c.source !== "natural_gas")
        .every((c) => Math.abs(c.loss_B) < 1e-9),
    ).toBe(true);

    const cal = result!.calibrated.find((c) => c.source === "natural_gas")!;
    expect(cal.L_rep_M).toBeGreaterThan(0);
    expect(cal.b_M).toBeGreaterThan(0);
    const publishedB = data.inputs.source_assumptions.find(
      (s) => s.source === "natural_gas",
    )!.derived_diminishing_return_scale_b_M!;
    expect(Math.abs(cal.b_M - publishedB)).toBeGreaterThan(1);
    expect(result!.detailed.budget_B).toBe(5);
    const sumAlloc = result!.detailed.allocations.reduce(
      (s, a) => s + a.allocation_M,
      0,
    );
    expect(Math.abs(sumAlloc - 5000)).toBeLessThan(1e-4);
  });

  it("reset source restores published within-source relatives", () => {
    const published = publishedClustersFromCanonical(data);
    const pub = publishedWeightsFromClusters(published);
    let w = cloneWeights(pub);
    w.sourceWeights.coal = 99;
    for (const c of published.filter((x) => x.source === "coal")) {
      w.clusterWeights[c.cluster] = 0;
    }
    w = resetSourceWeights(published, w, "coal");
    expect(w.sourceWeights.coal).toBe(pub.sourceWeights.coal);
    for (const c of published.filter((x) => x.source === "coal")) {
      expect(w.clusterWeights[c.cluster]).toBe(pub.clusterWeights[c.cluster]);
    }
  });

  it("custom published-equivalent weights match golden Moderate $5B", () => {
    const pub = defaultPublishedWeights(data);
    const { result } = runDeterministicPipeline(
      data,
      publishedCase({
        distributionMode: "custom",
        distribution: pub,
      }),
    );
    const ref = data.experiments.reference_case;
    expect(result!.detailed.avoided_loss_B).toBeCloseTo(ref.avoided_loss_B, 5);
    for (const g of ref.cluster_allocations) {
      const got = result!.detailed.allocations.find(
        (a) => a.cluster === g.cluster,
      )!;
      expect(Math.abs(got.allocation_M - g.allocation_M)).toBeLessThan(
        ALLOC_TOL_M,
      );
    }
  });
});

describe("seeded Monte Carlo", () => {
  it("is repeatable with the same seed", async () => {
    const { result } = runDeterministicPipeline(data, publishedCase());
    const map = scenarioParamsMap(
      applyScenarioScaling(result!.calibrated, "Moderate"),
    );
    const base = toSolveInputs(result!.clusters, map);
    const settings = {
      ...DEFAULT_MC_SETTINGS,
      trials: 40,
      seed: 42,
      budget_M: budgetBToM(5),
    };
    const a = await runMonteCarlo(base, settings);
    const b = await runMonteCarlo(base, settings);
    expect(a.map((t) => t.avoided_loss_B)).toEqual(
      b.map((t) => t.avoided_loss_B),
    );
  });

  it("PRNG itself is deterministic", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    const seq1 = Array.from({ length: 5 }, () => r1());
    const seq2 = Array.from({ length: 5 }, () => r2());
    expect(seq1).toEqual(seq2);
  });

  it("published-case MC summary is statistically near frozen V4", async () => {
    const { result } = runDeterministicPipeline(data, publishedCase());
    const map = scenarioParamsMap(
      applyScenarioScaling(result!.calibrated, "Moderate"),
    );
    const base = toSolveInputs(result!.clusters, map);
    const trials = await runMonteCarlo(base, {
      ...DEFAULT_MC_SETTINGS,
      seed: data.metadata.monte_carlo_seed,
      trials: data.metadata.monte_carlo_trials,
      budget_M: budgetBToM(5),
    });
    expect(trials).toHaveLength(300);
    const avoided = summarizeMetric(
      trials.map((t) => t.avoided_loss_B),
      "avoided_loss_B",
    );
    const gold = data.experiments.monte_carlo.metric_summary.find(
      (m) => m.metric === "avoided_loss_B",
    )!;
    expect(Math.abs(avoided.median - gold["50%"])).toBeLessThan(1.5);
    expect(Math.abs(avoided.mean - gold.mean)).toBeLessThan(1.5);
    expect(avoided.p5).toBeGreaterThan(5);
    expect(avoided.p95).toBeLessThan(20);
  }, 60_000);
});

describe("frontier helper smoke", () => {
  it("builds 60 rows via runAllFrontiers", () => {
    const published = publishedClustersFromCanonical(data);
    const clusters = prepareClusterInputs(published, 43.1);
    const calibrated = calibrateSources(
      clusters,
      data.inputs.source_assumptions,
    );
    const frontiers = runAllFrontiers(clusters, calibrated);
    const thresholds = selectAllThresholds(frontiers);
    expect(frontiers).toHaveLength(60);
    expect(thresholds).toHaveLength(3);
    expect(MODERATE_COMPARE_CAPS_B).toEqual([1, 5, 10]);
  });
});
