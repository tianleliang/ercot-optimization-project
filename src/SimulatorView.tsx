import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import canonical from "./data/canonical.json";
import {
  defaultPublishedWeights,
  publishedClustersFromCanonical,
  runDeterministicPipeline,
  runMonteCarloStage,
  resetInputs,
  type CanonicalData,
  type DeterministicPipelineResult,
  type FullPipelineResult,
} from "./model/pipeline";
import { cloneWeights } from "./model/distribution";
import type { ScenarioName, VisitorInputs } from "./model/types";
import { formatBillion, formatPct, formatRatio } from "./model/units";
import {
  ClusterBarChart,
  FrontierCharts,
  HistogramChart,
  McSourceShareChart,
  SourceShareChart,
} from "./charts/Charts";
import { TexasMapPanels } from "./charts/TexasMap";
import { DistributionEditor } from "./components/DistributionEditor";
import { downloadText, toCsv } from "./export";

type StageStatus = "pending" | "running" | "completed" | "error";

const data = canonical as unknown as CanonicalData;
const publishedClusters = publishedClustersFromCanonical(data);

function StatusBadge({ status }: { status: StageStatus }) {
  return <span className={`status ${status}`}>{status}</span>;
}

export default function SimulatorView({ active = true }: { active?: boolean }) {
  const [draft, setDraft] = useState<VisitorInputs>(() => resetInputs(data));
  const [errors, setErrors] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [det, setDet] = useState<DeterministicPipelineResult | null>(null);
  const [mc, setMc] = useState<FullPipelineResult["monteCarlo"] | null>(null);
  const [mcProgress, setMcProgress] = useState("");
  const [stageStatus, setStageStatus] = useState<Record<string, StageStatus>>({
    inputs: "pending",
    calibration: "pending",
    frontiers: "pending",
    thresholds: "pending",
    sources: "pending",
    detailed: "pending",
    geographic: "pending",
    monteCarlo: "pending",
  });
  const cancelRef = useRef(false);

  const setStages = useCallback((ids: string[], status: StageStatus) => {
    setStageStatus((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = status;
      return next;
    });
  }, []);

  const onReset = () => {
    cancelRef.current = true;
    setDraft(resetInputs(data));
    setErrors([]);
    setDet(null);
    setMc(null);
    setMcProgress("");
    setRunning(false);
    setStageStatus({
      inputs: "pending",
      calibration: "pending",
      frontiers: "pending",
      thresholds: "pending",
      sources: "pending",
      detailed: "pending",
      geographic: "pending",
      monteCarlo: "pending",
    });
  };

  const onRun = async () => {
    cancelRef.current = false;
    setRunning(true);
    setMc(null);
    setMcProgress("");
    setErrors([]);

    const all = [
      "inputs",
      "calibration",
      "frontiers",
      "thresholds",
      "sources",
      "detailed",
      "geographic",
      "monteCarlo",
    ];
    setStages(all, "pending");
    setStages(["inputs", "calibration", "detailed"], "running");

    await yieldTick();
    const { errors: verr, result } = runDeterministicPipeline(data, draft);
    if (verr.length || !result) {
      setErrors(verr.map((e) => e.message));
      setDet(null);
      setStages(all, "pending");
      setStages(["inputs"], "error");
      setRunning(false);
      return;
    }

    setDet(result);
    setStages(
      [
        "inputs",
        "calibration",
        "frontiers",
        "thresholds",
        "sources",
        "detailed",
        "geographic",
      ],
      "completed",
    );
    setStages(["monteCarlo"], "running");
    await yieldTick();

    try {
      const mcResult = await runMonteCarloStage(
        data,
        result,
        (p) => setMcProgress(`${p.completed} / ${p.total} trials`),
        () => cancelRef.current,
      );
      if (!cancelRef.current) {
        setMc(mcResult);
        setStages(["monteCarlo"], "completed");
      }
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Monte Carlo failed."]);
      setStages(["monteCarlo"], "error");
    }
    setRunning(false);
  };

  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
    return () => window.clearTimeout(id);
  }, [active]);

  const scenarioParamsFlat = useMemo(() => {
    if (!det) return [];
    return (Object.keys(det.scenarioParams) as ScenarioName[]).flatMap(
      (scenario) =>
        det.scenarioParams[scenario].map((p) => ({
          scenario,
          source: p.source,
          a: p.a,
          b_M: p.b_M,
        })),
    );
  }, [det]);

  return (
    <div className="app simulator-view">
      <section className="panel" aria-labelledby="about-heading">
        <h2 id="about-heading">About this simulator</h2>
        <ul className="intro-list">
          <li>
            Choose total modeled loss, budget, response scenario
            (Pessimistic / Moderate / Optimistic), and optionally a custom
            relative loss distribution across seven sources and 18 clusters.
          </li>
          <li>
            The simulator reallocates assumed loss and{" "}
            <strong>does not rerun the upstream machine-learning forecasts</strong>.
          </li>
          <li>
            Outputs are scenario-dependent modeled results. Avoided loss divided
            by budget is a modeled benefit-cost ratio — not accounting ROI or IRR.
          </li>
          <li>
            The 18 clusters and ten geographic centroids are fixed to the
            published project structure. The published analysis was formulated in
            AMPL and solved with SNOPT; this browser uses the exact KKT/bisection
            solution for the same separable model.
          </li>
        </ul>
        <p className="blurb" style={{ marginBottom: 0 }}>
          <strong>How to use:</strong> (1) set total loss, budget, and scenario;
          (2) optionally switch to a custom loss distribution; (3) run full
          analysis and review the progressively rendered stages below.
        </p>
      </section>

      <section className="panel" aria-labelledby="controls-heading">
        <h2 id="controls-heading">Controls</h2>
        <p className="blurb">
          Defaults reconstruct the published $43.1B / Moderate / $5B case.
        </p>
        <div className="controls">
          <label>
            Total modeled cumulative loss ($B)
            <input
              type="number"
              min={0}
              step="0.1"
              value={draft.totalLoss_B}
              disabled={running}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  totalLoss_B: Number(e.target.value),
                }))
              }
            />
          </label>
          <label>
            Detailed allocation budget ($B)
            <input
              type="number"
              min={0}
              step="0.1"
              value={draft.budget_B}
              disabled={running}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  budget_B: Number(e.target.value),
                }))
              }
            />
          </label>
          <label>
            Detailed allocation scenario
            <select
              value={draft.scenario}
              disabled={running}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  scenario: e.target.value as ScenarioName,
                }))
              }
            >
              <option>Pessimistic</option>
              <option>Moderate</option>
              <option>Optimistic</option>
            </select>
          </label>
          <div className="actions">
            <button type="button" onClick={onRun} disabled={running}>
              Run full analysis
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onReset}
              disabled={running}
            >
              Reset published case
            </button>
          </div>
        </div>
        {errors.map((msg) => (
          <div className="err" key={msg} role="alert">
            {msg}
          </div>
        ))}
        {det?.budgetWarning && <div className="warn">{det.budgetWarning}</div>}
      </section>

      <section className="panel" aria-labelledby="distribution-heading">
        <h2 id="distribution-heading">Loss distribution</h2>
        <DistributionEditor
          published={publishedClusters}
          mode={draft.distributionMode}
          weights={draft.distribution}
          totalLoss_B={draft.totalLoss_B}
          disabled={running}
          onModeChange={(distributionMode) =>
            setDraft((d) => ({
              ...d,
              distributionMode,
              distribution:
                distributionMode === "published"
                  ? cloneWeights(defaultPublishedWeights(data))
                  : d.distribution,
            }))
          }
          onWeightsChange={(distribution) =>
            setDraft((d) => ({
              ...d,
              distributionMode: "custom",
              distribution,
            }))
          }
          onResetPublished={() =>
            setDraft((d) => ({
              ...d,
              distributionMode: "published",
              distribution: cloneWeights(defaultPublishedWeights(data)),
            }))
          }
        />
      </section>

      <Stage
        title="1. Input preparation"
        status={stageStatus.inputs}
        blurb="Scaled cluster losses preserve published relative shares and reconcile to the selected total."
      >
        {det && (
          <>
            <div className="cards">
              <Metric label="Total scaled loss" value={formatBillion(det.inputs.totalLoss_B, 3)} />
              <Metric label="Sources" value="7" />
              <Metric label="Source-clusters" value="18" />
              <Metric label="Geographic cells" value="10" />
              <Metric
                label="Reconciliation"
                value={det.reconciliation.ok ? "OK" : "DRIFT"}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cluster</th>
                    <th>Source</th>
                    <th>Scaled loss ($B)</th>
                    <th>Published share</th>
                    <th>Lat</th>
                    <th>Lon</th>
                  </tr>
                </thead>
                <tbody>
                  {det.clusters.map((c) => (
                    <tr key={c.cluster}>
                      <td>{c.cluster}</td>
                      <td>{c.source}</td>
                      <td>{c.loss_B.toFixed(6)}</td>
                      <td>{(c.published_share * 100).toFixed(3)}%</td>
                      <td>{c.latitude}</td>
                      <td>{c.longitude}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Stage>

      <Stage
        title="2. Source calibration"
        status={stageStatus.calibration}
        blurb="Representative loss is the median cluster loss per source. b is recalculated when total loss changes."
      >
        {det && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>L_rep ($M)</th>
                    <th>a</th>
                    <th>R ($M/yr per $1M)</th>
                    <th>H</th>
                    <th>r</th>
                    <th>AF</th>
                    <th>b ($M)</th>
                  </tr>
                </thead>
                <tbody>
                  {det.calibrated.map((c) => (
                    <tr key={c.source}>
                      <td>{c.source_label}</td>
                      <td>{c.L_rep_M.toFixed(3)}</td>
                      <td>{c.a.toFixed(3)}</td>
                      <td>{c.annual_avoided_loss_per_1M_invested_M.toFixed(3)}</td>
                      <td>{c.planning_horizon_years}</td>
                      <td>{c.discount_rate.toFixed(3)}</td>
                      <td>{c.annuity_factor.toFixed(4)}</td>
                      <td>{c.b_M.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Scenario-adjusted (a, b)</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th>Source</th>
                      <th>a</th>
                      <th>b ($M)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarioParamsFlat.map((r) => (
                      <tr key={`${r.scenario}-${r.source}`}>
                        <td>{r.scenario}</td>
                        <td>{r.source}</td>
                        <td>{r.a.toFixed(6)}</td>
                        <td>{r.b_M.toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </Stage>

      <Stage
        title="3. Scenario frontiers"
        status={stageStatus.frontiers}
        blurb="Twenty discrete budget caps for each response scenario."
      >
        {det && (
          <>
            <FrontierCharts rows={det.frontiers} />
            <details>
              <summary>60-row frontier table</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th>Budget ($B)</th>
                      <th>Avoided ($B)</th>
                      <th>Residual ($B)</th>
                      <th>Ratio</th>
                      <th>Marginal ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {det.frontiers.map((r) => (
                      <tr key={`${r.scenario}-${r.budget_B}`}>
                        <td>{r.scenario}</td>
                        <td>{r.budget_B}</td>
                        <td>{r.avoided_loss_B.toFixed(6)}</td>
                        <td>{r.residual_loss_B.toFixed(6)}</td>
                        <td>{formatRatio(r.ratio)}</td>
                        <td>
                          {r.marginal_ratio == null
                            ? "—"
                            : formatRatio(r.marginal_ratio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </Stage>

      <Stage
        title="4. Threshold-selected budgets"
        status={stageStatus.thresholds}
        blurb="Reference points from the tested grid (avoided ≥ $10B, ratio ≥ 1, marginal ratio ≥ 1). The $10B threshold is fixed even when total loss changes."
      >
        {det && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Selected / fallback ($B)</th>
                  <th>Avoided ($B)</th>
                  <th>Ratio</th>
                  <th>Marginal</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {det.thresholds.map((t) => (
                  <tr key={t.scenario}>
                    <td>{t.scenario}</td>
                    <td>
                      {t.selected_budget_B}
                      {t.is_fallback ? " (fallback)" : ""}
                    </td>
                    <td>{t.avoided_loss_B.toFixed(3)}</td>
                    <td>{formatRatio(t.ratio)}</td>
                    <td>
                      {t.marginal_ratio == null
                        ? "—"
                        : formatRatio(t.marginal_ratio)}
                    </td>
                    <td>{t.selection_note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stage>

      <Stage
        title="5. Moderate source allocation comparison"
        status={stageStatus.sources}
        blurb="Always solved at Moderate $1B / $5B / $10B for comparison, independent of the detailed budget control."
      >
        {det && (
          <>
            <SourceShareChart rows={det.moderateSourceAllocations} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cap</th>
                    <th>Source</th>
                    <th>Allocation ($B)</th>
                    <th>Share (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {det.moderateSourceAllocations.map((r) => (
                    <tr key={`${r.cap_bin}-${r.source}`}>
                      <td>{r.cap_bin}</td>
                      <td>{r.source}</td>
                      <td>{r.allocation_B.toFixed(6)}</td>
                      <td>{formatPct(r.share_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Stage>

      <Stage
        title="6. Detailed custom allocation"
        status={stageStatus.detailed}
        blurb="Visitor-selected scenario and budget. Ratio means modeled avoided cumulative loss divided by budget."
      >
        {det && (
          <>
            <div className="cards">
              <Metric label="Budget" value={formatBillion(det.detailed.budget_B)} />
              <Metric
                label="Modeled avoided loss"
                value={formatBillion(det.detailed.avoided_loss_B)}
              />
              <Metric
                label="Residual loss"
                value={formatBillion(det.detailed.residual_loss_B)}
              />
              <Metric
                label="Avoided-loss / budget"
                value={formatRatio(det.detailed.ratio)}
              />
            </div>
            <ClusterBarChart allocations={det.detailed.allocations} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cluster</th>
                    <th>Source</th>
                    <th>Loss ($B)</th>
                    <th>Allocation ($B)</th>
                    <th>Share (%)</th>
                    <th>Lat</th>
                    <th>Lon</th>
                  </tr>
                </thead>
                <tbody>
                  {[...det.detailed.allocations]
                    .sort((a, b) => b.allocation_B - a.allocation_B)
                    .map((a) => (
                      <tr key={a.cluster}>
                        <td>{a.cluster}</td>
                        <td>{a.source}</td>
                        <td>{a.loss_B.toFixed(6)}</td>
                        <td>{a.allocation_B.toFixed(6)}</td>
                        <td>{formatPct(a.share_pct)}</td>
                        <td>{a.latitude}</td>
                        <td>{a.longitude}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Stage>

      <Stage
        title="7. Geographic aggregation"
        status={stageStatus.geographic}
        blurb="Eighteen clusters collapse to ten GFDL centroids by exact latitude/longitude."
      >
        {det && (
          <>
            <TexasMapPanels cells={det.geographic} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lat</th>
                    <th>Lon</th>
                    <th>Loss ($B)</th>
                    <th>Allocation ($B)</th>
                    <th>Share (%)</th>
                    <th>Risk rank</th>
                    <th>Clusters</th>
                  </tr>
                </thead>
                <tbody>
                  {det.geographic.map((c) => (
                    <tr key={`${c.lat},${c.lon}`}>
                      <td>{c.lat}</td>
                      <td>{c.lon}</td>
                      <td>{c.baseline_loss_B.toFixed(6)}</td>
                      <td>{c.allocation_B.toFixed(6)}</td>
                      <td>{formatPct(c.allocation_share_pct)}</td>
                      <td>{c.upstream_risk_rank ?? "—"}</td>
                      <td>{c.clusters.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Stage>

      <Stage
        title="8. Monte Carlo sensitivity"
        status={stageStatus.monteCarlo}
        blurb="300 seeded trials shock a (±10%), b (±20%), and cluster losses (±15%) around the selected scenario. The browser PRNG is deterministic but not NumPy trial-identical."
      >
        {stageStatus.monteCarlo === "running" && (
          <div className="progress">{mcProgress || "Starting trials…"}</div>
        )}
        {mc && (
          <>
            <HistogramChart
              values={mc.trials.map((t) => t.avoided_loss_B)}
              label="Avoided loss ($B)"
            />
            <SummaryTable summary={mc.avoidedSummary} />
            <HistogramChart
              values={mc.trials.map((t) => t.ratio)}
              label="Avoided-loss / budget ratio"
            />
            <SummaryTable summary={mc.ratioSummary} showShare />
            <McSourceShareChart trials={mc.trials} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Mean</th>
                    <th>Std</th>
                    <th>25%</th>
                    <th>Median</th>
                    <th>75%</th>
                  </tr>
                </thead>
                <tbody>
                  {mc.sourceShareSummary.map((r) => (
                    <tr key={r.source}>
                      <td>{r.source}</td>
                      <td>{r.mean.toFixed(3)}</td>
                      <td>{r.std.toFixed(3)}</td>
                      <td>{r.p25.toFixed(3)}</td>
                      <td>{r.median.toFixed(3)}</td>
                      <td>{r.p75.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="actions" style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  downloadText(
                    "monte_carlo_trials.csv",
                    toCsv(
                      mc.trials.map((t) => ({
                        trial: t.trial,
                        baseline_loss_B: t.baseline_loss_B,
                        residual_loss_B: t.residual_loss_B,
                        avoided_loss_B: t.avoided_loss_B,
                        ratio: t.ratio,
                        ...t.source_shares,
                      })),
                    ),
                    "text/csv",
                  )
                }
              >
                Download MC trials CSV
              </button>
              {det && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    downloadText(
                      "pipeline_results.json",
                      JSON.stringify(
                        {
                          inputs: det.inputs,
                          distribution: det.distribution,
                          calibrated: det.calibrated,
                          detailed: {
                            budget_B: det.detailed.budget_B,
                            avoided_loss_B: det.detailed.avoided_loss_B,
                            residual_loss_B: det.detailed.residual_loss_B,
                            ratio: det.detailed.ratio,
                            allocations: det.detailed.allocations,
                          },
                          thresholds: det.thresholds,
                          geographic: det.geographic,
                          monteCarlo: {
                            avoidedSummary: mc.avoidedSummary,
                            ratioSummary: mc.ratioSummary,
                            sourceShareSummary: mc.sourceShareSummary,
                          },
                        },
                        null,
                        2,
                      ),
                      "application/json",
                    )
                  }
                >
                  Download results JSON
                </button>
              )}
            </div>
          </>
        )}
      </Stage>

      <section className="panel limitations">
        <h2>Limitations and definitions</h2>
        <ul>
          {(canonical.known_qualifications as string[]).map((q) => (
            <li key={q}>{q}</li>
          ))}
          <li>
            Original research formulated in AMPL and solved with SNOPT. This
            browser uses the exact KKT allocation rule for the same separable
            convex model.
          </li>
          <li>
            Custom loss distributions reallocate assumed loss among the published
            18 clusters; they do not regenerate upstream ML forecasts.
          </li>
          <li>
            When cluster losses change, source median representative losses and
            derived <code>b</code> values are recalculated before scenario scaling.
          </li>
          <li>
            Upstream forecasting context: cumulative loss scenarios are research
            inputs, not produced inside this simulator.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Stage({
  title,
  status,
  blurb,
  children,
}: {
  title: string;
  status: StageStatus;
  blurb: string;
  children?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="stage-head">
        <h2>{title}</h2>
        <StatusBadge status={status} />
      </div>
      <p className="blurb">{blurb}</p>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function SummaryTable({
  summary,
  showShare,
}: {
  summary: FullPipelineResult["monteCarlo"]["avoidedSummary"];
  showShare?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Count</th>
            <th>Mean</th>
            <th>Std</th>
            <th>Min</th>
            <th>5%</th>
            <th>Median</th>
            <th>95%</th>
            <th>Max</th>
            {showShare && <th>Share ratio &gt; 1</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{summary.metric}</td>
            <td>{summary.count}</td>
            <td>{summary.mean.toFixed(3)}</td>
            <td>{summary.std.toFixed(3)}</td>
            <td>{summary.min.toFixed(3)}</td>
            <td>{summary.p5.toFixed(3)}</td>
            <td>{summary.median.toFixed(3)}</td>
            <td>{summary.p95.toFixed(3)}</td>
            <td>{summary.max.toFixed(3)}</td>
            {showShare && (
              <td>
                {summary.share_above_one == null
                  ? "—"
                  : `${summary.share_above_one.toFixed(1)}%`}
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function yieldTick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
