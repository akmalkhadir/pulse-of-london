import { SCHEMA_VERSION, type Snapshot } from "@pulse/shared";
import { sampleSnapshot } from "../fixtures/sample-snapshot";

export interface SnapshotEnv {
  SNAPSHOT_URL?: string;
}

/**
 * Load the latest snapshot. With no SNAPSHOT_URL (dev/test) returns the bundled
 * sample. Otherwise fetches the already-public snapshot; on any failure or
 * schema mismatch, falls back to the sample so the page always renders.
 */
export async function loadSnapshot(
  env: SnapshotEnv,
  fetchFn: typeof fetch = fetch,
): Promise<Snapshot> {
  if (!env.SNAPSHOT_URL) return sampleSnapshot;
  try {
    const res = await fetchFn(env.SNAPSHOT_URL, { headers: { accept: "application/json" } });
    if (!res.ok) return sampleSnapshot;
    const data = (await res.json()) as Snapshot;
    if (data?.schemaVersion !== SCHEMA_VERSION) return sampleSnapshot;
    return data;
  } catch {
    return sampleSnapshot;
  }
}
