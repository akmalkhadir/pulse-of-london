import { loadConfig } from "./config";
import { TflClient } from "./tfl/client";
import {
  fetchLineStatus,
  fetchLiveCrowding,
  fetchStations,
  fetchTypical,
} from "./tfl/fetchers";
import { TypicalBaselineStore } from "./baseline";
import { makeR2Client, writeSnapshot } from "./writer";
import { logSnapshot } from "./history";
import { runPollCycle } from "./run";

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const client = new TflClient({ appKey: cfg.tflAppKey });
  const r2 = makeR2Client(cfg.r2);
  const baseline = new TypicalBaselineStore((naptan, weekday) =>
    fetchTypical(client, naptan, weekday),
  );

  const snapshot = await runPollCycle({
    now: () => new Date(),
    fetchLineStatus: (modes) => fetchLineStatus(client, modes),
    fetchStations: () => fetchStations(client),
    fetchLiveCrowding: (naptan) => fetchLiveCrowding(client, naptan),
    typicalFor: (naptan, weekday, band) => baseline.typicalFor(naptan, weekday, band),
    writeSnapshot: (snap) => writeSnapshot(r2, cfg.r2.bucket, cfg.snapshotKey, snap),
    logSnapshot: (snap, now) => logSnapshot(r2, cfg.r2.bucket, cfg.historyPrefix, snap, now),
    modes: cfg.modes,
  });

  console.log(
    `snapshot ${snapshot.generatedAt}: ${snapshot.stations.length} stations, ` +
      `${snapshot.lines.length} lines, verdict=${snapshot.network.verdict}`,
  );
}

main().catch((err) => {
  console.error("ingest failed:", err);
  process.exitCode = 1;
});
