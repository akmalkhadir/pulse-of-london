import type { LineSnapshot, StationSnapshot, StatusLevel } from "@pulse/shared";
import { bandColor } from "./colors";

/** Normal and no-data stations are small LED pixels; only unusual ones grow. */
export const PIXEL_RADIUS = 2.5;
const UNUSUAL_RADIUS = 3.5;
const MAX_EXTRA_RADIUS = 8;

export interface StationPointProps {
  naptan: string;
  name: string;
  color: string;
  radius: number;
  anomalyBand: string;
  /** No live data: drawn as a hollow ring rather than a filled dot. */
  hollow: boolean;
  /** "|victoria|central|" — MapLibre flattens array properties, so line membership is a delimited string. */
  lineKey: string;
}

export interface StationPoint {
  type: "Feature";
  properties: StationPointProps;
  geometry: { type: "Point"; coordinates: [number, number] };
}

export interface StationCollection {
  type: "FeatureCollection";
  features: StationPoint[];
}

/** Radius grows with how far an unusual station deviates from normal (either direction). */
function radiusFor(band: StationSnapshot["anomalyBand"], anomaly: number | null): number {
  if (anomaly === null || band === "normal" || band === "unknown") return PIXEL_RADIUS;
  const deviation = Math.min(Math.abs(anomaly - 1), 1); // cap at 100% deviation
  return UNUSUAL_RADIUS + deviation * MAX_EXTRA_RADIUS;
}

export function lineKeyFor(lineId: string): string {
  return `|${lineId}|`;
}

export function stationsToGeoJSON(stations: StationSnapshot[]): StationCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature",
      properties: {
        naptan: s.naptan,
        name: s.name,
        color: bandColor(s.anomalyBand),
        radius: radiusFor(s.anomalyBand, s.anomaly),
        anomalyBand: s.anomalyBand,
        hollow: s.anomalyBand === "unknown",
        lineKey: `|${s.lines.join("|")}|`,
      },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    })),
  };
}

/** Line id → status level, for styling each line's geometry by what TfL says about it. */
export function lineLevelById(lines: LineSnapshot[]): Record<string, StatusLevel> {
  const out: Record<string, StatusLevel> = {};
  for (const l of lines) out[l.id] = l.statusLevel;
  return out;
}
