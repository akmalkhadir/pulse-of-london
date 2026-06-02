import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";
import type { Snapshot } from "@pulse/shared";
import type { Selection } from "./DetailPanel";
import type { LineFeatureCollection } from "../lib/geometry";
import { stationsToGeoJSON, lineColorById } from "../lib/map-data";

const LONDON: [number, number] = [-0.118, 51.509];
const UNKNOWN_LINE_COLOR = "#64748b";

/** Apply each line's status colour onto its geometry feature. */
function colourLines(geometry: LineFeatureCollection, lines: Snapshot["lines"]) {
  const colorById = lineColorById(lines);
  return {
    ...geometry,
    features: geometry.features.map((f) => ({
      ...f,
      properties: { ...f.properties, color: colorById[f.properties.lineId] ?? UNKNOWN_LINE_COLOR },
    })),
  };
}

export function MapView({ snapshot, onSelect }: { snapshot: Snapshot; onSelect: (s: Selection) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | undefined>(undefined);
  const loadedRef = useRef(false);
  const geometryRef = useRef<LineFeatureCollection | undefined>(undefined);
  // Keep latest props in refs so the init effect can stay [] and the click
  // handlers never go stale.
  const onSelectRef = useRef(onSelect);
  const snapshotRef = useRef(snapshot);
  onSelectRef.current = onSelect;
  snapshotRef.current = snapshot;

  // Initialise the map exactly once (client-only; MapLibre is dynamically imported).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        center: LONDON,
        zoom: 11,
        attributionControl: false,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b1120" } }],
        },
      });
      mapRef.current = map;

      map.on("load", async () => {
        if (cancelled) return;
        const geometry: LineFeatureCollection = await fetch("/data/geometry.geojson").then((r) => r.json());
        if (cancelled) return;
        geometryRef.current = geometry;
        const snap = snapshotRef.current;

        map.addSource("lines", { type: "geojson", data: colourLines(geometry, snap.lines) as GeoJSON.FeatureCollection });
        map.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": ["get", "color"], "line-width": 3 } });

        map.addSource("stations", { type: "geojson", data: stationsToGeoJSON(snap.stations) as GeoJSON.FeatureCollection });
        map.addLayer({
          id: "stations",
          type: "circle",
          source: "stations",
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["get", "radius"],
            "circle-stroke-color": "#0b1120",
            "circle-stroke-width": 1,
          },
        });

        map.on("click", "stations", (e) => {
          const naptan = e.features?.[0]?.properties?.naptan;
          if (typeof naptan === "string") onSelectRef.current({ kind: "station", naptan });
        });
        map.on("click", "lines", (e) => {
          const lineId = e.features?.[0]?.properties?.lineId;
          if (typeof lineId === "string") onSelectRef.current({ kind: "line", id: lineId });
        });

        loadedRef.current = true;
      });
    })();

    return () => {
      cancelled = true;
      loadedRef.current = false;
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, []);

  // Live updates: when the snapshot changes, update the source data in place
  // (no map rebuild → pan/zoom preserved).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const stations = map.getSource("stations") as GeoJSONSource | undefined;
    stations?.setData(stationsToGeoJSON(snapshot.stations) as GeoJSON.FeatureCollection);
    if (geometryRef.current) {
      const lines = map.getSource("lines") as GeoJSONSource | undefined;
      lines?.setData(colourLines(geometryRef.current, snapshot.lines) as GeoJSON.FeatureCollection);
    }
  }, [snapshot]);

  return (
    <div className="map">
      <div
        className="map__canvas"
        ref={containerRef}
        data-testid="map"
        role="img"
        aria-label="Map of London rail network coloured by how busy each station is versus usual. Use the list below for full details."
      />
    </div>
  );
}
