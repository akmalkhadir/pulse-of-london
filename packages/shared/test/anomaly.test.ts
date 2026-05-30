import { describe, expect, it } from "vitest";
import { classifyAnomaly, ANOMALY_THRESHOLDS } from "../src/anomaly";

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
