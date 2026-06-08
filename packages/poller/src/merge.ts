import type { Snapshot } from "@pulse/shared";
import type { BuildStationInput, BuildLineInput, DomainStation, DomainLineStatus } from "@pulse/ingestor";

export interface FreshStation {
  naptan: string;
  live: number | null;
  typical: number | null;
}

/**
 * Produce a full BuildStationInput[] for every station in `all`: fresh crowding
 * for stations polled this tick, otherwise the previous snapshot's values, else
 * null. Station metadata (name/lat/lon/lines) always comes from `all` (the
 * authoritative, KV-cached station list) so newly added stations still appear.
 */
export function mergeStationInputs(
  all: DomainStation[],
  prev: Snapshot | null,
  fresh: Map<string, FreshStation>,
): BuildStationInput[] {
  const prevByNaptan = new Map((prev?.stations ?? []).map((s) => [s.naptan, s]));
  return all.map((st) => {
    const f = fresh.get(st.naptan);
    const p = prevByNaptan.get(st.naptan);
    const live = f ? f.live : (p?.live ?? null);
    const typical = f ? f.typical : (p?.typical ?? null);
    return { naptan: st.naptan, name: st.name, lat: st.lat, lon: st.lon, lines: st.lines, live, typical };
  });
}

/** Fresh line status if we have it, else the previous snapshot's lines, else none. */
export function linesInput(fresh: DomainLineStatus[], prev: Snapshot | null): BuildLineInput[] {
  if (fresh.length > 0) return fresh;
  return (prev?.lines ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    mode: l.mode,
    statusSeverity: l.statusSeverity,
    statusDescription: l.statusDescription,
    disruptions: l.disruptions,
  }));
}
