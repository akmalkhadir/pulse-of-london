import type { Snapshot } from "@pulse/shared";
import {
  buildSnapshot,
  londonBand,
  londonWeekday,
  londonDateKey,
  type DomainStation,
  type DomainLineStatus,
  type DomainLive,
  type TypicalBands,
} from "@pulse/ingestor";
import type { KvLike, R2Like } from "./bindings";
import { selectShard } from "./shard";
import { mergeStationInputs, linesInput, type FreshStation } from "./merge";
import { readCachedTypical, cacheTypical } from "./baseline";

const CURSOR_KEY = "meta:cursor";
const STATIONS_KEY = "meta:stations";

export interface CycleDeps {
  now: () => Date;
  shardSize: number;
  fetchBudget: number;
  typicalTtlSec: number;
  modes: string[];
  fetchStations: () => Promise<DomainStation[]>;
  fetchLineStatus: (modes: string[]) => Promise<DomainLineStatus[]>;
  fetchLiveCrowding: (naptan: string) => Promise<DomainLive>;
  fetchTypical: (naptan: string, weekday: string) => Promise<TypicalBands>;
  kv: KvLike;
  r2: R2Like;
  snapshotKey: string;
}

export interface CycleResult {
  snapshot: Snapshot;
  shardCount: number;
  cursor: number;
  fetchCount: number;
}

interface CachedStations {
  day: string;
  stations: DomainStation[];
}

/** Load the station list from KV, refreshing it (1 fetch) once per London day. */
async function loadStations(deps: CycleDeps, today: string): Promise<{ stations: DomainStation[]; fetched: boolean }> {
  const raw = await deps.kv.get(STATIONS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CachedStations;
      if (parsed.day === today && parsed.stations.length > 0) return { stations: parsed.stations, fetched: false };
    } catch {
      // fall through to refetch
    }
  }
  const stations = await deps.fetchStations();
  await deps.kv.put(STATIONS_KEY, JSON.stringify({ day: today, stations } satisfies CachedStations));
  return { stations, fetched: true };
}

async function readPrevSnapshot(deps: CycleDeps): Promise<Snapshot | null> {
  const obj = await deps.r2.get(deps.snapshotKey);
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text()) as Snapshot;
  } catch {
    return null;
  }
}

export async function runShardedCycle(deps: CycleDeps): Promise<CycleResult> {
  const now = deps.now();
  const weekday = londonWeekday(now);
  const band = londonBand(now);
  const today = londonDateKey(now);

  let fetchCount = 0;

  // 1. Station list (KV-cached, daily refresh). Sort for deterministic sharding.
  const { stations: allStations, fetched } = await loadStations(deps, today);
  if (fetched) fetchCount++;
  const sorted = [...allStations].sort((a, b) => a.naptan.localeCompare(b.naptan));

  // 2. Shard selection from the KV cursor.
  const cursor = Number((await deps.kv.get(CURSOR_KEY)) ?? "0") || 0;
  const { shard, shardCount, cursor: usedCursor } = selectShard(sorted, cursor, deps.shardSize);

  // 3. Line status (1 fetch); keep previous on failure.
  let freshLines: DomainLineStatus[] = [];
  if (fetchCount < deps.fetchBudget) {
    fetchCount++;
    freshLines = await deps.fetchLineStatus(deps.modes).catch(() => []);
  }

  // 4. Live crowding for the shard (1 fetch each, within budget).
  const fresh = new Map<string, FreshStation>();
  for (const st of shard) {
    if (fetchCount >= deps.fetchBudget) break;
    fetchCount++;
    let live: number | null = null;
    try {
      const res = await deps.fetchLiveCrowding(st.naptan);
      live = res.dataAvailable ? res.percentageOfBaseline : null;
    } catch {
      live = null;
    }
    fresh.set(st.naptan, { naptan: st.naptan, live, typical: null });
  }

  // 5. Typical baselines: KV hit is free; misses fetch within remaining budget.
  for (const st of shard) {
    const entry = fresh.get(st.naptan);
    if (!entry || entry.live === null) continue;
    const cached = await readCachedTypical(deps.kv, st.naptan, weekday);
    if (cached) {
      entry.typical = cached[band] ?? null;
      continue;
    }
    if (fetchCount >= deps.fetchBudget) continue; // out of budget -> warm later
    fetchCount++;
    const bands = await deps.fetchTypical(st.naptan, weekday).catch(() => null);
    if (bands) {
      await cacheTypical(deps.kv, st.naptan, weekday, bands, deps.typicalTtlSec);
      entry.typical = bands[band] ?? null;
    }
  }

  // 6. Merge into the previous snapshot and write back.
  const prev = await readPrevSnapshot(deps);
  const snapshot = buildSnapshot({
    now,
    statusFetchedAt: now,
    crowdingFetchedAt: now,
    lines: linesInput(freshLines, prev),
    stations: mergeStationInputs(sorted, prev, fresh),
  });

  await deps.r2.put(deps.snapshotKey, JSON.stringify(snapshot));
  await deps.kv.put(CURSOR_KEY, String(shardCount === 0 ? 0 : (usedCursor + 1) % shardCount));

  return { snapshot, shardCount, cursor: usedCursor, fetchCount };
}
