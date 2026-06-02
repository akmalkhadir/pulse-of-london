import type { AnomalyBand, StatusLevel } from "@pulse/shared";

/** Anomaly band → colour, tuned for the dark map. Warm = busier than usual, cool = quieter. */
export const BAND_COLORS: Record<AnomalyBand, string> = {
  much_busier: "#DC2626", // Danger
  busier: "#D97706", // Warning
  normal: "#94A3B8", // muted slate (dim on dark)
  quieter: "#3B82F6", // Primary
  much_quieter: "#60A5FA", // lighter Primary
  unknown: "#64748B", // neutral — no live data
};

/** Line status level → colour. */
export const STATUS_COLORS: Record<StatusLevel, string> = {
  good: "#16A34A", // Success
  minor: "#D97706", // Warning
  severe: "#DC2626", // Danger
  unknown: "#64748B",
};

export function bandColor(band: AnomalyBand): string {
  return BAND_COLORS[band];
}

export function statusColor(level: StatusLevel): string {
  return STATUS_COLORS[level];
}
