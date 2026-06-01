import type { Snapshot } from "@pulse/shared";
import { buildSnapshot, type BuildLineInput, type BuildStationInput } from "./builder";
import { londonBand, londonWeekday } from "./time";
import type { DomainLive, DomainLineStatus, DomainStation } from "./tfl/fetchers";

export interface Deps {
  now: () => Date;
  fetchLineStatus: (modes: string[]) => Promise<DomainLineStatus[]>;
  fetchStations: () => Promise<DomainStation[]>;
  fetchLiveCrowding: (naptan: string) => Promise<DomainLive>;
  typicalFor: (naptan: string, weekday: string, band: string) => Promise<number | null>;
  writeSnapshot: (snapshot: Snapshot) => Promise<void>;
  logSnapshot: (snapshot: Snapshot, now: Date) => Promise<void>;
  modes: string[];
  crowdingConcurrency?: number;
}

/** Run promises in batches to respect TfL rate limits. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

export async function runPollCycle(deps: Deps): Promise<Snapshot> {
  const now = deps.now();
  const weekday = londonWeekday(now);
  const band = londonBand(now);

  // Status and stations are independent; a failure in one must not sink the other.
  const statusFetchedAt = deps.now();
  const lines: BuildLineInput[] = await deps.fetchLineStatus(deps.modes).catch(() => []);

  const stationsMeta = await deps.fetchStations().catch(() => []);

  const crowdingFetchedAt = deps.now();
  const stations: BuildStationInput[] = await inBatches(
    stationsMeta,
    deps.crowdingConcurrency ?? 20,
    async (st) => {
      let live: number | null = null;
      try {
        const res = await deps.fetchLiveCrowding(st.naptan);
        live = res.dataAvailable ? res.percentageOfBaseline : null;
      } catch {
        live = null; // isolate per-station failure
      }
      let typical: number | null = null;
      if (live !== null) {
        typical = await deps.typicalFor(st.naptan, weekday, band).catch(() => null);
      }
      return { ...st, live, typical };
    },
  );

  const snapshot = buildSnapshot({ now, statusFetchedAt, crowdingFetchedAt, lines, stations });

  await deps.writeSnapshot(snapshot);
  await deps.logSnapshot(snapshot, now).catch(() => {}); // history is best-effort
  return snapshot;
}
