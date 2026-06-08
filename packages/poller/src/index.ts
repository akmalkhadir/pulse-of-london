import { TflClient, fetchStations, fetchLineStatus, fetchLiveCrowding, fetchTypical } from "@pulse/ingestor";
import type { Env, KvLike, R2Like } from "./bindings";
import { runShardedCycle } from "./cycle";

const DEFAULT_MODES = "tube,overground,elizabeth-line,dlr,tram";
const TYPICAL_TTL_SEC = 172_800; // 48h

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    // retries: 0 — each TfL retry is a real Cloudflare subrequest; a retry storm
    // could blow the 50-subrequest/invocation free-tier cap. The next tick recovers.
    const client = new TflClient({ appKey: env.TFL_APP_KEY, retries: 0 });

    // Adapters: present the real KV/R2 bindings through our minimal interfaces.
    const kv: KvLike = {
      get: (k) => env.PULSE_KV.get(k),
      put: (k, v, o) => env.PULSE_KV.put(k, v, o),
    };
    const r2: R2Like = {
      get: async (k) => {
        const obj = await env.PULSE_BUCKET.get(k);
        return obj ? { text: () => obj.text() } : null;
      },
      put: async (k, v) => {
        await env.PULSE_BUCKET.put(k, v, {
          httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=30" },
        });
      },
    };

    const res = await runShardedCycle({
      now: () => new Date(),
      shardSize: Number(env.SHARD_SIZE ?? "40") || 40,
      fetchBudget: Number(env.FETCH_BUDGET ?? "50") || 50,
      typicalTtlSec: TYPICAL_TTL_SEC,
      modes: (env.TFL_MODES ?? DEFAULT_MODES).split(",").map((m) => m.trim()),
      fetchStations: () => fetchStations(client),
      fetchLineStatus: (modes) => fetchLineStatus(client, modes),
      fetchLiveCrowding: (naptan) => fetchLiveCrowding(client, naptan),
      fetchTypical: (naptan, weekday) => fetchTypical(client, naptan, weekday),
      kv,
      r2,
      snapshotKey: env.SNAPSHOT_KEY ?? "snapshot.json",
    });

    console.log(
      `tick: shard ${res.cursor + 1}/${res.shardCount}, ${res.fetchCount} fetches, ` +
        `${res.snapshot.stations.length} stations, verdict=${res.snapshot.network.verdict}`,
    );
  },
};
