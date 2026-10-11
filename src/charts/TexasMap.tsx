import { useEffect, useMemo, useState } from "react";
import type { GeographicCell } from "../model/types";

type Metric = "loss" | "allocation";

interface GeoJSONGeometry {
  type: string;
  coordinates: unknown;
}

interface FeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    geometry: GeoJSONGeometry;
  }>;
}

function project(
  lon: number,
  lat: number,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  width: number,
  height: number,
  pad = 16,
): [number, number] {
  const x =
    pad +
    ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (width - 2 * pad);
  const y =
    pad +
    ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * (height - 2 * pad);
  return [x, y];
}

function ringToPath(
  ring: number[][],
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  width: number,
  height: number,
): string {
  return (
    ring
      .map((pt, i) => {
        const [x, y] = project(pt[0], pt[1], bounds, width, height);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ") + " Z"
  );
}

function geometryToPath(
  geom: GeoJSONGeometry,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  width: number,
  height: number,
): string {
  const parts: string[] = [];
  if (geom.type === "Polygon") {
    const coords = geom.coordinates as number[][][];
    for (const ring of coords) parts.push(ringToPath(ring, bounds, width, height));
  } else if (geom.type === "MultiPolygon") {
    const coords = geom.coordinates as number[][][][];
    for (const poly of coords) {
      for (const ring of poly) parts.push(ringToPath(ring, bounds, width, height));
    }
  }
  return parts.join(" ");
}

function collectBounds(fc: FeatureCollection) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const lon = coords[0] as number;
      const lat = coords[1] as number;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      return;
    }
    for (const c of coords) walk(c);
  };
  for (const f of fc.features) walk(f.geometry.coordinates);
  // Slight padding in geographic space
  const lonPad = (maxLon - minLon) * 0.02;
  const latPad = (maxLat - minLat) * 0.02;
  return {
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
  };
}

export function TexasMapPanels({ cells }: { cells: GeographicCell[] }) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [metric, setMetric] = useState<Metric>("loss");
  const [error, setError] = useState<string | null>(null);
  const width = 640;
  const height = 520;

  useEffect(() => {
    let cancelled = false;
    fetch("./data/texas-boundary.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load Texas boundary (${r.status})`);
        return r.json();
      })
      .then((j: FeatureCollection) => {
        if (!cancelled) setGeo(j);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bounds = useMemo(() => (geo ? collectBounds(geo) : null), [geo]);
  const paths = useMemo(() => {
    if (!geo || !bounds) return [];
    return geo.features.map((f) =>
      geometryToPath(f.geometry, bounds, width, height),
    );
  }, [geo, bounds]);

  const values = cells.map((c) =>
    metric === "loss" ? c.baseline_loss_B : c.allocation_B,
  );
  const maxV = Math.max(...values, 1e-12);
  const color =
    metric === "loss" ? "rgba(31,78,121,0.72)" : "rgba(31,107,69,0.72)";

  return (
    <div>
      <div className="actions" style={{ marginBottom: "0.5rem" }}>
        <button
          type="button"
          className={metric === "loss" ? undefined : "secondary"}
          onClick={() => setMetric("loss")}
        >
          Modeled loss
        </button>
        <button
          type="button"
          className={metric === "allocation" ? undefined : "secondary"}
          onClick={() => setMetric("allocation")}
        >
          Optimized allocation
        </button>
      </div>
      {error && <div className="err">{error}</div>}
      {!geo && !error && <p className="muted">Loading Texas boundary…</p>}
      {geo && bounds && (
        <div className="map-box">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={
              metric === "loss"
                ? "Loss by grid cell"
                : "Allocation by grid cell"
            }
          >
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="#e8eef5"
                stroke="#7a8694"
                strokeWidth={0.8}
              />
            ))}
            {cells.map((c) => {
              const v =
                metric === "loss" ? c.baseline_loss_B : c.allocation_B;
              const [cx, cy] = project(c.lon, c.lat, bounds, width, height);
              const r = 4 + 28 * Math.sqrt(Math.max(v, 0) / maxV);
              const nearZero = v < 1e-6;
              return (
                <g key={`${c.lat},${c.lon}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={nearZero ? 3.5 : r}
                    fill={nearZero ? "transparent" : color}
                    stroke={nearZero ? "#8b1e1e" : "#1c2430"}
                    strokeWidth={nearZero ? 1.4 : 0.7}
                    opacity={nearZero ? 1 : 0.9}
                  >
                    <title>
                      ({c.lat}, {c.lon}): ${v.toFixed(4)}B · rank{" "}
                      {c.upstream_risk_rank ?? "—"} · {c.clusters.join(", ")}
                    </title>
                  </circle>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <p className="muted">
        Circle area shows magnitude. Hollow circles are near zero.
      </p>
    </div>
  );
}
