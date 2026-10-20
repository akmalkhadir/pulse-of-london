import { computeStaleness, londonClock } from "../lib/format";
import { useNow } from "../lib/use-board";

export function Masthead({ generatedAt }: { generatedAt: string }) {
  const now = useNow(generatedAt);
  const stale = computeStaleness(generatedAt, now);
  return (
    <header className="masthead">
      <p>
        <span className="led masthead__name">Pulse of London</span>
        <span className="masthead__tag">Unofficial</span>
      </p>
      <div className="masthead__clock">
        {/* The ticking clock is ambience; the freshness line is what screen readers get. */}
        <span className="led clock" aria-hidden="true">{londonClock(now)}</span>
        <span className="freshness" data-stale={stale.isStale}>Updated {stale.label}</span>
      </div>
    </header>
  );
}
