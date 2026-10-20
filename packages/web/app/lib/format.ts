import type { AnomalyBand, NetworkVerdict } from "@pulse/shared";

const STALE_THRESHOLD_SEC = 900; // 15 min (spec §13)

export function describeAnomaly(band: AnomalyBand, ratio: number | null): string {
  if (band === "unknown" || ratio === null) return "no live data";
  if (band === "normal") return "about as busy as usual";
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  const direction = ratio >= 1 ? "busier" : "quieter";
  return `${pct}% ${direction} than usual`;
}

/** Compact board figure for a live/typical ratio: "+80%", "−45%", "—" when unknown. */
export function signedPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  const pct = Math.round((ratio - 1) * 100);
  if (pct === 0) return "±0%";
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/** Departure-board rank: 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const VERDICT_TITLES: Record<NetworkVerdict, string> = {
  busier_than_usual: "Busier than usual",
  quieter_than_usual: "Quieter than usual",
  typical: "About normal",
};

export function verdictTitle(verdict: NetworkVerdict): string {
  return VERDICT_TITLES[verdict];
}

const CLOCK_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const HOUR_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false });

const SHORT_TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long" });

/** London weekday name, "Tuesday". */
export function londonWeekdayName(d: Date): string {
  return WEEKDAY_FMT.format(d);
}

/** London wall-clock time, "09:47:12". */
export function londonClock(d: Date): string {
  return CLOCK_FMT.format(d);
}

/** London wall-clock time without seconds, "21:59". */
export function londonTime(d: Date): string {
  return SHORT_TIME_FMT.format(d);
}

/** The poller pauses 22:00–06:00 London, when trains (and the crowding feed) mostly stop. */
export function isOvernight(d: Date): boolean {
  const hour = Number(HOUR_FMT.format(d)) % 24;
  return hour >= 22 || hour < 6;
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
