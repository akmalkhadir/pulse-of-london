import { describe, expect, it } from "vitest";
import { stationsToGeoJSON, lineLevelById, lineKeyFor, PIXEL_RADIUS } from "../app/lib/map-data";
import { sampleSnapshot } from "../app/fixtures/sample-snapshot";
import { bandColor } from "../app/lib/colors";

describe("stationsToGeoJSON", () => {
  it("builds a point FeatureCollection with colour + radius + label props", () => {
    const fc = stationsToGeoJSON(sampleSnapshot.stations);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(sampleSnapshot.stations.length);
    const oxc = fc.features.find((f) => f.properties.naptan === "940GZZLUOXC")!;
    expect(oxc.geometry.coordinates).toEqual([-0.1417, 51.515]);
    expect(oxc.properties.color).toBe(bandColor("much_busier"));
    expect(oxc.properties.radius).toBeGreaterThan(fc.features.find((f) => f.properties.naptan === "940GZZLUVIC")!.properties.radius);
  });
  it("gives no-data stations the unknown colour and the base radius", () => {
    const fc = stationsToGeoJSON(sampleSnapshot.stations);
    const ksx = fc.features.find((f) => f.properties.naptan === "940GZZLUKSX")!;
    expect(ksx.properties.color).toBe(bandColor("unknown"));
    expect(ksx.properties.radius).toBe(PIXEL_RADIUS);
    expect(ksx.properties.hollow).toBe(true);
    expect(fc.features.find((f) => f.properties.naptan === "940GZZLUOXC")!.properties.hollow).toBe(false);
  });
  it("keeps normal stations as small pixels and grows only unusual ones", () => {
    const fc = stationsToGeoJSON([
      { ...sampleSnapshot.stations[0]!, naptan: "N", anomaly: 1.1, anomalyBand: "normal" },
      { ...sampleSnapshot.stations[0]!, naptan: "B", anomaly: 1.2, anomalyBand: "busier" },
      { ...sampleSnapshot.stations[0]!, naptan: "Q", anomaly: 0.5, anomalyBand: "much_quieter" },
    ]);
    const r = Object.fromEntries(fc.features.map((f) => [f.properties.naptan, f.properties.radius]));
    expect(r.N).toBe(PIXEL_RADIUS);
    expect(r.B).toBeGreaterThan(PIXEL_RADIUS);
    expect(r.Q).toBeGreaterThan(r.B!);
  });
  it("encodes line membership as a delimited key the map can match", () => {
    const fc = stationsToGeoJSON(sampleSnapshot.stations);
    const oxc = fc.features.find((f) => f.properties.naptan === "940GZZLUOXC")!;
    expect(oxc.properties.lineKey).toContain(lineKeyFor("central"));
    expect(oxc.properties.lineKey).toContain(lineKeyFor("victoria"));
    expect(oxc.properties.lineKey).not.toContain(lineKeyFor("circle"));
  });
});

describe("lineLevelById", () => {
  it("maps each line id to its status level", () => {
    const map = lineLevelById(sampleSnapshot.lines);
    expect(map.central).toBe("severe");
    expect(map.victoria).toBe("good");
    expect(map.circle).toBe("minor");
  });
});
