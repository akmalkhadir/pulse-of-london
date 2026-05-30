import { describe, expect, it } from "vitest";
import { classifyAnomaly, ANOMALY_THRESHOLDS } from "../src/anomaly";
import { classifyStatus } from "../src/anomaly";

describe("classifyAnomaly", () => {
  it.each([
    [0.3, "much_quieter"],
    [0.59, "much_quieter"],
    [0.6, "quieter"],
    [0.84, "quieter"],
    [0.85, "normal"],
    [1.0, "normal"],
    [1.15, "normal"],
    [1.16, "busier"],
    [1.4, "busier"],
    [1.41, "much_busier"],
    [3.0, "much_busier"],
  ] as const)("maps ratio %s → %s", (ratio, band) => {
    expect(classifyAnomaly(ratio)).toBe(band);
  });

  it("returns unknown for null / non-finite", () => {
    expect(classifyAnomaly(null)).toBe("unknown");
    expect(classifyAnomaly(Number.NaN)).toBe("unknown");
    expect(classifyAnomaly(Number.POSITIVE_INFINITY)).toBe("unknown");
  });

  it("exposes thresholds", () => {
    expect(ANOMALY_THRESHOLDS.muchBusier).toBe(1.4);
  });
});

describe("classifyStatus", () => {
  it.each([
    [10, "good"],
    [18, "good"],
    [9, "minor"],
    [6, "severe"],
    [4, "severe"],
    [0, "severe"],
    [20, "severe"],
  ] as const)("maps severity %s → %s", (sev, level) => {
    expect(classifyStatus(sev)).toBe(level);
  });

  it("returns unknown for null/undefined/NaN", () => {
    expect(classifyStatus(null)).toBe("unknown");
    expect(classifyStatus(undefined)).toBe("unknown");
    expect(classifyStatus(Number.NaN)).toBe("unknown");
  });
});
