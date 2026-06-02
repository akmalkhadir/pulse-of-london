import { describe, expect, it } from "vitest";
import { sortLinesWorstFirst, sortStationsWorstFirst } from "../app/lib/sort";
import type { LineSnapshot, StationSnapshot } from "@pulse/shared";

const line = (id: string, level: LineSnapshot["statusLevel"], crowd: number | null): LineSnapshot => ({
  id, name: id, mode: "tube", statusSeverity: level === "good" ? 10 : 6,
  statusDescription: level, statusLevel: level, disruptions: [], crowdingAnomaly: crowd,
});

describe("sortLinesWorstFirst", () => {
  it("orders severe > minor > good, then by crowding desc", () => {
    const out = sortLinesWorstFirst([
      line("good-busy", "good", 1.5),
      line("severe", "severe", 1.0),
      line("minor", "minor", 1.0),
      line("good-quiet", "good", 0.5),
    ]);
    expect(out.map((l) => l.id)).toEqual(["severe", "minor", "good-busy", "good-quiet"]);
  });
  it("does not mutate the input", () => {
    const input = [line("a", "good", 1), line("b", "severe", 1)];
    sortLinesWorstFirst(input);
    expect(input[0]!.id).toBe("a");
  });
});

describe("sortStationsWorstFirst", () => {
  it("orders by anomaly desc, nulls last", () => {
    const st = (naptan: string, anomaly: number | null): StationSnapshot => ({
      naptan, name: naptan, lat: 0, lon: 0, lines: [], live: null, typical: null,
      anomaly, anomalyBand: anomaly === null ? "unknown" : "busier", dataAvailable: anomaly !== null,
    });
    const out = sortStationsWorstFirst([st("a", 1.2), st("b", null), st("c", 1.9)]);
    expect(out.map((s) => s.naptan)).toEqual(["c", "a", "b"]);
  });
});
