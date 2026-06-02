import type { LineSnapshot, StationSnapshot, StatusLevel } from "@pulse/shared";

const STATUS_RANK: Record<StatusLevel, number> = { severe: 0, minor: 1, unknown: 2, good: 3 };

export function sortLinesWorstFirst(lines: LineSnapshot[]): LineSnapshot[] {
  return [...lines].sort((a, b) => {
    const byStatus = STATUS_RANK[a.statusLevel] - STATUS_RANK[b.statusLevel];
    if (byStatus !== 0) return byStatus;
    return (b.crowdingAnomaly ?? -Infinity) - (a.crowdingAnomaly ?? -Infinity);
  });
}

export function sortStationsWorstFirst(stations: StationSnapshot[]): StationSnapshot[] {
  return [...stations].sort((a, b) => (b.anomaly ?? -Infinity) - (a.anomaly ?? -Infinity));
}
