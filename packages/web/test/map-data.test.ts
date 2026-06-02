import { describe, expect, it } from "vitest";
import { stationsToGeoJSON, lineColorById } from "../app/lib/map-data";
import { sampleSnapshot } from "../app/fixtures/sample-snapshot";
import { bandColor, statusColor } from "../app/lib/colors";

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
    expect(ksx.properties.radius).toBe(4);
  });
});

describe("lineColorById", () => {
  it("maps each line id to its status colour", () => {
    const map = lineColorById(sampleSnapshot.lines);
    expect(map.central).toBe(statusColor("severe"));
    expect(map.victoria).toBe(statusColor("good"));
    expect(map.circle).toBe(statusColor("minor"));
  });
});
