import { useCallback, useId, useState, type KeyboardEvent } from "react";
import ReportView from "./ReportView";
import SimulatorView from "./SimulatorView";

type TabId = "report" | "simulator";

export default function App() {
  const [tab, setTab] = useState<TabId>("report");
  const baseId = useId();
  const reportTabId = `${baseId}-tab-report`;
  const simTabId = `${baseId}-tab-simulator`;
  const reportPanelId = `${baseId}-panel-report`;
  const simPanelId = `${baseId}-panel-simulator`;

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    setTab((t) => (t === "report" ? "simulator" : "report"));
  }, []);

  return (
    <div className="site-shell">
      <header className="site-header">
        <h1>From Climate-Risk Forecasts to Resilience Investment Decisions in ERCOT</h1>
        <p className="site-desc">
          An interactive optimization continuation of prior ERCOT climate-risk
          forecasting research. The project allocates limited resilience
          investment across seven energy sources and 18 source-specific
          geographic clusters under cumulative 2025–2050 modeled provider-loss
          assumptions.
        </p>
        <p className="site-attrib">
          Original allocation model formulated in AMPL and solved with SNOPT.
          This page presents the research report alongside a browser
          implementation that uses the exact KKT/bisection solution for the same
          separable model. Independent research continuation — not a Stanford
          endorsement or investment recommendation.
        </p>
      </header>

      <div
        className="site-tabs"
        role="tablist"
        aria-label="Project views"
        onKeyDown={onKeyDown}
      >
        <button
          type="button"
          role="tab"
          id={reportTabId}
          aria-controls={reportPanelId}
          aria-selected={tab === "report"}
          tabIndex={tab === "report" ? 0 : -1}
          className={tab === "report" ? "site-tab active" : "site-tab"}
          onClick={() => setTab("report")}
        >
          Project Report
        </button>
        <button
          type="button"
          role="tab"
          id={simTabId}
          aria-controls={simPanelId}
          aria-selected={tab === "simulator"}
          tabIndex={tab === "simulator" ? 0 : -1}
          className={tab === "simulator" ? "site-tab active" : "site-tab"}
          onClick={() => setTab("simulator")}
        >
          Interactive Simulator
        </button>
      </div>

      <div
        id={reportPanelId}
        role="tabpanel"
        aria-labelledby={reportTabId}
        hidden={tab !== "report"}
        className="tab-panel tab-panel-report"
      >
        {tab === "report" ? <ReportView /> : null}
      </div>

      {/* Keep the simulator mounted so inputs/results survive tab switches. */}
      <div
        id={simPanelId}
        role="tabpanel"
        aria-labelledby={simTabId}
        hidden={tab !== "simulator"}
        className="tab-panel tab-panel-simulator"
      >
        <SimulatorView active={tab === "simulator"} />
      </div>
    </div>
  );
}
