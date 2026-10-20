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

/** A KV whose writes always fail — e.g. the free-tier daily write limit was hit. */
function fullKv(): KvLike & { store: Map<string, string> } {
  const kv = fakeKv();
  return { ...kv, put: async () => { throw new Error("KV put() limit exceeded for the day."); } };
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

/** Epoch ms of the n-th cron minute; the shard cursor is the minute index. */
const minute = (n: number) => n * 60_000;

function makeDeps(kv: KvLike, r2: R2Like, overrides: Partial<CycleDeps> = {}): CycleDeps {
  return {
    now: () => new Date("2026-06-03T08:05:00Z"), // Wed 09:05 BST → band 09:00, weekday Wed
    scheduledTime: minute(0), // cron minute 0 → shard 0
    tickMinutes: 1,
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
  it("tick 1: caches stations, polls shard 0, writes all stations, no cursor write", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    const res = await runShardedCycle(makeDeps(kv, r2));

    expect(res.shardCount).toBe(2); // ceil(3/2)
    const snap = JSON.parse(r2.store.get("snapshot.json")!) as Snapshot;
    expect(snap.stations).toHaveLength(3); // ALL stations present from tick 1
    expect(snap.stations.find((s) => s.naptan === "A")!.live).toBe(0.9); // shard 0 polled
    expect(snap.stations.find((s) => s.naptan === "C")!.live).toBeNull(); // not yet polled
    expect(res.cursor).toBe(0);
    expect(kv.store.has("meta:cursor")).toBe(false); // cursor is time-derived, never stored
    expect(kv.store.has("meta:stations")).toBe(true);
  });

  it("tick 2: reuses cached stations, polls shard 1, keeps shard 0's previous values", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    await runShardedCycle(makeDeps(kv, r2)); // minute 0 -> shard 0 [A, B]
    const deps2 = makeDeps(kv, r2, { scheduledTime: minute(1) });
    const res2 = await runShardedCycle(deps2); // minute 1 -> shard 1 [C]

    expect(deps2.fetchStations).not.toHaveBeenCalled(); // same London day -> cached
    const snap = JSON.parse(r2.store.get("snapshot.json")!) as Snapshot;
    expect(snap.stations.find((s) => s.naptan === "C")!.live).toBe(0.5); // now polled
    expect(snap.stations.find((s) => s.naptan === "A")!.live).toBe(0.9); // retained from tick 1
    expect(res2.cursor).toBe(1);
  });

  it("derives the shard from the scheduled minute and wraps around", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    const polled = async (n: number) => {
      const deps = makeDeps(kv, r2, { scheduledTime: minute(n) });
      const res = await runShardedCycle(deps);
      const naptans = vi.mocked(deps.fetchLiveCrowding).mock.calls.map(([naptan]) => naptan);
      return { cursor: res.cursor, naptans };
    };
    expect(await polled(0)).toEqual({ cursor: 0, naptans: ["A", "B"] });
    expect(await polled(1)).toEqual({ cursor: 1, naptans: ["C"] });
    expect(await polled(2)).toEqual({ cursor: 0, naptans: ["A", "B"] }); // 2 shards -> wraps
    // A real cron timestamp (epoch ms, mid-minute) floors to its minute index.
    const real = makeDeps(kv, r2, { scheduledTime: Date.parse("2026-06-03T08:05:00Z") + 1_234 });
    expect((await runShardedCycle(real)).cursor).toBe(Math.floor(Date.parse("2026-06-03T08:05:00Z") / 60_000) % 2);
  });

  it("counts runs, not minutes, so a slower cron still walks every shard", async () => {
    const six: DomainStation[] = ["A", "B", "C", "D", "E", "F"].map((n, i) => ({ naptan: n, name: n, lat: 51.5, lon: -0.1 - i / 100, lines: ["victoria"] }));
    const cursorAt = async (n: number, tickMinutes: number) =>
      (await runShardedCycle(makeDeps(fakeKv(), fakeR2(), { fetchStations: vi.fn(async () => six), scheduledTime: minute(n), tickMinutes }))).cursor;
    // Cron every 3 minutes with 3 shards: by minute index alone, minutes 0/3/6 would all land on shard 0.
    expect([await cursorAt(0, 3), await cursorAt(3, 3), await cursorAt(6, 3)]).toEqual([0, 1, 2]);
  });

  it("only writes KV for the daily station list and baseline misses (never per tick)", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    const put = vi.spyOn(kv, "put");
    await runShardedCycle(makeDeps(kv, r2)); // minute 0: station list + 2 baseline misses
    expect(put).toHaveBeenCalledTimes(3);
    put.mockClear();
    await runShardedCycle(makeDeps(kv, r2)); // same shard again: everything cached
    expect(put).not.toHaveBeenCalled();
  });

  it("still writes the snapshot when every KV write fails (daily write limit hit)", async () => {
    const kv = fullKv();
    const r2 = fakeR2();
    const deps = makeDeps(kv, r2);
    const res = await runShardedCycle(deps);
    expect(r2.store.has("snapshot.json")).toBe(true);
    expect(res.snapshot.stations).toHaveLength(3); // fresh station list used despite the failed cache write
    const a = res.snapshot.stations.find((s) => s.naptan === "A")!;
    expect(a.live).toBe(0.9);
    expect(a.typical).toBe(0.5); // fetched baseline applied even though caching it failed
  });

  it("caches typical baselines so fetchTypical runs once per (naptan, weekday)", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    const deps = makeDeps(kv, r2);
    await runShardedCycle(deps); // shard 0 = [A, B]
    expect(deps.fetchTypical).toHaveBeenCalledTimes(2); // A and B missed -> fetched
    const deps2 = makeDeps(kv, r2, { scheduledTime: minute(1) });
    await runShardedCycle(deps2); // shard 1 = [C]
    expect(deps2.fetchTypical).toHaveBeenCalledTimes(1); // only C
    const deps3 = makeDeps(kv, r2, { scheduledTime: minute(2) });
    await runShardedCycle(deps3); // shard 0 again = [A, B]
    expect(deps3.fetchTypical).not.toHaveBeenCalled(); // A/B served from KV
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
