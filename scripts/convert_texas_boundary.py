"""One-time conversion: Census cousub shapefile → dissolved Texas GeoJSON.

Usage (from repo, with pyshp + shapely installed):
  python simulation/scripts/convert_texas_boundary.py
"""
from __future__ import annotations

import json
from pathlib import Path

import shapefile
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "source" / "texas-county-subdivisions" / "cb_2018_48_cousub_500k"
OUT = Path(__file__).resolve().parents[1] / "public" / "data" / "texas-boundary.geojson"


def main() -> None:
    reader = shapefile.Reader(str(SRC))
    geoms = [
        shape(sr.shape.__geo_interface__)
        for sr in reader.iterShapeRecords()
        if not shape(sr.shape.__geo_interface__).is_empty
    ]
    simplified = unary_union(geoms).simplify(0.01, preserve_topology=True)
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Texas",
                    "source": "cb_2018_48_cousub_500k dissolved+simplified",
                },
                "geometry": mapping(simplified),
            }
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fc, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
