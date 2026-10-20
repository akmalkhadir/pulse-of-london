import { describe, expect, it } from "vitest";
import {
  describeAnomaly,
  relativeAge,
  computeStaleness,
  signedPercent,
  ordinal,
  verdictTitle,
  londonClock,
  londonTime,
  londonWeekdayName,
  isOvernight,
} from "../app/lib/format";

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

describe("signedPercent", () => {
  it("renders a signed board figure with a true minus sign", () => {
    expect(signedPercent(1.8)).toBe("+80%");
    expect(signedPercent(0.55)).toBe("−45%");
    expect(signedPercent(1.004)).toBe("±0%");
    expect(signedPercent(null)).toBe("—");
  });
});

describe("ordinal", () => {
  it("ranks like a departure board", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th",
    ]);
  });
});

describe("verdictTitle", () => {
  it("names each network verdict", () => {
    expect(verdictTitle("busier_than_usual")).toBe("Busier than usual");
    expect(verdictTitle("quieter_than_usual")).toBe("Quieter than usual");
    expect(verdictTitle("typical")).toBe("About normal");
  });
});

describe("London clock helpers", () => {
  it("formats London wall-clock time across BST and GMT", () => {
    expect(londonClock(new Date("2026-06-03T08:05:09Z"))).toBe("09:05:09"); // BST
    expect(londonClock(new Date("2026-12-03T08:05:09Z"))).toBe("08:05:09"); // GMT
    expect(londonTime(new Date("2026-06-03T20:59:30Z"))).toBe("21:59");
    expect(londonWeekdayName(new Date("2026-05-30T23:30:00Z"))).toBe("Sunday"); // 00:30 BST next day
  });
  it("treats 22:00–06:00 London as overnight", () => {
    expect(isOvernight(new Date("2026-06-03T21:30:00Z"))).toBe(true); // 22:30 BST
    expect(isOvernight(new Date("2026-06-03T04:30:00Z"))).toBe(true); // 05:30 BST
    expect(isOvernight(new Date("2026-06-03T05:30:00Z"))).toBe(false); // 06:30 BST
    expect(isOvernight(new Date("2026-06-03T20:30:00Z"))).toBe(false); // 21:30 BST
  });
});
