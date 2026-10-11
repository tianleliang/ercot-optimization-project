import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BubbleController,
  Tooltip,
  Legend,
  Filler,
  Title,
} from "chart.js";
import { Line, Bar, Bubble } from "react-chartjs-2";
import type { FrontierRow, ClusterAllocation, GeographicCell, MonteCarloTrial } from "../model/types";
import { SOURCE_ORDER } from "../model/types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BubbleController,
  Tooltip,
  Legend,
  Filler,
  Title,
);

const COLORS = {
  Pessimistic: "#8b4513",
  Moderate: "#1f4e79",
  Optimistic: "#1f6b45",
};

export function FrontierCharts({ rows }: { rows: FrontierRow[] }) {
  const scenarios = ["Pessimistic", "Moderate", "Optimistic"] as const;
  const avoided = {
    datasets: scenarios.map((s) => ({
      label: s,
      data: rows
        .filter((r) => r.scenario === s)
        .map((r) => ({ x: r.budget_B, y: r.avoided_loss_B })),
      borderColor: COLORS[s],
      backgroundColor: COLORS[s],
      tension: 0.15,
      pointRadius: 2,
    })),
  };
  const ratio = {
    datasets: scenarios.map((s) => ({
      label: s,
      data: rows
        .filter((r) => r.scenario === s)
        .map((r) => ({ x: r.budget_B, y: r.ratio })),
      borderColor: COLORS[s],
      backgroundColor: COLORS[s],
      tension: 0.15,
      pointRadius: 2,
    })),
  };
  const common = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" as const } },
    scales: {
      x: { type: "linear" as const, title: { display: true, text: "Budget ($B)" } },
    },
  };

  return (
    <>
      <div className="chart-box">
        <Line
          data={avoided}
          options={{
            ...common,
            scales: {
              ...common.scales,
              y: { title: { display: true, text: "Avoided loss ($B)" } },
            },
          }}
        />
      </div>
      <div className="chart-box">
        <Line
          data={ratio}
          options={{
            ...common,
            scales: {
              ...common.scales,
              y: {
                title: {
                  display: true,
                  text: "Avoided-loss / budget ratio",
                },
              },
            },
          }}
        />
      </div>
    </>
  );
}

export function SourceShareChart({
  rows,
}: {
  rows: { source: string; cap_bin: string; share_pct: number }[];
}) {
  const caps = ["Low ($1B)", "Mid ($5B)", "High ($10B)"];
  const data = {
    labels: [...SOURCE_ORDER],
    datasets: caps.map((cap, i) => ({
      label: cap,
      data: SOURCE_ORDER.map(
        (s) =>
          rows.find((r) => r.source === s && r.cap_bin === cap)?.share_pct ?? 0,
      ),
      backgroundColor: ["#1f4e79", "#3d7ab5", "#8fb4d6"][i],
    })),
  };
  return (
    <div className="chart-box tall">
      <Bar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: {
            y: { title: { display: true, text: "Allocation share (%)" } },
          },
        }}
      />
    </div>
  );
}

export function ClusterBarChart({ allocations }: { allocations: ClusterAllocation[] }) {
  const sorted = [...allocations].sort(
    (a, b) => b.allocation_B - a.allocation_B,
  );
  return (
    <div className="chart-box tall">
      <Bar
        data={{
          labels: sorted.map((a) => a.cluster),
          datasets: [
            {
              label: "Allocation ($B)",
              data: sorted.map((a) => a.allocation_B),
              backgroundColor: "#1f4e79",
            },
          ],
        }}
        options={{
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
        }}
      />
    </div>
  );
}

export function GeoBubblePanels({ cells }: { cells: GeographicCell[] }) {
  const maxLoss = Math.max(...cells.map((c) => c.baseline_loss_B), 1e-9);
  const maxAlloc = Math.max(...cells.map((c) => c.allocation_B), 1e-9);

  const make = (field: "baseline_loss_B" | "allocation_B", max: number, color: string) => ({
    datasets: [
      {
        label: field,
        data: cells.map((c) => ({
          x: c.lon,
          y: c.lat,
          r: 4 + 22 * Math.sqrt(c[field] / max),
          v: c[field],
        })),
        backgroundColor: color,
      },
    ],
  });

  const opts = (title: string) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: title },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: unknown }) => {
            const r = ctx.raw as { x: number; y: number; v: number };
            return `(${r.y}, ${r.x}): $${r.v.toFixed(3)}B`;
          },
        },
      },
    },
    scales: {
      x: { title: { display: true, text: "Longitude" } },
      y: { title: { display: true, text: "Latitude" } },
    },
  });

  return (
    <>
      <div className="chart-box">
        <Bubble
          data={make("baseline_loss_B", maxLoss, "rgba(31,78,121,0.55)")}
          options={opts("Loss by grid cell")}
        />
      </div>
      <div className="chart-box">
        <Bubble
          data={make("allocation_B", maxAlloc, "rgba(31,107,69,0.55)")}
          options={opts("Allocation by grid cell")}
        />
      </div>
      <p className="muted">
        Circles are centroids only; area encodes magnitude and does not represent
        geographic coverage.
      </p>
    </>
  );
}

function histogram(values: number[], bins = 20): { labels: string[]; counts: number[] } {
  if (!values.length) return { labels: [], counts: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const counts = Array.from({ length: bins }, () => 0);
  for (const v of values) {
    let i = Math.floor((v - min) / width);
    if (i >= bins) i = bins - 1;
    if (i < 0) i = 0;
    counts[i] += 1;
  }
  const labels = counts.map((_, i) => (min + (i + 0.5) * width).toFixed(2));
  return { labels, counts };
}

export function HistogramChart({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const { labels, counts } = histogram(values);
  return (
    <div className="chart-box">
      <Bar
        data={{
          labels,
          datasets: [
            {
              label,
              data: counts,
              backgroundColor: "#1f4e79",
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
        }}
      />
    </div>
  );
}

export function McSourceShareChart({ trials }: { trials: MonteCarloTrial[] }) {
  const data = {
    labels: [...SOURCE_ORDER],
    datasets: [
      {
        label: "Median share (%)",
        data: SOURCE_ORDER.map((s) => {
          const vals = trials
            .map((t) => t.source_shares[s] ?? 0)
            .sort((a, b) => a - b);
          const mid = Math.floor(vals.length / 2);
          return vals.length
            ? vals.length % 2
              ? vals[mid]
              : (vals[mid - 1] + vals[mid]) / 2
            : 0;
        }),
        backgroundColor: "#1f4e79",
      },
    ],
  };
  return (
    <div className="chart-box">
      <Bar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: {
            y: { title: { display: true, text: "Median allocation share (%)" } },
          },
        }}
      />
    </div>
  );
}
