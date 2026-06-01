import { describe, expect, it } from "vitest";
import { londonWeekday, londonBand } from "../src/time";

describe("london time helpers", () => {
  it("returns the 3-letter weekday in London time", () => {
    // 2026-05-30 is a Saturday
    expect(londonWeekday(new Date("2026-05-30T12:00:00Z"))).toBe("Sat");
  });

  it("buckets a time into a 15-min band 'HH:MM'", () => {
    expect(londonBand(new Date("2026-05-30T17:10:00Z"))).toBe("18:00"); // BST = UTC+1
    expect(londonBand(new Date("2026-05-30T17:20:00Z"))).toBe("18:15");
  });

  it("handles GMT (winter) offset", () => {
    expect(londonBand(new Date("2026-01-15T08:05:00Z"))).toBe("08:00"); // GMT = UTC
  });
});
