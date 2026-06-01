import type { TypicalBands } from "./tfl/fetchers";

type Fetcher = (naptan: string, dayOfWeek: string) => Promise<TypicalBands>;

/** Caches per (naptan, weekday) typical bands; one fetch per key. */
export class TypicalBaselineStore {
  private readonly cache = new Map<string, Promise<TypicalBands | null>>();

  constructor(private readonly fetchTypical: Fetcher) {}

  private load(naptan: string, weekday: string): Promise<TypicalBands | null> {
    const key = `${naptan}|${weekday}`;
    let entry = this.cache.get(key);
    if (!entry) {
      entry = this.fetchTypical(naptan, weekday).catch(() => null);
      this.cache.set(key, entry);
    }
    return entry;
  }

  async typicalFor(naptan: string, weekday: string, band: string): Promise<number | null> {
    const bands = await this.load(naptan, weekday);
    if (!bands) return null;
    return bands[band] ?? null;
  }
}
