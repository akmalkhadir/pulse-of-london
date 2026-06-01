import { describe, expect, it } from "vitest";
import { crowdingAnomaly, median, aggregateLineCrowding, networkScore } from "../src/anomaly";
import type { StationSnapshot, LineSnapshot } from "@pulse/shared";

describe("crowdingAnomaly", () => {
  it("computes ratio + band when both values present", () => {
    expect(crowdingAnomaly(0.62, 0.48)).toEqual({ anomaly: 0.62 / 0.48, band: "busier" });
  });
  it("is unknown when live missing", () => {
    expect(crowdingAnomaly(null, 0.48)).toEqual({ anomaly: null, band: "unknown" });
  });
  it("is unknown when typical missing or zero", () => {
    expect(crowdingAnomaly(0.5, null)).toEqual({ anomaly: null, band: "unknown" });
    expect(crowdingAnomaly(0.5, 0)).toEqual({ anomaly: null, band: "unknown" });
  });
});

describe("median", () => {
  it("handles odd and even counts and ignores nulls", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([null, 2, null, 4])).toBe(3);
    expect(median([])).toBeNull();
    expect(median([null])).toBeNull();
  });
});

describe("aggregateLineCrowding", () => {
  it("medians the anomalies of a line's tube stations", () => {
    const stations: StationSnapshot[] = [
      stub("a", ["victoria"], 1.2),
      stub("b", ["victoria"], 1.6),
      stub("c", ["central"], 0.5),
    ];
    expect(aggregateLineCrowding("victoria", stations)).toBeCloseTo(1.4);
    expect(aggregateLineCrowding("waterloo-city", stations)).toBeNull();
  });
});

describe("networkScore", () => {
  it("summarises verdict, disrupted count, worst lines, headline", () => {
    const stations: StationSnapshot[] = [stub("a", ["victoria"], 1.5), stub("b", ["central"], 1.6)];
    const lines: LineSnapshot[] = [
      line("victoria", "Victoria", "good", 1.5),
      line("central", "Central", "severe", 1.6),
      line("circle", "Circle", "minor", null),
    ];
    const s = networkScore(stations, lines, new Date("2026-05-30T17:10:00Z"));
    expect(s.disruptedLineCount).toBe(2); // minor + severe
    expect(s.verdict).toBe("busier_than_usual");
    expect(s.worstLines).toContain("Central");
    expect(s.headline).toMatch(/busier than usual/i);
  });
});

function stub(naptan: string, lines: string[], anomaly: number): StationSnapshot {
  return {
    naptan, name: naptan, lat: 0, lon: 0, lines,
    live: 0.5, typical: 0.5 / anomaly, anomaly, anomalyBand: "busier", dataAvailable: true,
  };
}
function line(id: string, name: string, level: LineSnapshot["statusLevel"], crowd: number | null): LineSnapshot {
  return {
    id, name, mode: "tube", statusSeverity: level === "good" ? 10 : 6,
    statusDescription: level, statusLevel: level, disruptions: [], crowdingAnomaly: crowd,
  };
}
