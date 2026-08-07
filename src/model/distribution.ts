/**
 * Two-level relative loss-distribution weights (V2).
 * Cluster loss = total × source_weight_norm × cluster_weight_norm_within_source.
 */

import type { CanonicalClusterRow } from "./calibration";
import { billionToMillion } from "./units";
import type {
  ClusterInput,
  DistributionMode,
  DistributionWeights,
} from "./types";
import { SOURCE_ORDER } from "./types";

export type { DistributionMode, DistributionWeights };

export interface NormalizedDistribution {
  sourceWeightsRaw: Record<string, number>;
  clusterWeightsRaw: Record<string, number>;
  sourceWeightsNorm: Record<string, number>;
  clusterWeightsNorm: Record<string, number>;
  /** Within-source cluster norms (sum to 1 per source with positive source weight). */
  clusterWeightsWithinSourceNorm: Record<string, number>;
}

export interface DistributionSnapshot extends NormalizedDistribution {
  mode: DistributionMode;
  clusterLosses_B: Record<string, number>;
}

function sumValues(obj: Record<string, number>): number {
  let s = 0;
  for (const v of Object.values(obj)) s += v;
  return s;
}

function normalizeRecord(
  weights: Record<string, number>,
  keys: string[],
): Record<string, number> {
  const clipped: Record<string, number> = {};
  for (const k of keys) {
    const v = weights[k] ?? 0;
    clipped[k] = Number.isFinite(v) && v > 0 ? v : 0;
  }
  const total = sumValues(clipped);
  const out: Record<string, number> = {};
  if (!(total > 0)) {
    for (const k of keys) out[k] = 0;
    return out;
  }
  for (const k of keys) out[k] = clipped[k] / total;
  return out;
}

/** Published relative weights from canonical baseline losses. */
export function publishedWeightsFromClusters(
  published: CanonicalClusterRow[],
): DistributionWeights {
  const sourceTotals: Record<string, number> = {};
  const clusterWeights: Record<string, number> = {};
  for (const c of published) {
    sourceTotals[c.source] = (sourceTotals[c.source] ?? 0) + c.baseline_loss_B;
    clusterWeights[c.cluster] = c.baseline_loss_B;
  }
  const sourceWeights: Record<string, number> = {};
  for (const s of SOURCE_ORDER) {
    sourceWeights[s] = sourceTotals[s] ?? 0;
  }
  // Include any unexpected sources
  for (const s of Object.keys(sourceTotals)) {
    if (!(s in sourceWeights)) sourceWeights[s] = sourceTotals[s];
  }
  return { sourceWeights, clusterWeights };
}

export function clustersForSource(
  published: CanonicalClusterRow[],
  source: string,
): CanonicalClusterRow[] {
  return published.filter((c) => c.source === source);
}

/**
 * Normalize source weights and within-source cluster weights.
 * If a source has positive weight but all cluster weights are zero,
 * redistribute equally across that source's clusters.
 */
export function normalizeDistribution(
  published: CanonicalClusterRow[],
  weights: DistributionWeights,
): NormalizedDistribution {
  const sources = [
    ...SOURCE_ORDER.filter((s) => published.some((c) => c.source === s)),
    ...[...new Set(published.map((c) => c.source))].filter(
      (s) => !(SOURCE_ORDER as readonly string[]).includes(s),
    ),
  ];
  const clusters = published.map((c) => c.cluster);

  const sourceWeightsRaw: Record<string, number> = {};
  for (const s of sources) {
    const v = weights.sourceWeights[s] ?? 0;
    sourceWeightsRaw[s] = Number.isFinite(v) && v >= 0 ? v : 0;
  }

  const clusterWeightsRaw: Record<string, number> = {};
  for (const c of clusters) {
    const v = weights.clusterWeights[c] ?? 0;
    clusterWeightsRaw[c] = Number.isFinite(v) && v >= 0 ? v : 0;
  }

  const sourceWeightsNorm = normalizeRecord(sourceWeightsRaw, sources);

  const clusterWeightsWithinSourceNorm: Record<string, number> = {};
  for (const s of sources) {
    const members = published.filter((c) => c.source === s).map((c) => c.cluster);
    const rawWithin: Record<string, number> = {};
    for (const id of members) rawWithin[id] = clusterWeightsRaw[id];
    let withinNorm = normalizeRecord(rawWithin, members);
    if (sourceWeightsNorm[s] > 0 && sumValues(withinNorm) === 0) {
      // Resolve invalid all-zero within-source weights: equal split.
      const eq = members.length ? 1 / members.length : 0;
      withinNorm = Object.fromEntries(members.map((id) => [id, eq]));
    }
    for (const id of members) {
      clusterWeightsWithinSourceNorm[id] = withinNorm[id] ?? 0;
    }
  }

  const clusterWeightsNorm: Record<string, number> = {};
  for (const c of published) {
    clusterWeightsNorm[c.cluster] =
      (sourceWeightsNorm[c.source] ?? 0) *
      (clusterWeightsWithinSourceNorm[c.cluster] ?? 0);
  }

  return {
    sourceWeightsRaw,
    clusterWeightsRaw,
    sourceWeightsNorm,
    clusterWeightsNorm,
    clusterWeightsWithinSourceNorm,
  };
}

