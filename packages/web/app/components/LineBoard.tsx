import { useRef, useState } from "react";
import type { LineSnapshot, Snapshot } from "@pulse/shared";
import { sortLinesWorstFirst } from "../lib/sort";
import { ordinal } from "../lib/format";
import { isLineSelected, type Selection } from "../lib/selection";
import { useChangedKeys, useSeen, useStoredFlag } from "../lib/use-board";
import { Ticker } from "./Ticker";
import { ChevronIcon, PauseIcon, PlayIcon } from "./Icons";

interface Props {
  snapshot: Snapshot;
  selection: Selection;
  onSelect: (s: Selection) => void;
}

function disruptionText(line: LineSnapshot): string {
  return [...new Set(line.disruptions.map((d) => d.description.trim()).filter(Boolean))].join("   ·   ");
}

function LineRow({
  line,
  rank,
  selected,
  changed,
  onSeen,
  onSelect,
}: {
  line: LineSnapshot;
  rank: string;
  selected: boolean;
  changed: boolean;
  onSeen: () => void;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useSeen(ref, changed, onSeen);
  const quiet = line.statusLevel === "good" || line.statusLevel === "unknown";
  return (
    <button ref={ref} type="button" className="row row--line" aria-pressed={selected} data-changed={changed || undefined} onClick={onSelect}>
      {changed && <span className="row__pip" aria-hidden="true" />}
      <span className="led row__rank">{rank}</span>
      <span className="led row__name">{line.name}</span>
      <span className={quiet ? "led row__value row__value--quiet" : "led row__value"}>{line.statusDescription}</span>
      {changed && <span className="visually-hidden"> (changed since the last update)</span>}
    </button>
  );
}

export function LineBoard({ snapshot, selection, onSelect }: Props) {
  const lines = sortLinesWorstFirst(snapshot.lines);
  const disrupted = lines.filter((l) => l.statusLevel === "severe" || l.statusLevel === "minor");
  const others = lines.filter((l) => !disrupted.includes(l));
  const [showOthers, setShowOthers] = useState(false);
  const [paused, setPaused] = useStoredFlag("pulse:ticker-paused");
  const { changed, markSeen } = useChangedKeys(snapshot.lines, (l) => l.id, (l) => l.statusDescription, snapshot.generatedAt);
  const hasTickers = disrupted.some((l) => disruptionText(l));
  const othersAllGood = others.every((l) => l.statusLevel === "good");

  const select = (id: string) => onSelect(isLineSelected(selection, id) ? null : { kind: "line", id, from: "board" });

  return (
    <section className="board lines" aria-labelledby="lines-title" data-paused={paused}>
      <div className="board__head">
        <h2 id="lines-title" className="led board__title">Lines</h2>
        {hasTickers ? (
          <button type="button" className="board__control" aria-pressed={paused} onClick={() => setPaused(!paused)}>
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? "Scroll details" : "Pause details"}
          </button>
        ) : (
          <span className="board__meta">Worst first</span>
        )}
      </div>
      <ol className="rows">
        {disrupted.map((line, i) => {
          const text = disruptionText(line);
          return (
            <li key={line.id}>
              <LineRow
                line={line}
                rank={ordinal(i + 1)}
                selected={isLineSelected(selection, line.id)}
                changed={changed.has(line.id)}
                onSeen={() => markSeen(line.id)}
                onSelect={() => select(line.id)}
              />
              {text && <Ticker text={text} />}
            </li>
          );
        })}
        {others.length > 0 && (
          <li>
            <button
              type="button"
              className="row row--line row-summary"
              aria-expanded={showOthers}
              aria-controls="lines-others"
              onClick={() => setShowOthers(!showOthers)}
            >
              <span className="led row__rank" aria-hidden="true"><ChevronIcon /></span>
              <span className="led row__name">
                {disrupted.length === 0 ? `All ${others.length} lines` : `${others.length} other lines`}
              </span>
              <span className="led row__value">{othersAllGood ? "Good service" : "No disruption"}</span>
            </button>
            {showOthers && (
              <ul className="rows" id="lines-others">
                {others.map((line) => (
                  <li key={line.id}>
                    <LineRow
                      line={line}
                      rank=""
                      selected={isLineSelected(selection, line.id)}
                      changed={changed.has(line.id)}
                      onSeen={() => markSeen(line.id)}
                      onSelect={() => select(line.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ol>
    </section>
  );
}
