/**
 * Full analysis pipeline orchestration (stages 1–8).
 */

import {
  calibrateSources,
  prepareClusterInputs,
  reconciliationStatus,
  validateVisitorInputs,
  type CanonicalClusterRow,
} from "./calibration";
import {
  cloneWeights,
  prepareClusterInputsFromDistribution,
  publishedWeightsFromClusters,
  snapshotDistribution,
  type DistributionSnapshot,
} from "./distribution";
import {
  aggregateBySource,
  aggregateGeographic,
  moderateCompareCapLabel,
} from "./aggregation";
import { runAllFrontiers, selectAllThresholds } from "./frontier";
import {
  DEFAULT_MC_SETTINGS,
  runMonteCarlo,
  summarizeMetric,
  summarizeSourceShares,
  type MonteCarloProgress,
} from "./monteCarlo";
import { applyScenarioScaling, allScenarioParams, scenarioParamsMap } from "./scenarios";
import { budgetBToM, solve, toSolveInputs } from "./solver";
import type {
  CalibratedSource,
  ClusterInput,
  DistributionWeights,
  FrontierRow,
  GeographicCell,
  MetricSummary,
  MonteCarloTrial,
  ScenarioName,
  ScenarioSourceParams,
  SolveResult,
  SourceAllocationRow,
  SourceAssumption,
  SourceShareSummary,
  ThresholdSelection,
  ValidationError,
  VisitorInputs,
} from "./types";
import { MODERATE_COMPARE_CAPS_B } from "./types";

export interface CanonicalData {
  inputs: {
    cluster_losses: Array<{
      cluster: string;
      source: string;
      source_label: string;
      latitude: number;
      longitude: number;
      baseline_loss_B: number;
    }>;
    source_assumptions: SourceAssumption[];
  };
  upstream_research_context: {
    geographic_risk_ranks: { lat: number; lon: number; risk_rank: number }[];
  };
  metadata: {
    monte_carlo_seed: number;
    monte_carlo_trials: number;
  };
}

export interface DeterministicPipelineResult {
  inputs: VisitorInputs;
  clusters: ClusterInput[];
  reconciliation: { ok: boolean; sum_B: number; drift_B: number };
  calibrated: CalibratedSource[];
  scenarioParams: Record<ScenarioName, ScenarioSourceParams[]>;
  frontiers: FrontierRow[];
  thresholds: ThresholdSelection[];
  moderateSourceAllocations: SourceAllocationRow[];
  detailed: SolveResult;
  geographic: GeographicCell[];
  budgetWarning: string | null;
  distribution: DistributionSnapshot;
}

export interface FullPipelineResult extends DeterministicPipelineResult {
  monteCarlo: {
    trials: MonteCarloTrial[];
    avoidedSummary: MetricSummary;
    ratioSummary: MetricSummary;
    sourceShareSummary: SourceShareSummary[];
  };
}

export function publishedClustersFromCanonical(
  data: CanonicalData,
): CanonicalClusterRow[] {
  return data.inputs.cluster_losses.map((c) => ({
    cluster: c.cluster,
    source: c.source,
    source_label: c.source_label,
    latitude: c.latitude,
    longitude: c.longitude,
    baseline_loss_B: c.baseline_loss_B,
  }));
}

export function defaultPublishedWeights(
  data: CanonicalData,
): DistributionWeights {
  return publishedWeightsFromClusters(publishedClustersFromCanonical(data));
}

export function resetInputs(data: CanonicalData): VisitorInputs {
  return {
    totalLoss_B: 43.1,
    budget_B: 5.0,
    scenario: "Moderate",
    distributionMode: "published",
    distribution: cloneWeights(defaultPublishedWeights(data)),
  };
}

function resolveWeights(
  data: CanonicalData,
  visitor: VisitorInputs,
): DistributionWeights {
  const published = defaultPublishedWeights(data);
  if (visitor.distributionMode === "published") {
    return published;
  }
  return {
    sourceWeights: {
      ...published.sourceWeights,
      ...visitor.distribution.sourceWeights,
    },
    clusterWeights: {
      ...published.clusterWeights,
      ...visitor.distribution.clusterWeights,
    },
  };
}

