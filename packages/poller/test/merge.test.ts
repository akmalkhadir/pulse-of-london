import { describe, expect, it } from "vitest";
import type { Snapshot } from "@pulse/shared";
import type { DomainStation, DomainLineStatus } from "@pulse/ingestor";
import { mergeStationInputs, linesInput, type FreshStation } from "../src/merge";

const station = (naptan: string): DomainStation => ({
  naptan, name: naptan, lat: 51.5, lon: -0.1, lines: ["x"],
});

const prevSnapshot = (): Snapshot => ({
  schemaVersion: 1,
  generatedAt: "2026-06-03T10:00:00.000Z",
  freshness: { statusAgeSec: 0, crowdingAgeSec: 0 },
  network: { crowdingAnomaly: null, disruptedLineCount: 0, verdict: "typical", headline: "", worstLines: [] },
  lines: [
    { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 5, statusDescription: "Minor Delays", statusLevel: "minor", disruptions: [{ category: "C", description: "D" }], crowdingAnomaly: null },
  ],
  stations: [
    { naptan: "A", name: "A", lat: 51.5, lon: -0.1, lines: ["x"], live: 0.9, typical: 0.5, anomaly: 1.8, anomalyBand: "much_busier", dataAvailable: true },
    { naptan: "B", name: "B", lat: 51.5, lon: -0.1, lines: ["x"], live: 0.4, typical: 0.5, anomaly: 0.8, anomalyBand: "normal", dataAvailable: true },
  ],
});

describe("mergeStationInputs", () => {
  it("uses fresh values for shard stations and previous values otherwise", () => {
    const all = [station("A"), station("B")];
    const fresh = new Map<string, FreshStation>([["A", { naptan: "A", live: 0.2, typical: 0.5 }]]);
    const out = mergeStationInputs(all, prevSnapshot(), fresh);
    expect(out.find((s) => s.naptan === "A")).toMatchObject({ live: 0.2, typical: 0.5 });
    expect(out.find((s) => s.naptan === "B")).toMatchObject({ live: 0.4, typical: 0.5 }); // from prev
  });

  it("includes never-seen stations with null live/typical", () => {
    const all = [station("A"), station("C")];
    const out = mergeStationInputs(all, prevSnapshot(), new Map());
    expect(out.find((s) => s.naptan === "C")).toMatchObject({ live: null, typical: null });
    expect(out).toHaveLength(2);
  });

  it("works with no previous snapshot (all from fresh or null)", () => {
    const all = [station("A")];
    const fresh = new Map<string, FreshStation>([["A", { naptan: "A", live: 0.3, typical: null }]]);
    const out = mergeStationInputs(all, null, fresh);
    expect(out[0]).toMatchObject({ naptan: "A", name: "A", lat: 51.5, lon: -0.1, live: 0.3, typical: null });
  });
});

describe("linesInput", () => {
  it("passes fresh line status straight through", () => {
    const fresh: DomainLineStatus[] = [
      { id: "v", name: "V", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
    ];
    expect(linesInput(fresh, null)).toEqual(fresh);
  });

  it("falls back to the previous snapshot's lines when fresh is empty", () => {
    const out = linesInput([], prevSnapshot());
    expect(out).toEqual([
      { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 5, statusDescription: "Minor Delays", disruptions: [{ category: "C", description: "D" }] },
    ]);
  });

  it("returns empty when fresh is empty and there is no previous", () => {
    expect(linesInput([], null)).toEqual([]);
  });
});
