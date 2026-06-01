import { describe, expect, it } from "vitest";
import { buildSnapshot, type BuildInput } from "../src/builder";
import { SCHEMA_VERSION } from "@pulse/shared";

const now = new Date("2026-05-30T17:10:00Z"); // Sat, BST band 18:00

const input: BuildInput = {
  now,
  statusFetchedAt: new Date("2026-05-30T17:09:30Z"),
  crowdingFetchedAt: new Date("2026-05-30T17:08:00Z"),
  lines: [
    { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
    { id: "central", name: "Central", mode: "tube", statusSeverity: 6, statusDescription: "Severe Delays", disruptions: [{ category: "RealTime", description: "Signal failure." }] },
    { id: "london-overground", name: "London Overground", mode: "overground", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
  ],
  stations: [
    { naptan: "VIC", name: "Victoria", lat: 51.49, lon: -0.14, lines: ["victoria"], live: 0.62, typical: 0.48 },
    { naptan: "OXC", name: "Oxford Circus", lat: 51.51, lon: -0.14, lines: ["victoria", "central"], live: 0.9, typical: 0.5 },
    { naptan: "DARK", name: "No Data", lat: 51.5, lon: -0.1, lines: ["central"], live: null, typical: null },
  ],
};

describe("buildSnapshot", () => {
  it("produces a versioned snapshot with computed bands + freshness", () => {
    const snap = buildSnapshot(input);
    expect(snap.schemaVersion).toBe(SCHEMA_VERSION);
    expect(snap.generatedAt).toBe("2026-05-30T17:10:00.000Z");
    expect(snap.freshness.statusAgeSec).toBe(30);
    expect(snap.freshness.crowdingAgeSec).toBe(120);

    const vic = snap.stations.find((s) => s.naptan === "VIC")!;
    expect(vic.anomalyBand).toBe("busier"); // 0.62/0.48 ≈ 1.29
    const dark = snap.stations.find((s) => s.naptan === "DARK")!;
    expect(dark.anomalyBand).toBe("unknown");
    expect(dark.dataAvailable).toBe(false);

    const central = snap.lines.find((l) => l.id === "central")!;
    expect(central.statusLevel).toBe("severe");
    expect(central.crowdingAnomaly).toBeCloseTo(0.9 / 0.5); // only OXC on central has data

    const overground = snap.lines.find((l) => l.id === "london-overground")!;
    expect(overground.crowdingAnomaly).toBeNull(); // non-tube → no crowding

    expect(snap.network.verdict).toBe("busier_than_usual");
  });
});
