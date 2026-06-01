import type { LineDisruption } from "@pulse/shared";
import type { TflClient } from "./client";
import type {
  RawLine,
  RawLiveCrowding,
  RawStopPointsResponse,
  RawTypical,
} from "./types";

export interface DomainLineStatus {
  id: string;
  name: string;
  mode: string;
  statusSeverity: number;
  statusDescription: string;
  disruptions: LineDisruption[];
}

export interface DomainLive {
  dataAvailable: boolean;
  percentageOfBaseline: number | null;
}

export type TypicalBands = Record<string, number>; // "HH:MM" -> value

export interface DomainStation {
  naptan: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
}

function cleanName(name: string): string {
  return name.replace(/\s+Underground Station$/i, "").trim();
}

export async function fetchLineStatus(
  client: TflClient,
  modes: string[],
): Promise<DomainLineStatus[]> {
  const raw = await client.getJson<RawLine[]>(`/Line/Mode/${modes.join(",")}/Status`, {
    detail: "true",
  });
  return raw.map((line) => {
    // Pick the worst lineStatus (lowest severity number = worst).
    const worst = (line.lineStatuses ?? [])
      .slice()
      .sort((a, b) => (a.statusSeverity ?? 99) - (b.statusSeverity ?? 99))[0];
    const disruptions: LineDisruption[] = (line.lineStatuses ?? [])
      .filter((s) => s.disruption?.description)
      .map((s) => ({
        category: s.disruption?.category ?? "Unknown",
        description: s.disruption!.description!,
      }));
    return {
      id: line.id,
      name: line.name,
      mode: line.modeName,
      statusSeverity: worst?.statusSeverity ?? 10,
      statusDescription: worst?.statusSeverityDescription ?? "Good Service",
      disruptions,
    };
  });
}

export async function fetchLiveCrowding(client: TflClient, naptan: string): Promise<DomainLive> {
  const raw = await client.getJson<RawLiveCrowding>(`/crowding/${naptan}/Live`);
  const available = raw.dataAvailable === true;
  return {
    dataAvailable: available,
    percentageOfBaseline: available ? (raw.percentageOfBaseline ?? null) : null,
  };
}

export async function fetchTypical(
  client: TflClient,
  naptan: string,
  dayOfWeek: string,
): Promise<TypicalBands> {
  const raw = await client.getJson<RawTypical>(`/crowding/${naptan}/${dayOfWeek}`);
  const out: TypicalBands = {};
  for (const b of raw.timeBands ?? []) {
    const from = b.timeBand?.from;
    const value = b.percentageOfBaseLine ?? b.percentageOfBaseline;
    if (from && typeof value === "number") out[from] = value;
  }
  return out;
}

export async function fetchStations(client: TflClient): Promise<DomainStation[]> {
  const raw = await client.getJson<RawStopPointsResponse>(`/StopPoint/Mode/tube`);
  return (raw.stopPoints ?? []).map((sp) => ({
    naptan: sp.naptanId,
    name: cleanName(sp.commonName),
    lat: sp.lat,
    lon: sp.lon,
    lines: (sp.lines ?? []).map((l) => l.id),
  }));
}
