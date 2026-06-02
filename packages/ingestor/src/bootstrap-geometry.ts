import { mkdir, writeFile } from "node:fs/promises";
import { loadConfig } from "./config";
import { TflClient } from "./tfl/client";
import { fetchStations } from "./tfl/fetchers";

interface RawSequence {
  lineId: string;
  lineName: string;
  lineStrings?: string[]; // each is a JSON string of coordinate pairs
}

interface GeoFeature {
  type: "Feature";
  properties: { lineId: string; lineName: string };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const client = new TflClient({ appKey: cfg.tflAppKey });

  // Fetch geometry per line across all configured rail modes.
  const features: GeoFeature[] = [];
  const lineMeta = await client.getJson<{ id: string; name: string }[]>(
    `/Line/Mode/${cfg.modes.join(",")}/Route`,
  );
  for (const line of lineMeta) {
    const seq = await client.getJson<RawSequence>(`/Line/${line.id}/Route/Sequence/all`);
    for (const ls of seq.lineStrings ?? []) {
      // Each TfL lineString parses to an ARRAY of linestrings (MultiLineString-style
      // nesting: [[ [lon,lat], ... ], ...]) — verified against live data. Coordinates
      // are [lon, lat] (GeoJSON order), confirmed e.g. Bakerloo ≈ [-0.3352, 51.5923].
      const lineStrings = JSON.parse(ls) as [number, number][][];
      for (const coords of lineStrings) {
        features.push({
          type: "Feature",
          properties: { lineId: line.id, lineName: line.name },
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    }
  }

  const stations = await fetchStations(client);

  await mkdir("data", { recursive: true });
  await writeFile(
    "data/geometry.geojson",
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  await writeFile("data/stations.json", JSON.stringify(stations, null, 2));
  console.log(`wrote ${features.length} line features, ${stations.length} stations`);
}

main().catch((err) => {
  console.error("bootstrap failed:", err);
  process.exitCode = 1;
});
