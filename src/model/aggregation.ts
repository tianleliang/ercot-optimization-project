/**
 * Source and geographic aggregation. Ports V4 cells 23–25, 33.
 */

import type {
  ClusterAllocation,
  GeographicCell,
  ScenarioName,
  SourceAllocationRow,
  SolveResult,
} from "./types";
import { SOURCE_ORDER } from "./types";

export function aggregateBySource(
  allocations: ClusterAllocation[],
  scenario: ScenarioName,
  cap_B: number,
  cap_bin: string,
): SourceAllocationRow[] {
  const totals = new Map<string, number>();
  for (const a of allocations) {
    totals.set(a.source, (totals.get(a.source) ?? 0) + a.allocation_M);
  }
  const sumM = [...totals.values()].reduce((s, v) => s + v, 0);

  const sources = new Set<string>([
    ...SOURCE_ORDER,
    ...allocations.map((a) => a.source),
  ]);

  const rows: SourceAllocationRow[] = [];
  for (const source of sources) {
    const allocation_M = totals.get(source) ?? 0;
    rows.push({
      scenario,
      source,
      cap_bin,
      cap_B,
      allocation_M,
      allocation_B: allocation_M / 1000,
      share_pct: sumM > 0 ? (allocation_M / sumM) * 100 : 0,
    });
  }
  rows.sort((a, b) => b.allocation_M - a.allocation_M);
  return rows;
}

export function moderateCompareCapLabel(cap_B: number): string {
  if (cap_B === 1) return "Low ($1B)";
  if (cap_B === 5) return "Mid ($5B)";
  if (cap_B === 10) return "High ($10B)";
  return `$${cap_B}B`;
}

export function aggregateGeographic(
  result: SolveResult,
  riskRanks: { lat: number; lon: number; risk_rank: number }[],
): GeographicCell[] {
  const rankMap = new Map<string, number>();
  for (const r of riskRanks) {
    rankMap.set(key(r.lat, r.lon), r.risk_rank);
  }

  const groups = new Map<
    string,
    {
      lat: number;
      lon: number;
      baseline_loss_B: number;
      allocation_B: number;
      allocation_share_pct: number;
      clusters: string[];
    }
  >();

  for (const a of result.allocations) {
    const k = key(a.latitude, a.longitude);
    const g = groups.get(k) ?? {
      lat: a.latitude,
      lon: a.longitude,
      baseline_loss_B: 0,
      allocation_B: 0,
      allocation_share_pct: 0,
      clusters: [],
    };
    g.baseline_loss_B += a.loss_B;
    g.allocation_B += a.allocation_B;
    g.allocation_share_pct += a.share_pct;
    g.clusters.push(a.cluster);
    groups.set(k, g);
  }

  const cells: GeographicCell[] = [...groups.values()].map((g) => ({
    lat: g.lat,
    lon: g.lon,
    baseline_loss_B: g.baseline_loss_B,
    allocation_B: g.allocation_B,
    allocation_share_pct: g.allocation_share_pct,
    clusters: [...g.clusters].sort(),
    upstream_risk_rank: rankMap.get(key(g.lat, g.lon)) ?? null,
  }));

  cells.sort((a, b) => b.baseline_loss_B - a.baseline_loss_B);
  return cells;
}

function key(lat: number, lon: number): string {
  return `${lat},${lon}`;
}
