import type { AnomalyBand } from "@pulse/shared";

const STALE_THRESHOLD_SEC = 900; // 15 min (spec §13)

export function describeAnomaly(band: AnomalyBand, ratio: number | null): string {
  if (band === "unknown" || ratio === null) return "no live data";
  if (band === "normal") return "about as busy as usual";
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  const direction = ratio >= 1 ? "busier" : "quieter";
  return `${pct}% ${direction} than usual`;
}

export function relativeAge(sec: number): string {
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} hr ago`;
}

export interface Staleness {
  ageSec: number;
  isStale: boolean;
  label: string;
}

export function computeStaleness(
  generatedAt: string,
  now: Date,
  thresholdSec: number = STALE_THRESHOLD_SEC,
): Staleness {
  const then = Date.parse(generatedAt);
  if (Number.isNaN(then)) {
    return { ageSec: Infinity, isStale: true, label: "unknown" };
  }
  const ageSec = Math.max(0, Math.round((now.getTime() - then) / 1000));
  return { ageSec, isStale: ageSec > thresholdSec, label: relativeAge(ageSec) };
}
