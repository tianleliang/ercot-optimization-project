/**
 * Shared domain types for the V4 resilience allocation pipeline.
 * Variable names preserve notebook/AMPL traceability where useful.
 */

export type ScenarioName = "Pessimistic" | "Moderate" | "Optimistic";

export interface ClusterInput {
  cluster: string;
  source: string;
  source_label: string;
  latitude: number;
  longitude: number;
  /** Published baseline loss in $B */
  baseline_loss_B: number;
  /** Published share of total (0–1) */
  published_share: number;
  /** Scaled loss for current visitor total, $M */
  loss_M: number;
  /** Scaled loss for current visitor total, $B */
  loss_B: number;
}

export interface SourceAssumption {
  source: string;
  source_label: string;
  max_avoidable_fraction_a: number;
  annual_avoided_loss_per_1M_invested_M: number;
  approx_irr_pct_from_project_log: number;
  planning_horizon_years: number;
  discount_rate: number;
  annuity_factor?: number;
  representative_cluster_loss_M?: number;
  derived_diminishing_return_scale_b_M?: number;
  evidence_status?: string;
}

export interface CalibratedSource {
  source: string;
  source_label: string;
  /** Representative (median) scaled cluster loss, $M */
  L_rep_M: number;
  /** Base max avoidable fraction a */
  a: number;
  annual_avoided_loss_per_1M_invested_M: number;
  planning_horizon_years: number;
  discount_rate: number;
  annuity_factor: number;
  /** Derived diminishing-return scale b, $M */
  b_M: number;
}

export interface ScenarioSourceParams {
  source: string;
  a: number;
  b_M: number;
  a_scale: number;
  b_scale: number;
}

export interface ClusterSolveInput {
  cluster: string;
  source: string;
  /** L_i in $M */
  L: number;
  /** a for source s(i) */
  a: number;
  /** b for source s(i) in $M */
  b: number;
  latitude: number;
  longitude: number;
}

export interface ClusterAllocation {
  cluster: string;
  source: string;
  loss_M: number;
  loss_B: number;
  allocation_M: number;
  allocation_B: number;
  share_pct: number;
  latitude: number;
  longitude: number;
}

export interface SolveResult {
  budget_M: number;
  budget_B: number;
  baseline_loss_M: number;
  baseline_loss_B: number;
  residual_loss_M: number;
  residual_loss_B: number;
  avoided_loss_M: number;
  avoided_loss_B: number;
  /** Modeled avoided-loss / budget ratio (notebook ROI) */
  ratio: number;
  allocations: ClusterAllocation[];
  lambda: number | null;
  iterations: number;
}

export interface FrontierRow {
  scenario: ScenarioName;
  budget_B: number;
  budget_amount: number;
  residual_amount: number;
  avoided_amount: number;
  ROI: number;
  mROI: number | null;
  residual_loss_B: number;
  avoided_loss_B: number;
  ratio: number;
  marginal_ratio: number | null;
}

export interface ThresholdSelection {
  scenario: ScenarioName;
  selected_budget_B: number;
  avoided_loss_B: number;
  ratio: number;
  marginal_ratio: number | null;
  is_fallback: boolean;
  selection_note: string;
}

export interface SourceAllocationRow {
  scenario: ScenarioName;
  source: string;
  cap_bin: string;
  cap_B: number;
  allocation_M: number;
  allocation_B: number;
  share_pct: number;
}

export interface GeographicCell {
  lat: number;
  lon: number;
  baseline_loss_B: number;
  allocation_B: number;
  allocation_share_pct: number;
  clusters: string[];
  upstream_risk_rank: number | null;
}

export interface MonteCarloTrial {
  trial: number;
  baseline_loss_B: number;
  residual_loss_B: number;
  avoided_loss_B: number;
  ratio: number;
  source_shares: Record<string, number>;
}

export interface MetricSummary {
  metric: string;
  count: number;
  mean: number;
  std: number;
  min: number;
  p5: number;
  median: number;
  p95: number;
  max: number;
  share_above_one?: number | null;
}

export interface SourceShareSummary {
  source: string;
  mean: number;
  std: number;
  p25: number;
  median: number;
  p75: number;
}

export type DistributionMode = "published" | "custom";

export interface DistributionWeights {
  sourceWeights: Record<string, number>;
  clusterWeights: Record<string, number>;
}

export interface VisitorInputs {
  totalLoss_B: number;
  budget_B: number;
  scenario: ScenarioName;
  /** V2: published scales from baseline shares; custom uses editable weights. */
  distributionMode: DistributionMode;
  distribution: DistributionWeights;
}

export interface ValidationError {
  field: string;
  message: string;
}

export const BUDGET_CAPS_B = [
  0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 7.5, 10, 12.5, 15, 17.5, 20, 25,
  30, 35, 40,
] as const;

export const SCENARIO_SCALES: Record<
  ScenarioName,
  { a_scale: number; b_scale: number }
> = {
  Pessimistic: { a_scale: 1.0, b_scale: 1.0 },
  Moderate: { a_scale: 1.15, b_scale: 0.85 },
  Optimistic: { a_scale: 1.3, b_scale: 0.7 },
};

export const SOURCE_ORDER = [
  "natural_gas",
  "coal",
  "wind",
  "solar",
  "nuclear",
  "hydroelectric",
  "petroleum",
] as const;

/** Placeholder defaults; call resetInputs(canonical) for full published weights. */
export const DEFAULT_INPUTS: Omit<VisitorInputs, "distribution"> & {
  distribution: DistributionWeights;
} = {
  totalLoss_B: 43.1,
  budget_B: 5.0,
  scenario: "Moderate",
  distributionMode: "published",
  distribution: { sourceWeights: {}, clusterWeights: {} },
};

export const MODERATE_COMPARE_CAPS_B = [1, 5, 10] as const;
