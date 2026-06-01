import { describe, expect, it, vi } from "vitest";
import { TypicalBaselineStore } from "../src/baseline";

describe("TypicalBaselineStore", () => {
  it("fetches a station's bands once per weekday and caches them", async () => {
    const fetchTypical = vi.fn(async () => ({ "18:00": 0.48, "18:15": 0.51 }));
    const store = new TypicalBaselineStore(fetchTypical);

    expect(await store.typicalFor("940GZZLUVIC", "Sat", "18:00")).toBe(0.48);
    expect(await store.typicalFor("940GZZLUVIC", "Sat", "18:15")).toBe(0.51);
    expect(fetchTypical).toHaveBeenCalledTimes(1); // cached after first lookup
  });

  it("returns null for an unknown band", async () => {
    const fetchTypical = vi.fn(async () => ({ "18:00": 0.48 }));
    const store = new TypicalBaselineStore(fetchTypical);
    expect(await store.typicalFor("X", "Sat", "03:00")).toBeNull();
  });

  it("returns null and does not throw if the fetch fails", async () => {
    const fetchTypical = vi.fn(async () => {
      throw new Error("boom");
    });
    const store = new TypicalBaselineStore(fetchTypical);
    expect(await store.typicalFor("X", "Sat", "18:00")).toBeNull();
  });
});
