import type { AnomalyBand, StatusLevel } from "./snapshot";

export const ANOMALY_THRESHOLDS = {
  muchQuieter: 0.6,
  quieter: 0.85,
  busier: 1.15,
  muchBusier: 1.4,
} as const;

/** Classify a live/typical ratio into a band. null/non-finite → "unknown". */
export function classifyAnomaly(ratio: number | null): AnomalyBand {
  if (ratio === null || !Number.isFinite(ratio)) return "unknown";
  if (ratio < ANOMALY_THRESHOLDS.muchQuieter) return "much_quieter";
  if (ratio < ANOMALY_THRESHOLDS.quieter) return "quieter";
  if (ratio <= ANOMALY_THRESHOLDS.busier) return "normal";
  if (ratio <= ANOMALY_THRESHOLDS.muchBusier) return "busier";
  return "much_busier";
}

/**
 * Classify a TfL statusSeverity into a level. See /Line/Meta/Severity for the
 * authoritative code list. 10 = Good Service, 18 = No Issues → good; 9 = Minor
 * Delays → minor; everything else (Severe Delays, Part/Full Suspended, Closures)
 * → severe; null/non-finite → unknown.
 */
export function classifyStatus(severity: number | null | undefined): StatusLevel {
  if (severity == null || !Number.isFinite(severity)) return "unknown";
  if (severity === 10 || severity === 18) return "good";
  if (severity === 9) return "minor";
  return "severe";
}
