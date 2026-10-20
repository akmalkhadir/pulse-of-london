import { useEffect, useRef } from "react";
import { classifyAnomaly, type LineSnapshot, type Snapshot, type StationSnapshot } from "@pulse/shared";
import { describeAnomaly, signedPercent } from "../lib/format";
import type { Selection } from "../lib/selection";
import { bandVar } from "./MapKey";
import { CloseIcon } from "./Icons";

interface Props {
  snapshot: Snapshot;
  selection: Exclude<Selection, null>;
  onSelect: (s: Selection) => void;
  onClose: () => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function StationDetail({ station, snapshot, onSelect }: { station: StationSnapshot; snapshot: Snapshot; onSelect: Props["onSelect"] }) {
  const unknown = station.anomalyBand === "unknown" || station.anomaly === null;
  const lines = station.lines
    .map((id) => snapshot.lines.find((l) => l.id === id))
    .filter((l): l is LineSnapshot => Boolean(l));
  return (
    <div className="detail__body">
      {unknown ? (
        <p className="detail__prose">TfL isn't publishing live crowding for this station right now, so there's nothing to compare with a typical day.</p>
      ) : (
        <>
          <p className="detail__figure">
            <span className="detail__big" style={{ "--c": bandVar(station.anomalyBand) } as React.CSSProperties}>{signedPercent(station.anomaly)}</span>
            <span className="detail__phrase">{describeAnomaly(station.anomalyBand, station.anomaly)}</span>
          </p>
          {station.live !== null && station.typical !== null && (
            <dl className="facts">
              <dt>Now</dt>
              <dd>{pct(station.live)} of its busiest level</dd>
              <dt>Usually</dt>
              <dd>{pct(station.typical)} at this time of day</dd>
            </dl>
          )}
        </>
      )}
      {lines.length > 0 && (
        <div>
          <p className="detail__muted">Lines here</p>
          <ul className="chips">
            {lines.map((l) => (
              <li key={l.id}>
                <button type="button" className="chip" data-level={l.statusLevel} onClick={() => onSelect({ kind: "line", id: l.id, from: "board" })}>
                  {l.name}
                  <span className="visually-hidden">: {l.statusDescription}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LineDetail({ line, snapshot }: { line: LineSnapshot; snapshot: Snapshot }) {
  const disruptions = [...new Set(line.disruptions.map((d) => d.description.trim()).filter(Boolean))];
  const stations = snapshot.stations.filter((s) => s.lines.includes(line.id) && s.anomaly !== null);
  const busier = stations.filter((s) => s.anomalyBand === "busier" || s.anomalyBand === "much_busier").length;
  const quieter = stations.filter((s) => s.anomalyBand === "quieter" || s.anomalyBand === "much_quieter").length;
  const quiet = line.statusLevel === "good" || line.statusLevel === "unknown";
  return (
    <div className="detail__body">
      <p className={quiet ? "led detail__status row__value--quiet" : "led detail__status"}>{line.statusDescription}</p>
      {disruptions.map((d) => (
        <p key={d} className="detail__prose">{d}</p>
      ))}
      {line.crowdingAnomaly !== null ? (
        <>
          <p className="detail__figure">
            <span className="detail__big" style={{ "--c": bandVar(classifyAnomaly(line.crowdingAnomaly)) } as React.CSSProperties}>
              {signedPercent(line.crowdingAnomaly)}
            </span>
            <span className="detail__phrase">
              {describeAnomaly(classifyAnomaly(line.crowdingAnomaly), line.crowdingAnomaly)} at a typical station on this line
            </span>
          </p>
          {stations.length > 0 && (
            <p className="detail__muted">
              Of its {stations.length} stations with live data, {busier} {busier === 1 ? "is" : "are"} busier than usual and {quieter} {quieter === 1 ? "is" : "are"} quieter.
            </p>
          )}
        </>
      ) : (
        <p className="detail__muted">TfL publishes live crowding for Underground stations only, so this line shows status without crowding.</p>
      )}
    </div>
  );
}

export function DetailPanel({ snapshot, selection, onSelect, onClose }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const key = selection.kind === "line" ? selection.id : selection.naptan;

  // Move focus to the panel on each new pick (so screen readers hear it), remembering where to return.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && !active.closest(".detail")) returnFocusRef.current = active;
    headingRef.current?.focus({ preventScroll: true });
  }, [key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function close() {
    const back = returnFocusRef.current;
    onClose();
    if (back?.isConnected) back.focus({ preventScroll: true });
  }

  const line = selection.kind === "line" ? snapshot.lines.find((l) => l.id === selection.id) : undefined;
  const station = selection.kind === "station" ? snapshot.stations.find((s) => s.naptan === selection.naptan) : undefined;
  const name = line?.name ?? station?.name;
  if (!name) return null;

  return (
    <section className="detail" aria-label={`Details for ${name}`}>
      <div className="detail__head">
        <h2 className="detail__title" ref={headingRef} tabIndex={-1}>{name}</h2>
        <button type="button" className="detail__close" onClick={close} aria-label={`Close details for ${name}`}>
          <CloseIcon size={20} />
        </button>
      </div>
      {line && <LineDetail line={line} snapshot={snapshot} />}
      {station && <StationDetail station={station} snapshot={snapshot} onSelect={onSelect} />}
    </section>
  );
}
