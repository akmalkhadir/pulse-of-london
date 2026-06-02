import { describe, expect, it } from "vitest";
import { describeAnomaly, relativeAge, computeStaleness } from "../app/lib/format";

describe("describeAnomaly", () => {
  it("renders a human phrase from band + ratio", () => {
    expect(describeAnomaly("much_busier", 1.8)).toBe("80% busier than usual");
    expect(describeAnomaly("busier", 1.29)).toBe("29% busier than usual");
    expect(describeAnomaly("much_quieter", 0.55)).toBe("45% quieter than usual");
    expect(describeAnomaly("normal", 1.02)).toBe("about as busy as usual");
  });
  it("handles unknown / null ratio", () => {
    expect(describeAnomaly("unknown", null)).toBe("no live data");
    expect(describeAnomaly("busier", null)).toBe("no live data");
  });
});

describe("relativeAge", () => {
  it("formats seconds into a short label", () => {
    expect(relativeAge(5)).toBe("just now");
    expect(relativeAge(45)).toBe("45s ago");
    expect(relativeAge(90)).toBe("1 min ago");
    expect(relativeAge(600)).toBe("10 min ago");
    expect(relativeAge(7200)).toBe("2 hr ago");
  });
});

describe("computeStaleness", () => {
  it("is fresh under the threshold, stale over it", () => {
    const now = new Date("2026-05-30T17:15:00.000Z");
    const fresh = computeStaleness("2026-05-30T17:14:00.000Z", now); // 60s
    expect(fresh.isStale).toBe(false);
    expect(fresh.ageSec).toBe(60);
    const stale = computeStaleness("2026-05-30T16:50:00.000Z", now); // 1500s > 900
    expect(stale.isStale).toBe(true);
    expect(stale.label).toBe("25 min ago");
  });
  it("treats an unparseable timestamp as stale", () => {
    const now = new Date("2026-05-30T17:15:00.000Z");
    expect(computeStaleness("not-a-date", now).isStale).toBe(true);
  });
});