export function runDeterministicPipeline(
  data: CanonicalData,
  visitor: VisitorInputs,
): { errors: ValidationError[]; result: DeterministicPipelineResult | null } {
  const errors = validateVisitorInputs(visitor);
  if (errors.length) return { errors, result: null };

  const published = publishedClustersFromCanonical(data);
  const weights = resolveWeights(data, visitor);

  let clusters: ClusterInput[];
  let distribution: DistributionSnapshot;

  if (visitor.distributionMode === "published") {
    clusters = prepareClusterInputs(published, visitor.totalLoss_B);
    distribution = snapshotDistribution(
      "published",
      published,
      visitor.totalLoss_B,
      weights,
    );
  } else {
    const prepared = prepareClusterInputsFromDistribution(
      published,
      visitor.totalLoss_B,
      weights,
    );
    clusters = prepared.clusters;
    distribution = {
      mode: "custom",
      ...prepared.normalized,
      clusterLosses_B: Object.fromEntries(
        clusters.map((c) => [c.cluster, c.loss_B]),
      ),
    };
  }

  const reconciliation = reconciliationStatus(clusters, visitor.totalLoss_B);
  // V4 behavior: recompute L_rep median and b whenever cluster losses change.
  const calibrated = calibrateSources(clusters, data.inputs.source_assumptions);
  const scenarioParams = allScenarioParams(calibrated);

  const frontiers = runAllFrontiers(clusters, calibrated);
  const thresholds = selectAllThresholds(frontiers);

  const moderateParams = scenarioParamsMap(
    applyScenarioScaling(calibrated, "Moderate"),
  );
  const moderateInputs = toSolveInputs(clusters, moderateParams);
  const moderateSourceAllocations: SourceAllocationRow[] = [];
  for (const cap of MODERATE_COMPARE_CAPS_B) {
    const solved = solve(moderateInputs, budgetBToM(cap));
    moderateSourceAllocations.push(
      ...aggregateBySource(
        solved.allocations,
        "Moderate",
        cap,
        moderateCompareCapLabel(cap),
      ),
    );
  }

  const selectedParams = scenarioParamsMap(
    applyScenarioScaling(calibrated, visitor.scenario),
  );
  const detailed = solve(
    toSolveInputs(clusters, selectedParams),
    budgetBToM(visitor.budget_B),
  );
  const geographic = aggregateGeographic(
    detailed,
    data.upstream_research_context.geographic_risk_ranks,
  );

  const budgetWarning =
    visitor.budget_B > visitor.totalLoss_B
      ? "Budget exceeds total modeled loss. The model will continue allocating against an asymptotic response curve; interpret results with care."
      : null;

  return {
    errors: [],
    result: {
      inputs: {
        ...visitor,
        distribution: cloneWeights(weights),
      },
      clusters,
      reconciliation,
      calibrated,
      scenarioParams,
      frontiers,
      thresholds,
      moderateSourceAllocations,
      detailed,
      geographic,
      budgetWarning,
      distribution,
    },
  };
}

export async function runMonteCarloStage(
  data: CanonicalData,
  deterministic: DeterministicPipelineResult,
  onProgress?: (p: MonteCarloProgress) => void,
  shouldCancel?: () => boolean,
): Promise<FullPipelineResult["monteCarlo"]> {
  const selectedParams = scenarioParamsMap(
    applyScenarioScaling(deterministic.calibrated, deterministic.inputs.scenario),
  );
  const base = toSolveInputs(deterministic.clusters, selectedParams);
  const trials = await runMonteCarlo(
    base,
    {
      ...DEFAULT_MC_SETTINGS,
      seed: data.metadata.monte_carlo_seed,
      trials: data.metadata.monte_carlo_trials,
      budget_M: budgetBToM(deterministic.inputs.budget_B),
    },
    onProgress,
    shouldCancel,
  );

  return {
    trials,
    avoidedSummary: summarizeMetric(
      trials.map((t) => t.avoided_loss_B),
      "avoided_loss_B",
    ),
    ratioSummary: summarizeMetric(
      trials.map((t) => t.ratio),
      "ROI",
      true,
    ),
    sourceShareSummary: summarizeSourceShares(trials),
  };
}
