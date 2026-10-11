import { useMemo, useState } from "react";
import type { CanonicalClusterRow } from "../model/calibration";
import {
  normalizeDistribution,
  resetSourceWeights,
  type DistributionWeights,
} from "../model/distribution";
import type { DistributionMode } from "../model/types";
import { SOURCE_ORDER } from "../model/types";
import { formatBillion, formatPct } from "../model/units";

const SOURCE_COLORS: Record<string, string> = {
  natural_gas: "#1f4e79",
  coal: "#5b6775",
  wind: "#3d7ab5",
  solar: "#c4a35a",
  nuclear: "#1f6b45",
  hydroelectric: "#6a8f9c",
  petroleum: "#8b4513",
};

interface Props {
  published: CanonicalClusterRow[];
  mode: DistributionMode;
  weights: DistributionWeights;
  totalLoss_B: number;
  disabled?: boolean;
  onModeChange: (mode: DistributionMode) => void;
  onWeightsChange: (weights: DistributionWeights) => void;
  onResetPublished: () => void;
}

export function DistributionEditor({
  published,
  mode,
  weights,
  totalLoss_B,
  disabled,
  onModeChange,
  onWeightsChange,
  onResetPublished,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>("natural_gas");
  const normalized = useMemo(
    () => normalizeDistribution(published, weights),
    [published, weights],
  );

  const sources = SOURCE_ORDER.filter((s) =>
    published.some((c) => c.source === s),
  );

  const setSourceWeight = (source: string, value: number) => {
    onWeightsChange({
      ...weights,
      sourceWeights: { ...weights.sourceWeights, [source]: value },
    });
  };

  const setClusterWeight = (cluster: string, value: number) => {
    onWeightsChange({
      ...weights,
      clusterWeights: { ...weights.clusterWeights, [cluster]: value },
    });
  };

  return (
    <div className="distribution-editor">
      <div className="actions" style={{ marginBottom: "0.65rem" }}>
        <button
          type="button"
          className={mode === "published" ? undefined : "secondary"}
          disabled={disabled}
          onClick={() => onModeChange("published")}
        >
          Published distribution
        </button>
        <button
          type="button"
          className={mode === "custom" ? undefined : "secondary"}
          disabled={disabled}
          onClick={() => onModeChange("custom")}
        >
          Custom distribution
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={onResetPublished}
        >
          Reset published distribution
        </button>
      </div>

      <p className="muted">
        Weights set each cluster&apos;s share of total loss.
      </p>

      {mode === "published" ? (
        <p className="blurb">
          Using the published shares. Switch to custom to edit.
        </p>
      ) : (
        <>
          <div
            className="stacked-bar"
            role="img"
            aria-label="Normalized source weight summary"
          >
            {sources.map((s) => {
              const pct = (normalized.sourceWeightsNorm[s] ?? 0) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={s}
                  style={{
                    width: `${pct}%`,
                    background: SOURCE_COLORS[s] ?? "#888",
                  }}
                  title={`${s}: ${pct.toFixed(1)}%`}
                />
              );
            })}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Raw weight</th>
                  <th>Normalized</th>
                  <th>Loss ($B)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const members = published.filter((c) => c.source === s);
                  const label = members[0]?.source_label ?? s;
                  const norm = normalized.sourceWeightsNorm[s] ?? 0;
                  return (
                    <tr key={s}>
                      <td>
                        <button
                          type="button"
                          className="linkish"
                          disabled={disabled}
                          onClick={() =>
                            setExpanded((e) => (e === s ? null : s))
                          }
                        >
                          {expanded === s ? "▾" : "▸"} {label}
                        </button>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={disabled}
                          value={weights.sourceWeights[s] ?? 0}
                          onChange={(e) =>
                            setSourceWeight(s, Number(e.target.value))
                          }
                          aria-label={`${label} source weight`}
                        />
                      </td>
                      <td>{formatPct(norm * 100)}</td>
                      <td>{formatBillion(totalLoss_B * norm, 3)}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          disabled={disabled}
                          onClick={() =>
                            onWeightsChange(
                              resetSourceWeights(published, weights, s),
                            )
                          }
                        >
                          Reset source
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {expanded && (
            <div className="cluster-weights panel" style={{ marginTop: "0.75rem" }}>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
                Within-source clusters —{" "}
                {published.find((c) => c.source === expanded)?.source_label ??
                  expanded}
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cluster</th>
                      <th>Raw weight</th>
                      <th>Within-source %</th>
                      <th>Of total %</th>
                      <th>Loss ($B)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {published
                      .filter((c) => c.source === expanded)
                      .map((c) => {
                        const within =
                          normalized.clusterWeightsWithinSourceNorm[c.cluster] ??
                          0;
                        const ofTotal =
                          normalized.clusterWeightsNorm[c.cluster] ?? 0;
                        return (
                          <tr key={c.cluster}>
                            <td>{c.cluster}</td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                disabled={disabled}
                                value={weights.clusterWeights[c.cluster] ?? 0}
                                onChange={(e) =>
                                  setClusterWeight(
                                    c.cluster,
                                    Number(e.target.value),
                                  )
                                }
                                aria-label={`${c.cluster} weight`}
                              />
                            </td>
                            <td>{formatPct(within * 100)}</td>
                            <td>{formatPct(ofTotal * 100)}</td>
                            <td>
                              {formatBillion(totalLoss_B * ofTotal, 4)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
