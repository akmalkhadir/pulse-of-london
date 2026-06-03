import { describe, expect, it } from "vitest";
import { basemapStyle } from "../app/lib/basemap";

describe("basemapStyle", () => {
  it("points the vector source at the pmtiles:// url", () => {
    const style = basemapStyle("https://cdn.example/london.pmtiles");
    const src = style.sources.protomaps as { type: string; url: string; attribution?: string };
    expect(src.type).toBe("vector");
    expect(src.url).toBe("pmtiles://https://cdn.example/london.pmtiles");
  });

  it("declares OSM attribution and a non-empty layer list", () => {
    const style = basemapStyle("https://cdn.example/london.pmtiles");
    const src = style.sources.protomaps as { attribution?: string };
    expect(src.attribution).toContain("OpenStreetMap");
    expect(Array.isArray(style.layers)).toBe(true);
    expect(style.layers.length).toBeGreaterThan(0);
  });
});
