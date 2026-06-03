import type { TypicalBands } from "@pulse/ingestor";
import type { KvLike } from "./bindings";

export function typicalKey(naptan: string, weekday: string): string {
  return `typical:${naptan}:${weekday}`;
}

/** Read cached typical bands for (naptan, weekday); null on miss or corrupt value. */
export async function readCachedTypical(
  kv: KvLike,
  naptan: string,
  weekday: string,
): Promise<TypicalBands | null> {
  const raw = await kv.get(typicalKey(naptan, weekday));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TypicalBands;
  } catch {
    return null;
  }
}

/** Cache typical bands with an expiry (seconds). */
export async function cacheTypical(
  kv: KvLike,
  naptan: string,
  weekday: string,
  bands: TypicalBands,
  ttlSec: number,
): Promise<void> {
  await kv.put(typicalKey(naptan, weekday), JSON.stringify(bands), { expirationTtl: ttlSec });
}
