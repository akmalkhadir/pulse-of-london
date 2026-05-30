export const SCHEMA_VERSION = 1;

export type AnomalyBand =
  | "much_quieter"
  | "quieter"
  | "normal"
  | "busier"
  | "much_busier"
  | "unknown";

export type StatusLevel = "good" | "minor" | "severe" | "unknown";

export type NetworkVerdict = "quieter_than_usual" | "typical" | "busier_than_usual";

export interface LineDisruption {
  category: string;
  description: string;
}

export interface StationSnapshot {
  naptan: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
  live: number | null; // percentageOfBaseline now (0..1), null if unavailable
  typical: number | null; // typical for this weekday+band (0..1), null if missing
  anomaly: number | null; // live / typical, null if either missing
  anomalyBand: AnomalyBand;
  dataAvailable: boolean;
}

export interface LineSnapshot {
  id: string;
  name: string;
  mode: string;
  statusSeverity: number;
  statusDescription: string;
  statusLevel: StatusLevel;
  disruptions: LineDisruption[];
  crowdingAnomaly: number | null; // median of its stations' ratios; null for non-tube
}

export interface NetworkSummary {
  crowdingAnomaly: number | null; // median of available station ratios
  disruptedLineCount: number;
  verdict: NetworkVerdict;
  headline: string;
  worstLines: string[];
}

export interface SnapshotFreshness {
  statusAgeSec: number;
  crowdingAgeSec: number;
}

export interface Snapshot {
  schemaVersion: number;
  generatedAt: string; // ISO-8601 UTC
  freshness: SnapshotFreshness;
  network: NetworkSummary;
  lines: LineSnapshot[];
  stations: StationSnapshot[];
}
