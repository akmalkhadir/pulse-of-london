import type { Snapshot } from "@pulse/shared";
import type { Selection } from "./DetailPanel";
import { sortLinesWorstFirst, sortStationsWorstFirst } from "../lib/sort";
import { describeAnomaly } from "../lib/format";
import { statusColor, bandColor } from "../lib/colors";

export function ListView({ snapshot, onSelect }: { snapshot: Snapshot; onSelect: (s: Selection) => void }) {
  const lines = sortLinesWorstFirst(snapshot.lines);
  const stations = sortStationsWorstFirst(snapshot.stations);
  return (
    <section className="panel" aria-label="Lines and stations, worst first">
      <h2>Lines</h2>
      <table className="list">
        <caption className="visually-hidden">Rail lines, most disrupted first</caption>
        <thead><tr><th scope="col">Line</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td><button type="button" onClick={() => onSelect({ kind: "line", id: l.id })}>{l.name}</button></td>
              <td><span className="swatch" style={{ background: statusColor(l.statusLevel) }} aria-hidden="true" />{l.statusDescription}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Busiest vs usual</h2>
      <table className="list">
        <caption className="visually-hidden">Tube stations, busiest-versus-usual first</caption>
        <thead><tr><th scope="col">Station</th><th scope="col">Vs usual</th></tr></thead>
        <tbody>
          {stations.map((s) => (
            <tr key={s.naptan}>
              <td><button type="button" onClick={() => onSelect({ kind: "station", naptan: s.naptan })}>{s.name}</button></td>
              <td><span className="swatch" style={{ background: bandColor(s.anomalyBand) }} aria-hidden="true" />{describeAnomaly(s.anomalyBand, s.anomaly)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
