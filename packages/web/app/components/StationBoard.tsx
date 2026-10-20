import { useId, useMemo, useRef, useState } from "react";
import type { Snapshot, StationSnapshot } from "@pulse/shared";
import { sortStationsQuietestFirst, sortStationsWorstFirst } from "../lib/sort";
import { describeAnomaly, ordinal, signedPercent } from "../lib/format";
import { isStationSelected, type Selection } from "../lib/selection";
import { useChangedKeys, useSeen } from "../lib/use-board";
import { bandVar } from "./MapKey";
import { ChevronIcon, SearchIcon } from "./Icons";

const TOP_N = 10;

type Mode = "busier" | "quieter";

interface Props {
  snapshot: Snapshot;
  selection: Selection;
  onSelect: (s: Selection) => void;
}

/** Lower-case and strip punctuation so "kings cross" finds "King's Cross St. Pancras". */
function normalise(s: string): string {
  return s.toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function StationRow({
  station,
  rank,
  selected,
  changed,
  onSeen,
  onSelect,
}: {
  station: StationSnapshot;
  rank: string;
  selected: boolean;
  changed: boolean;
  onSeen: () => void;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useSeen(ref, changed, onSeen);
  const unknown = station.anomalyBand === "unknown" || station.anomaly === null;
  return (
    <button ref={ref} type="button" className="row" aria-pressed={selected} data-changed={changed || undefined} onClick={onSelect}>
      {changed && <span className="row__pip" aria-hidden="true" />}
      <span className="led row__rank">{rank}</span>
      <span className="led row__name">{station.name}</span>
      <span
        className="led row__value row__value--figure"
        style={selected ? undefined : { color: unknown ? "var(--ink-3)" : bandVar(station.anomalyBand) }}
        aria-hidden="true"
      >
        <span className={unknown ? "dot dot--ring" : "dot"} style={{ "--c": bandVar(station.anomalyBand) } as React.CSSProperties} />
        {unknown ? "No data" : signedPercent(station.anomaly)}
      </span>
      <span className="visually-hidden">, {describeAnomaly(station.anomalyBand, station.anomaly)}{changed ? " (changed since the last update)" : ""}</span>
    </button>
  );
}

export function StationBoard({ snapshot, selection, onSelect }: Props) {
  const [mode, setMode] = useState<Mode>("busier");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const searchId = useId();
  const { changed, markSeen } = useChangedKeys(snapshot.stations, (s) => s.naptan, (s) => s.anomalyBand, snapshot.generatedAt);

  const ranked = useMemo(
    () => (mode === "busier" ? sortStationsWorstFirst(snapshot.stations) : sortStationsQuietestFirst(snapshot.stations)),
    [mode, snapshot.stations],
  );
  const rankOf = useMemo(() => {
    const m = new Map<string, string>();
    let n = 0;
    for (const s of ranked) m.set(s.naptan, s.anomaly === null ? "—" : ordinal(++n));
    return m;
  }, [ranked]);

  const q = normalise(query);
  const matches = q ? ranked.filter((s) => normalise(s.name).includes(q)) : null;
  const visible = matches ?? (showAll ? ranked : ranked.slice(0, TOP_N));
  const select = (naptan: string) =>
    onSelect(isStationSelected(selection, naptan) ? null : { kind: "station", naptan, from: "board" });

  return (
    <section className="board stations" aria-labelledby="stations-title">
      <div className="board__head">
        <h2 id="stations-title" className="led board__title">Stations</h2>
        <span className="board__meta">vs a typical day at this time</span>
      </div>
      <div className="stations__tools">
        <div className="search">
          <label htmlFor={searchId} className="visually-hidden">Find a station</label>
          <SearchIcon />
          <input
            id={searchId}
            type="search"
            placeholder="Find a station"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="segmented" role="group" aria-label="Order stations by">
          <button type="button" aria-pressed={mode === "busier"} onClick={() => setMode("busier")}>Busiest</button>
          <button type="button" aria-pressed={mode === "quieter"} onClick={() => setMode("quieter")}>Quietest</button>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="board__empty" role="status">No station matches “{query.trim()}”. Try part of the name, like “oxford”.</p>
      ) : (
        <ol className="rows" aria-label={mode === "busier" ? "Stations, busiest versus usual first" : "Stations, quietest versus usual first"}>
          {visible.map((s) => (
            <li key={s.naptan}>
              <StationRow
                station={s}
                rank={rankOf.get(s.naptan) ?? "—"}
                selected={isStationSelected(selection, s.naptan)}
                changed={changed.has(s.naptan)}
                onSeen={() => markSeen(s.naptan)}
                onSelect={() => select(s.naptan)}
              />
            </li>
          ))}
        </ol>
      )}
      {!matches && ranked.length > TOP_N && (
        <button type="button" className="board__more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? `Show the top ${TOP_N}` : `Show all ${ranked.length} stations`}
          <ChevronIcon />
        </button>
      )}
    </section>
  );
}
