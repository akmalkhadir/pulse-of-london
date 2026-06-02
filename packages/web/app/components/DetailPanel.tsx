import type { Snapshot } from "@pulse/shared";
import { describeAnomaly } from "../lib/format";

export type Selection =
  | { kind: "line"; id: string }
  | { kind: "station"; naptan: string }
  | null;

export function DetailPanel({ snapshot, selection }: { snapshot: Snapshot; selection: Selection }) {
  if (!selection) {
    return (
      <section className="panel" aria-label="Details">
        <p>Select a line or station for details.</p>
      </section>
    );
  }
  if (selection.kind === "line") {
    const line = snapshot.lines.find((l) => l.id === selection.id);
    if (!line) return <section className="panel">Unknown line.</section>;
    return (
      <section className="panel" aria-label={`Details for ${line.name}`}>
        <h2>{line.name}</h2>
        <p>{line.statusDescription}</p>
        {line.disruptions.map((d, i) => <p key={i}>{d.description}</p>)}
        {line.crowdingAnomaly !== null && (
          <p className="mono">Crowding: {describeAnomaly(line.crowdingAnomaly >= 1 ? "busier" : "quieter", line.crowdingAnomaly)}</p>
        )}
      </section>
    );
  }
  const station = snapshot.stations.find((s) => s.naptan === selection.naptan);
  if (!station) return <section className="panel">Unknown station.</section>;
  return (
    <section className="panel" aria-label={`Details for ${station.name}`}>
      <h2>{station.name}</h2>
      <p className="mono">{describeAnomaly(station.anomalyBand, station.anomaly)}</p>
    </section>
  );
}
