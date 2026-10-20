// This module is imported ONLY via dynamic import() from MapView's client effect,
// so the pmtiles import in registerPmtilesProtocol rides in a lazy client chunk and
// is never evaluated on the workerd SSR path.
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import { MAP_COLORS } from "./colors";

// Single self-hosted London vector basemap on R2 (no API key; R2 egress is free).
export const BASEMAP_PMTILES_URL =
  "https://pub-65d41e5468344746919009655cb3a516.r2.dev/basemap/london.pmtiles";

// Protomaps' public glyphs (no key). No sprite: this style draws no icons.
const GLYPHS = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";

const placeName: ExpressionSpecification = ["coalesce", ["get", "name:en"], ["get", "name"]];

/**
 * The board's own diagram rather than a street map: housing-black ground, the Thames
 * as a faint ink ribbon, and a few dim area names for orientation. The lit network
 * and stations are layered on top by MapView.
 */
export function basemapStyle(pmtilesUrl: string = BASEMAP_PMTILES_URL): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": MAP_COLORS.housing } },
      {
        id: "water",
        type: "fill",
        source: "protomaps",
        "source-layer": "water",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": MAP_COLORS.water },
      },
      {
        id: "places-locality",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        filter: ["==", ["get", "kind"], "locality"],
        layout: {
          "text-field": placeName,
          "text-font": ["Noto Sans Medium"],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.14,
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 12],
          "symbol-sort-key": ["coalesce", ["get", "min_zoom"], 99],
          "text-padding": 12,
        },
        paint: { "text-color": MAP_COLORS.place, "text-halo-color": MAP_COLORS.housing, "text-halo-width": 1.5 },
      },
      {
        id: "places-neighbourhood",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 12.5,
        filter: ["in", ["get", "kind"], ["literal", ["neighbourhood", "macrohood"]]],
        layout: {
          "text-field": placeName,
          "text-font": ["Noto Sans Medium"],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.14,
          "text-size": 10,
          "symbol-sort-key": ["coalesce", ["get", "min_zoom"], 99],
          "text-padding": 12,
        },
        paint: { "text-color": MAP_COLORS.placeMinor, "text-halo-color": MAP_COLORS.housing, "text-halo-width": 1.5 },
      },
    ],
  };
}

/** Register the pmtiles:// protocol with MapLibre (call once, client-only). */
export async function registerPmtilesProtocol(): Promise<void> {
  const { Protocol } = await import("pmtiles");
  // maplibre-gl is a single bundler-deduped module, so this named `addProtocol`
  // registers into the same global registry MapView's map instance reads from
  // (MapView awaits its own maplibre-gl import before calling this, so no race).
  const { addProtocol } = await import("maplibre-gl");
  const protocol = new Protocol();
  addProtocol("pmtiles", protocol.tile);
}
