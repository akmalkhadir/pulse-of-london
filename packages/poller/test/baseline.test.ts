import { describe, expect, it, vi } from "vitest";
import type { KvLike } from "../src/bindings";
import { readCachedTypical, cacheTypical, typicalKey } from "../src/baseline";

function fakeKv(seed: Record<string, string> = {}): KvLike & { store: Map<string, string>; ttls: Map<string, number> } {
  const store = new Map(Object.entries(seed));
  const ttls = new Map<string, number>();
  return {
    store,
    ttls,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string, o?: { expirationTtl?: number }) => {
      store.set(k, v);
      if (o?.expirationTtl) ttls.set(k, o.expirationTtl);
    }),
  };
}

describe("typicalKey", () => {
  it("namespaces by naptan and weekday", () => {
    expect(typicalKey("940GZZLUVIC", "Wed")).toBe("typical:940GZZLUVIC:Wed");
  });
});

describe("readCachedTypical", () => {
  it("returns null on a miss", async () => {
    expect(await readCachedTypical(fakeKv(), "X", "Wed")).toBeNull();
  });

  it("parses cached bands on a hit", async () => {
    const kv = fakeKv({ "typical:X:Wed": JSON.stringify({ "08:00": 0.7 }) });
    expect(await readCachedTypical(kv, "X", "Wed")).toEqual({ "08:00": 0.7 });
  });

  it("returns null (not throw) on corrupt JSON", async () => {
    const kv = fakeKv({ "typical:X:Wed": "{not json" });
    expect(await readCachedTypical(kv, "X", "Wed")).toBeNull();
  });
});

describe("cacheTypical", () => {
  it("writes JSON with the given TTL", async () => {
    const kv = fakeKv();
    await cacheTypical(kv, "X", "Wed", { "08:00": 0.7 }, 172800);
    expect(kv.store.get("typical:X:Wed")).toBe(JSON.stringify({ "08:00": 0.7 }));
    expect(kv.ttls.get("typical:X:Wed")).toBe(172800);
  });
});
