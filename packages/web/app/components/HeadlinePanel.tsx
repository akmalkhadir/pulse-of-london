import type { NetworkSummary } from "@pulse/shared";
import type { PollStatus } from "../lib/poller";
import { computeStaleness } from "../lib/format";

interface Props {
  network: NetworkSummary;
  generatedAt: string;
  status: PollStatus;
  now: Date;
}

export function HeadlinePanel({ network, generatedAt, status, now }: Props) {
  const stale = computeStaleness(generatedAt, now);
  return (
    <section className="panel" aria-label="Network summary">
      <h2>{network.headline}</h2>
      <p className="mono">Updated {stale.label}</p>
      {(status === "stale" || stale.isStale) && (
        <p className="banner--stale" role="status">Data may be out of date — the live feed hasn't updated recently.</p>
      )}
      {status === "error" && (
        <p className="banner--stale" role="status">Couldn't reach the live feed; showing the last good data.</p>
      )}
    </section>
  );
}
