import { useEffect, useRef } from "react";
import type { ExpressionSpecification, GeoJSONSource, LngLatBoundsLike, Map as MaplibreMap } from "maplibre-gl";
import type { Snapshot } from "@pulse/shared";
import type { Selection } from "../lib/selection";
import type { LineFeatureCollection } from "../lib/geometry";
import { stationsToGeoJSON, lineLevelById, lineKeyFor } from "../lib/map-data";
import { BAND_COLORS, MAP_COLORS, STATUS_COLORS } from "../lib/colors";
import { MapKey } from "./MapKey";

const LONDON: [number, number] = [-0.118, 51.509];
// The pmtiles archive only covers Greater London; don't let the view drift off it.
const LONDON_BOUNDS: LngLatBoundsLike = [[-0.8, 51.2], [0.6, 51.8]];
const HOUSING = MAP_COLORS.housing;
const CORRIDOR = MAP_COLORS.corridor;
// Line widths scale with zoom so the diagram stays fine at city scale and legible up close.
const zoomWidth = (w10: number, w14: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 10, w10, 14, w14];
const LINE_LAYERS = ["lines-good", "lines-minor", "lines-severe-glow", "lines-severe"] as const;
const SEVERE_GLOW_OPACITY = 0.3;
const MAP_DESCRIPTION =
  "Map of London's rail network. Stations are coloured by how busy they are compared with a typical day at this time; disrupted lines are lit amber. The boards list everything on the map.";

/** Stamp each line's status level onto its geometry feature. */
function levelLines(geometry: LineFeatureCollection, lines: Snapshot["lines"]) {
  const levelById = lineLevelById(lines);
  return {
    ...geometry,
    features: geometry.features.map((f) => ({
      ...f,
      properties: { ...f.properties, level: levelById[f.properties.lineId] ?? "unknown" },
    })),
  };
}

function reducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface Props {
  snapshot: Snapshot;
  selection: Selection;
  onSelect: (s: Selection) => void;
}

