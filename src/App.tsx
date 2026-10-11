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
        <h1>ERCOT Climate-Resilience Investment Allocation</h1>
        <p className="site-desc">
          Where a limited resilience budget should go across 7 energy sources
          and 18 plant clusters in the Texas grid, 2025–2050.
        </p>
        <p className="site-attrib">
          Tianle Liang · mentored by Michael Saunders
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

      <footer className="site-footer">
        <p>
          The report text was generated with AI, under my direction, from the
          project&apos;s code and documentation built up over several months. A
          formal paper is in progress.
        </p>
        <p>Independent project. Not affiliated with or endorsed by Stanford.</p>
      </footer>
    </div>
  );
}
