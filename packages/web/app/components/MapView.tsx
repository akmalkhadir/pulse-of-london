import { useEffect, useRef } from "react";
import type { Snapshot } from "@pulse/shared";
import type { Selection } from "./DetailPanel";
import type { LineFeatureCollection } from "../lib/geometry";
import { stationsToGeoJSON, lineColorById } from "../lib/map-data";

const LONDON: [number, number] = [-0.118, 51.509];

export function MapView({ snapshot, onSelect }: { snapshot: Snapshot; onSelect: (s: Selection) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
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

      map.on("load", async () => {
        if (!map) return;
        const geometry: LineFeatureCollection = await fetch("/data/geometry.geojson").then((r) => r.json());
        const colorById = lineColorById(snapshot.lines);
        // Colour each line feature by its status; default neutral if unknown.
        const colored = {
          ...geometry,
          features: geometry.features.map((f) => ({
            ...f,
            properties: { ...f.properties, color: colorById[f.properties.lineId] ?? "#64748B" },
          })),
        };
        map.addSource("lines", { type: "geojson", data: colored as GeoJSON.FeatureCollection });
        map.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": ["get", "color"], "line-width": 3 } });

        map.addSource("stations", { type: "geojson", data: stationsToGeoJSON(snapshot.stations) as GeoJSON.FeatureCollection });
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
          if (typeof naptan === "string") onSelect({ kind: "station", naptan });
        });
        map.on("click", "lines", (e) => {
          const lineId = e.features?.[0]?.properties?.lineId;
          if (typeof lineId === "string") onSelect({ kind: "line", id: lineId });
        });
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [snapshot, onSelect]);

  return (
    <div className="map">
      <div className="map__canvas" ref={containerRef} data-testid="map" role="img" aria-label="Map of London rail network coloured by how busy each station is versus usual. Use the list below for full details." />
    </div>
  );
}