export function MapView({ snapshot, selection, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | undefined>(undefined);
  const loadedRef = useRef(false);
  const geometryRef = useRef<LineFeatureCollection | undefined>(undefined);
  // Keep latest props in refs so the init effect can stay [] and handlers never go stale.
  const onSelectRef = useRef(onSelect);
  const snapshotRef = useRef(snapshot);
  const selectionRef = useRef(selection);
  onSelectRef.current = onSelect;
  snapshotRef.current = snapshot;
  selectionRef.current = selection;

  // Initialise the map exactly once (client-only; MapLibre is dynamically imported).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      const { basemapStyle, registerPmtilesProtocol } = await import("../lib/basemap");
      if (cancelled || !containerRef.current) return;

      await registerPmtilesProtocol();
      if (cancelled || !containerRef.current) return;

      const narrow = containerRef.current.clientWidth < 640;
      const coarse = matchMedia("(pointer: coarse)").matches;
      const map = new maplibregl.Map({
        container: containerRef.current,
        center: LONDON,
        zoom: narrow ? 10.3 : 11,
        minZoom: 9,
        maxBounds: LONDON_BOUNDS,
        attributionControl: { compact: true },
        // On touch, one finger scrolls the page and two move the map, so the map can't trap the scroll.
        cooperativeGestures: coarse,
        style: basemapStyle(),
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      // Keep the canvas out of the tab order: the boards are the full keyboard equivalent (WCAG 2.2 AA).
      // The description lives on the canvas itself, so the zoom buttons beside it stay in the accessibility tree.
      const canvas = map.getCanvas();
      canvas.setAttribute("tabindex", "-1");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", MAP_DESCRIPTION);

      map.on("load", async () => {
        if (cancelled) return;
        const geometry: LineFeatureCollection = await fetch("/data/geometry.geojson").then((r) => r.json());
        if (cancelled) return;
        geometryRef.current = geometry;
        const snap = snapshotRef.current;

        map.addSource("lines", { type: "geojson", data: levelLines(geometry, snap.lines) as GeoJSON.FeatureCollection });
        const level = (levels: string[]): ExpressionSpecification => ["in", ["get", "level"], ["literal", levels]];
        map.addLayer({ id: "lines-casing", type: "line", source: "lines", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": HOUSING, "line-width": zoomWidth(4, 7) } });
        map.addLayer({ id: "lines-good", type: "line", source: "lines", filter: level(["good", "unknown"]), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": STATUS_COLORS.good, "line-width": zoomWidth(1.25, 2.5) } });
        map.addLayer({ id: "lines-minor", type: "line", source: "lines", filter: level(["minor"]), layout: { "line-join": "round" }, paint: { "line-color": STATUS_COLORS.minor, "line-width": zoomWidth(2, 3.5), "line-dasharray": [2, 1.5] } });
        map.addLayer({ id: "lines-severe-glow", type: "line", source: "lines", filter: level(["severe"]), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": STATUS_COLORS.severe, "line-width": zoomWidth(8, 14), "line-blur": zoomWidth(6, 10), "line-opacity": SEVERE_GLOW_OPACITY } });
        map.addLayer({ id: "lines-severe", type: "line", source: "lines", filter: level(["severe"]), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": STATUS_COLORS.severe, "line-width": zoomWidth(2.5, 4.5) } });
        map.addLayer({ id: "line-selected-glow", type: "line", source: "lines", filter: ["==", ["get", "lineId"], ""], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": CORRIDOR, "line-width": zoomWidth(10, 16), "line-blur": zoomWidth(8, 12), "line-opacity": 0.28 } });
        map.addLayer({ id: "line-selected", type: "line", source: "lines", filter: ["==", ["get", "lineId"], ""], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": CORRIDOR, "line-width": zoomWidth(3, 5) } });
        // Wide, invisible hit target so thin lines are easy to tap.
        map.addLayer({ id: "lines-hit", type: "line", source: "lines", paint: { "line-color": "#000", "line-width": 16, "line-opacity": 0 } });

        map.addSource("stations", { type: "geojson", data: stationsToGeoJSON(snap.stations) as GeoJSON.FeatureCollection });
        // Stations are LED pixels: normal ones stay tiny; unusual ones grow, and the "much" bands bloom.
        // MapLibre only allows zoom at the top of an expression, so each variant is its own interpolate.
        const zoomRadius = (scale = 1, add = 0): ExpressionSpecification => [
          "interpolate", ["linear"], ["zoom"],
          10, ["+", ["*", ["get", "radius"], 0.85 * scale], add],
          14, ["+", ["*", ["get", "radius"], 1.5 * scale], add],
        ];
        const radius = zoomRadius();
        map.addLayer({
          id: "stations-bloom",
          type: "circle",
          source: "stations",
          filter: ["in", ["get", "anomalyBand"], ["literal", ["much_busier", "much_quieter"]]],
          paint: { "circle-color": ["get", "color"], "circle-radius": zoomRadius(2.2), "circle-blur": 1, "circle-opacity": 0.35 },
        });
        map.addLayer({
          id: "stations",
          type: "circle",
          source: "stations",
          paint: {
            "circle-color": ["case", ["get", "hollow"], HOUSING, ["get", "color"]],
            "circle-radius": radius,
            "circle-stroke-color": ["case", ["get", "hollow"], BAND_COLORS.unknown, HOUSING],
            "circle-stroke-width": ["case", ["get", "hollow"], 1.25, 1],
          },
        });
        map.addLayer({
          id: "station-selected",
          type: "circle",
          source: "stations",
          filter: ["==", ["get", "naptan"], ""],
          paint: {
            "circle-color": "rgba(0,0,0,0)",
            "circle-radius": zoomRadius(1, 5),
            "circle-stroke-color": CORRIDOR,
            "circle-stroke-width": 2.5,
          },
        });
        // Disrupted lines carry their name along the line, so "my line" is findable without tapping.
        // They sit above the station dots, so dense central stretches stay readable.
        map.addLayer({
          id: "line-labels",
          type: "symbol",
          source: "lines",
          filter: level(["minor", "severe"]),
          layout: {
            "symbol-placement": "line-center",
            "text-field": ["get", "lineName"],
            "text-font": ["Noto Sans Medium"],
            "text-size": 12,
            "text-letter-spacing": 0.04,
          },
          paint: { "text-color": STATUS_COLORS.severe, "text-halo-color": HOUSING, "text-halo-width": 2 },
        });

        map.addLayer({
          id: "station-labels",
          type: "symbol",
          source: "stations",
          minzoom: 12.5,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Medium"],
            "text-size": 12,
            "text-offset": [0, 1.1],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: { "text-color": MAP_COLORS.stationLabel, "text-halo-color": HOUSING, "text-halo-width": 1.5 },
        });
        map.addLayer({
          id: "station-selected-label",
          type: "symbol",
          source: "stations",
          filter: ["==", ["get", "naptan"], ""],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Medium"],
            "text-size": 13,
            "text-offset": [0, 1.3],
            "text-anchor": "top",
            "text-allow-overlap": true,
          },
          paint: { "text-color": CORRIDOR, "text-halo-color": HOUSING, "text-halo-width": 2 },
        });

        // Area names keep placement priority over line names and are never sliced by line casings.
        for (const id of ["places-locality", "places-neighbourhood"]) map.moveLayer(id, "station-labels");

        map.on("click", (e) => {
          const hits = map.queryRenderedFeatures(e.point, { layers: ["stations", "lines-hit"] });
          const station = hits.find((f) => f.layer.id === "stations");
          const naptan = station?.properties?.naptan;
          if (typeof naptan === "string") return onSelectRef.current({ kind: "station", naptan, from: "map" });
          const lineId = hits.find((f) => f.layer.id === "lines-hit")?.properties?.lineId;
          if (typeof lineId === "string") onSelectRef.current({ kind: "line", id: lineId, from: "map" });
        });
        for (const layer of ["stations", "lines-hit"]) {
          map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
        }

        loadedRef.current = true;
        applySelection(map, selectionRef.current);
      });
    })();

    return () => {
      cancelled = true;
      loadedRef.current = false;
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, []);

  // Live updates: update the source data in place (no map rebuild → pan/zoom preserved).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource("stations") as GeoJSONSource | undefined)?.setData(stationsToGeoJSON(snapshot.stations) as GeoJSON.FeatureCollection);
    if (geometryRef.current) {
      (map.getSource("lines") as GeoJSONSource | undefined)?.setData(levelLines(geometryRef.current, snapshot.lines) as GeoJSON.FeatureCollection);
    }
  }, [snapshot]);

  // Selection: focus the corridor or ring the station; board picks also bring it into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applySelection(map, selection);
    if (selection?.from !== "board") return;
    const duration = reducedMotion() ? 0 : 700;
    // On desktop the detail card floats over the map's top-left; keep the target clear of it.
    const padding = window.innerWidth >= 1024 ? { top: 40, bottom: 120, left: 440, right: 40 } : 40;
    if (selection.kind === "station") {
      const st = snapshotRef.current.stations.find((s) => s.naptan === selection.naptan);
      if (st) map.easeTo({ center: [st.lon, st.lat], zoom: Math.max(map.getZoom(), 13), padding, duration });
    } else if (geometryRef.current) {
      const coords = geometryRef.current.features.filter((f) => f.properties.lineId === selection.id).flatMap((f) => f.geometry.coordinates);
      if (coords.length > 0) {
        const lons = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding, duration, maxZoom: 13 });
      }
    }
  }, [selection]);

  return (
    <section className="mapframe" aria-label="Network map">
      <div className="map__canvas" ref={containerRef} data-testid="map" />
      <MapKey />
    </section>
  );
}

function applySelection(map: MaplibreMap, selection: Selection) {
  const lineId = selection?.kind === "line" ? selection.id : "";
  const naptan = selection?.kind === "station" ? selection.naptan : "";
  map.setFilter("line-selected", ["==", ["get", "lineId"], lineId]);
  map.setFilter("line-selected-glow", ["==", ["get", "lineId"], lineId]);
  map.setFilter("station-selected", ["==", ["get", "naptan"], naptan]);
  map.setFilter("station-selected-label", ["==", ["get", "naptan"], naptan]);
  const lineOpacity: ExpressionSpecification | number = lineId ? ["case", ["==", ["get", "lineId"], lineId], 1, 0.3] : 1;
  for (const id of LINE_LAYERS) {
    const base = id === "lines-severe-glow" ? SEVERE_GLOW_OPACITY : 1;
    map.setPaintProperty(id, "line-opacity", typeof lineOpacity === "number" ? base : ["*", base, lineOpacity]);
  }
  map.setPaintProperty("line-labels", "text-opacity", lineId ? ["case", ["==", ["get", "lineId"], lineId], 1, 0.3] : 1);
  map.setPaintProperty("stations", "circle-opacity", lineId ? ["case", ["in", lineKeyFor(lineId), ["get", "lineKey"]], 1, 0.25] : 1);
  map.setPaintProperty("stations", "circle-stroke-opacity", lineId ? ["case", ["in", lineKeyFor(lineId), ["get", "lineKey"]], 1, 0.25] : 1);
  map.setPaintProperty("stations-bloom", "circle-opacity", lineId ? ["case", ["in", lineKeyFor(lineId), ["get", "lineKey"]], 0.35, 0.08] : 0.35);
}
