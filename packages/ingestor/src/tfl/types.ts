export interface RawLineStatus {
  statusSeverity?: number;
  statusSeverityDescription?: string;
  disruption?: { category?: string; description?: string };
}

export interface RawLine {
  id: string;
  name: string;
  modeName: string;
  lineStatuses?: RawLineStatus[];
}

export interface RawLiveCrowding {
  dataAvailable?: boolean;
  percentageOfBaseline?: number;
}

export interface RawTypicalBand {
  timeBand?: { from?: string; until?: string };
  percentageOfBaseLine?: number; // note: TfL uses this casing
  percentageOfBaseline?: number; // defensive: accept both
}

export interface RawTypical {
  timeBands?: RawTypicalBand[];
}

export interface RawStopPoint {
  naptanId: string;
  commonName: string;
  lat: number;
  lon: number;
  lines?: { id: string }[];
}

export interface RawStopPointsResponse {
  stopPoints?: RawStopPoint[];
}
