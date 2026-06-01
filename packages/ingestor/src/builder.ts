import {
  classifyStatus,
  type LineSnapshot,
  type Snapshot,
  type StationSnapshot,
  SCHEMA_VERSION,
} from "@pulse/shared";
import { aggregateLineCrowding, crowdingAnomaly, networkScore } from "./anomaly";

export interface BuildLineInput {
  id: string;
  name: string;
  mode: string;
  statusSeverity: number;
  statusDescription: string;
  disruptions: { category: string; description: string }[];
}

export interface BuildStationInput {
  naptan: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
  live: number | null;
  typical: number | null;
}

export interface BuildInput {
  now: Date;
  statusFetchedAt: Date;
  crowdingFetchedAt: Date;
  lines: BuildLineInput[];
  stations: BuildStationInput[];
}

const TUBE_MODE = "tube";
const ageSec = (now: Date, then: Date) => Math.round((now.getTime() - then.getTime()) / 1000);

export function buildSnapshot(input: BuildInput): Snapshot {
  const stations: StationSnapshot[] = input.stations.map((s) => {
    const { anomaly, band } = crowdingAnomaly(s.live, s.typical);
    return {
      naptan: s.naptan,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      lines: s.lines,
      live: s.live,
      typical: s.typical,
      anomaly,
      anomalyBand: band,
      dataAvailable: s.live !== null,
    };
  });

  const lines: LineSnapshot[] = input.lines.map((l) => ({
    id: l.id,
    name: l.name,
    mode: l.mode,
    statusSeverity: l.statusSeverity,
    statusDescription: l.statusDescription,
    statusLevel: classifyStatus(l.statusSeverity),
    disruptions: l.disruptions,
    crowdingAnomaly: l.mode === TUBE_MODE ? aggregateLineCrowding(l.id, stations) : null,
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: input.now.toISOString(),
    freshness: {
      statusAgeSec: ageSec(input.now, input.statusFetchedAt),
      crowdingAgeSec: ageSec(input.now, input.crowdingFetchedAt),
    },
    network: networkScore(stations, lines, input.now),
    lines,
    stations,
  };
}
