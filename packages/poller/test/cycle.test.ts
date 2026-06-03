import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@pulse/shared";
import type { DomainStation, DomainLineStatus, DomainLive, TypicalBands } from "@pulse/ingestor";
import type { KvLike, R2Like } from "../src/bindings";
import { runShardedCycle, type CycleDeps } from "../src/cycle";

function fakeKv(): KvLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
  };
}

function fakeR2(): R2Like & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => (store.has(k) ? { text: async () => store.get(k)! } : null),
    put: async (k, v) => void store.set(k, v),
  };
}

const stationList: DomainStation[] = [
  { naptan: "A", name: "A", lat: 51.5, lon: -0.10, lines: ["victoria"] },
  { naptan: "B", name: "B", lat: 51.5, lon: -0.11, lines: ["victoria"] },
  { naptan: "C", name: "C", lat: 51.5, lon: -0.12, lines: ["victoria"] },
];

function makeDeps(kv: KvLike, r2: R2Like, overrides: Partial<CycleDeps> = {}): CycleDeps {
  return {
    now: () => new Date("2026-06-03T08:05:00Z"), // Wed 09:05 BST → band 09:00, weekday Wed
    shardSize: 2,
    fetchBudget: 50,
    typicalTtlSec: 172800,
    modes: ["tube"],
    fetchStations: vi.fn(async () => stationList),
    fetchLineStatus: vi.fn(async () => [
      { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
    ] satisfies DomainLineStatus[]),
    fetchLiveCrowding: vi.fn(async (naptan: string): Promise<DomainLive> => ({ dataAvailable: true, percentageOfBaseline: naptan === "A" ? 0.9 : 0.5 })),
    fetchTypical: vi.fn(async (): Promise<TypicalBands> => ({ "09:00": 0.5 })),
    kv,
    r2,
    snapshotKey: "snapshot.json",
    ...overrides,
  };
}

describe("runShardedCycle", () => {
  it("tick 1: caches stations, polls shard 0, writes all stations, advances cursor", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    const res = await runShardedCycle(makeDeps(kv, r2));

    expect(res.shardCount).toBe(2); // ceil(3/2)
    const snap = JSON.parse(r2.store.get("snapshot.json")!) as Snapshot;
    expect(snap.stations).toHaveLength(3); // ALL stations present from tick 1
    expect(snap.stations.find((s) => s.naptan === "A")!.live).toBe(0.9); // shard 0 polled
    expect(snap.stations.find((s) => s.naptan === "C")!.live).toBeNull(); // not yet polled
    expect(kv.store.get("meta:cursor")).toBe("1");
    expect(kv.store.has("meta:stations")).toBe(true);
  });

  it("tick 2: reuses cached stations, polls shard 1, keeps shard 0's previous values", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    await runShardedCycle(makeDeps(kv, r2)); // tick 1 -> cursor 1
    const deps2 = makeDeps(kv, r2);
    await runShardedCycle(deps2); // tick 2 -> shard [C]

    expect(deps2.fetchStations).not.toHaveBeenCalled(); // same London day -> cached
    const snap = JSON.parse(r2.store.get("snapshot.json")!) as Snapshot;
    expect(snap.stations.find((s) => s.naptan === "C")!.live).toBe(0.5); // now polled
    expect(snap.stations.find((s) => s.naptan === "A")!.live).toBe(0.9); // retained from tick 1
    expect(kv.store.get("meta:cursor")).toBe("0"); // wrapped (2 shards)
  });

  it("caches typical baselines so fetchTypical runs once per (naptan, weekday)", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    const deps = makeDeps(kv, r2);
    await runShardedCycle(deps); // shard 0 = [A, B]
    expect(deps.fetchTypical).toHaveBeenCalledTimes(2); // A and B missed -> fetched
    const deps2 = makeDeps(kv, r2);
    await runShardedCycle(deps2); // shard 1 = [C]
    expect(deps2.fetchTypical).toHaveBeenCalledTimes(1); // only C; A/B served from KV next time
  });

  it("never exceeds the fetch budget; extra baseline misses get null typical", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    // Pre-seed the station cache so the daily station-list fetch doesn't consume
    // a budget unit -> the budget is exactly 1 status + 3 live = 4 (all polled).
    kv.store.set("meta:stations", JSON.stringify({ day: "2026-06-03", stations: stationList }));
    let fetches = 0;
    const count = () => { fetches++; };
    const deps = makeDeps(kv, r2, {
      shardSize: 3,
      fetchBudget: 4,
      fetchLineStatus: vi.fn(async () => { count(); return []; }),
      fetchLiveCrowding: vi.fn(async (): Promise<DomainLive> => { count(); return { dataAvailable: true, percentageOfBaseline: 0.5 }; }),
      fetchTypical: vi.fn(async (): Promise<TypicalBands> => { count(); return { "09:00": 0.5 }; }),
    });
    const res = await runShardedCycle(deps);
    expect(deps.fetchStations).not.toHaveBeenCalled(); // served from the seeded cache
    expect(fetches).toBeLessThanOrEqual(4);
    expect(res.snapshot.stations.every((s) => s.live === 0.5)).toBe(true); // all 3 polled
    expect(deps.fetchTypical).not.toHaveBeenCalled(); // no budget left for baselines
    expect(res.snapshot.stations.every((s) => s.typical === null)).toBe(true);
  });

  it("serves the stale station list (no crash) when fetchStations throws on a new day", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    await runShardedCycle(makeDeps(kv, r2)); // tick 1 seeds meta:stations + snapshot
    // Simulate the daily rollover: the stored list is now from "yesterday".
    kv.store.set("meta:stations", JSON.stringify({ day: "2026-06-02", stations: stationList }));
    const deps2 = makeDeps(kv, r2, {
      fetchStations: vi.fn(async () => { throw new Error("TfL down"); }),
    });
    const res = await runShardedCycle(deps2);
    expect(res.snapshot.stations).toHaveLength(3); // used the stale list, didn't crash
    expect(r2.store.has("snapshot.json")).toBe(true);
  });

  it("keeps previous lines when the status fetch fails", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    await runShardedCycle(makeDeps(kv, r2)); // seeds a snapshot with the victoria line
    const deps2 = makeDeps(kv, r2, { fetchLineStatus: vi.fn(async () => { throw new Error("status boom"); }) });
    const res = await runShardedCycle(deps2);
    expect(res.snapshot.lines.map((l) => l.id)).toContain("victoria");
  });
});