/** Build cluster inputs from total loss × normalized two-level weights. */
export function prepareClusterInputsFromDistribution(
  published: CanonicalClusterRow[],
  totalLoss_B: number,
  weights: DistributionWeights,
): { clusters: ClusterInput[]; normalized: NormalizedDistribution } {
  const normalized = normalizeDistribution(published, weights);
  const publishedTotal = published.reduce((s, c) => s + c.baseline_loss_B, 0);

  const clusters: ClusterInput[] = published.map((c) => {
    const share = normalized.clusterWeightsNorm[c.cluster] ?? 0;
    const loss_B = totalLoss_B * share;
    return {
      cluster: c.cluster,
      source: c.source,
      source_label: c.source_label,
      latitude: c.latitude,
      longitude: c.longitude,
      baseline_loss_B: c.baseline_loss_B,
      published_share:
        publishedTotal > 0 ? c.baseline_loss_B / publishedTotal : 0,
      loss_B,
      loss_M: billionToMillion(loss_B),
    };
  });

  // Exact reconciliation onto largest positive (or first) cluster.
  const sum = clusters.reduce((s, c) => s + c.loss_B, 0);
  const drift = totalLoss_B - sum;
  if (Math.abs(drift) > 0 && clusters.length) {
    let idx = 0;
    for (let i = 1; i < clusters.length; i++) {
      if (clusters[i].loss_B > clusters[idx].loss_B) idx = i;
    }
    clusters[idx] = {
      ...clusters[idx],
      loss_B: clusters[idx].loss_B + drift,
      loss_M: billionToMillion(clusters[idx].loss_B + drift),
    };
  }

  return { clusters, normalized };
}

export function snapshotDistribution(
  mode: DistributionMode,
  published: CanonicalClusterRow[],
  totalLoss_B: number,
  weights: DistributionWeights,
): DistributionSnapshot {
  const { clusters, normalized } = prepareClusterInputsFromDistribution(
    published,
    totalLoss_B,
    weights,
  );
  const clusterLosses_B: Record<string, number> = {};
  for (const c of clusters) clusterLosses_B[c.cluster] = c.loss_B;
  return { mode, ...normalized, clusterLosses_B };
}

export function cloneWeights(w: DistributionWeights): DistributionWeights {
  return {
    sourceWeights: { ...w.sourceWeights },
    clusterWeights: { ...w.clusterWeights },
  };
}

/** Reset one source's cluster weights to published within-source relatives. */
export function resetSourceWeights(
  published: CanonicalClusterRow[],
  current: DistributionWeights,
  source: string,
): DistributionWeights {
  const next = cloneWeights(current);
  const members = published.filter((c) => c.source === source);
  const pub = publishedWeightsFromClusters(published);
  next.sourceWeights[source] = pub.sourceWeights[source] ?? 0;
  for (const m of members) {
    next.clusterWeights[m.cluster] = pub.clusterWeights[m.cluster] ?? 0;
  }
  return next;
}
