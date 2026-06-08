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
  let stale: DomainStation[] | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CachedStations;
      if (parsed.day === today && parsed.stations.length > 0) return { stations: parsed.stations, fetched: false };
      if (parsed.stations.length > 0) stale = parsed.stations; // wrong-day list -> usable fallback
    } catch {
      // fall through to refetch
    }
  }
  try {
    const stations = await deps.fetchStations();
    await deps.kv.put(STATIONS_KEY, JSON.stringify({ day: today, stations } satisfies CachedStations));
    return { stations, fetched: true };
  } catch (err) {
    // The station list changes a few times a year; rather than crash the whole
    // tick when TfL is flaky at the daily refresh, serve yesterday's list.
    if (stale) return { stations: stale, fetched: false };
    throw err;
  }
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
  //    The daily refresh fetch is unconditional (not budget-gated) — it happens
  //    at most once per London day; the fetch budget guards only the per-tick
  //    line-status + live-crowding calls below.
  const { stations: allStations, fetched } = await loadStations(deps, today);
  if (fetched) fetchCount++;
  const sorted = [...allStations].sort((a, b) => a.naptan.localeCompare(b.naptan));

  // Guard: never overwrite a good snapshot with an empty one if the station list
  // came back empty (e.g. a malformed TfL response). Keep the previous snapshot.
  if (sorted.length === 0) {
    const prev = await readPrevSnapshot(deps);
    return {
      snapshot: prev ?? buildSnapshot({ now, statusFetchedAt: now, crowdingFetchedAt: now, lines: [], stations: [] }),
      shardCount: 0,
      cursor: 0,
      fetchCount,
    };
  }

  // 2. Shard selection from the KV cursor.
  const cursor = Number((await deps.kv.get(CURSOR_KEY)) ?? "0") || 0;
  const { shard, shardCount, cursor: usedCursor } = selectShard(sorted, cursor, deps.shardSize);

  // 3-5. Fan out all independent I/O concurrently. Doing this sequentially made
  //      each tick ~24s of wall time (40 live fetches + 40 KV reads back-to-back)
  //      and exhausted resource limits at peak; concurrency collapses it to a
  //      couple of seconds. Line status, the previous snapshot (for the merge),
  //      the shard's live crowding, and the shard's cached baselines are all
  //      independent, so they run in one Promise.all.
  const liveBudget = Math.max(0, deps.fetchBudget - fetchCount - 1); // reserve 1 for line status
  const toPoll = shard.slice(0, liveBudget);
  fetchCount += 1 + toPoll.length; // line status + live attempts

  const [freshLines, prev, liveResults, cachedBaselines] = await Promise.all([
    deps.fetchLineStatus(deps.modes).catch((): DomainLineStatus[] => []),
    readPrevSnapshot(deps),
    Promise.all(
      toPoll.map(async (st) => {
        try {
          const res = await deps.fetchLiveCrowding(st.naptan);
          // dataAvailable:false -> live:null (honest unknown). A thrown fetch
          // returns null, so the merge carries the previous value forward
          // instead of blanking the station until its shard comes round again.
          return { naptan: st.naptan, live: res.dataAvailable ? res.percentageOfBaseline : null };
        } catch {
          return null;
        }
      }),
    ),
    Promise.all(toPoll.map((st) => readCachedTypical(deps.kv, st.naptan, weekday))),
  ]);

  const fresh = new Map<string, FreshStation>();
  for (const r of liveResults) {
    if (r) fresh.set(r.naptan, { naptan: r.naptan, live: r.live, typical: null });
  }

  // Apply cached baselines; collect misses for stations that have live data.
  const misses: DomainStation[] = [];
  toPoll.forEach((st, i) => {
    const entry = fresh.get(st.naptan);
    if (!entry || entry.live === null) return;
    const cached = cachedBaselines[i];
    if (cached) entry.typical = cached[band] ?? null;
    else misses.push(st);
  });

  // Fetch + cache the baseline misses concurrently, within the remaining budget.
  const toFetch = misses.slice(0, Math.max(0, deps.fetchBudget - fetchCount));
  fetchCount += toFetch.length;
  const fetchedBands = await Promise.all(
    toFetch.map(async (st) => {
      const bands = await deps.fetchTypical(st.naptan, weekday).catch(() => null);
      if (!bands) return null;
      await cacheTypical(deps.kv, st.naptan, weekday, bands, deps.typicalTtlSec);
      return { naptan: st.naptan, bands };
    }),
  );
  for (const f of fetchedBands) {
    if (!f) continue;
    const entry = fresh.get(f.naptan);
    if (entry) entry.typical = f.bands[band] ?? null;
  }

  // 6. Merge into the previous snapshot and write back.
  // statusFetchedAt/crowdingFetchedAt = now by design: the snapshot's generatedAt
  // is what the UI uses for freshness (schema v1). Per-station age is a non-goal.
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
