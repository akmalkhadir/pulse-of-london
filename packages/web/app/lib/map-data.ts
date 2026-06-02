import type { LineSnapshot, StationSnapshot } from "@pulse/shared";
import { bandColor, statusColor } from "./colors";

const BASE_RADIUS = 4;
const MAX_EXTRA_RADIUS = 10;

export interface StationPointProps {
  naptan: string;
  name: string;
  color: string;
  radius: number;
  anomalyBand: string;
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

/** Radius grows with how far the station deviates from normal (either direction). */
function radiusFor(anomaly: number | null): number {
  if (anomaly === null) return BASE_RADIUS;
  const deviation = Math.min(Math.abs(anomaly - 1), 1); // cap at 100% deviation
  return BASE_RADIUS + deviation * MAX_EXTRA_RADIUS;
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
        radius: radiusFor(s.anomaly),
        anomalyBand: s.anomalyBand,
      },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    })),
  };
}

export function lineColorById(lines: LineSnapshot[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of lines) out[l.id] = statusColor(l.statusLevel);
  return out;
}
