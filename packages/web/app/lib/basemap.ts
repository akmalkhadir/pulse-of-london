import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

// Single self-hosted London vector basemap on R2 (no API key; R2 egress is free).
export const BASEMAP_PMTILES_URL =
  "https://pub-65d41e5468344746919009655cb3a516.r2.dev/basemap/london.pmtiles";

// Protomaps' public static font/sprite assets (no key). Could be moved to R2 later.
const ASSETS = "https://protomaps.github.io/basemaps-assets";

/** A dark Protomaps basemap style backed by a self-hosted pmtiles archive. */
export function basemapStyle(pmtilesUrl: string = BASEMAP_PMTILES_URL): StyleSpecification {
  return {
    version: 8,
    glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ASSETS}/sprites/v4/dark`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", namedFlavor("dark"), { lang: "en" }),
  };
}

/** Register the pmtiles:// protocol with MapLibre (call once, client-only). */
export async function registerPmtilesProtocol(): Promise<void> {
  const { Protocol } = await import("pmtiles");
  const { addProtocol } = await import("maplibre-gl");
  const protocol = new Protocol();
  addProtocol("pmtiles", protocol.tile);
}
