import { classifyAnomaly, type NetworkSummary } from "@pulse/shared";
import type { PollStatus } from "../lib/poller";
import { bandColor } from "../lib/colors";
import { isOvernight, londonTime, londonWeekdayName, signedPercent, verdictTitle } from "../lib/format";
import { AlertIcon } from "./Icons";

interface Props {
  network: NetworkSummary;
  generatedAt: string;
  status: PollStatus;
}

function FeedNotice({ status, generatedAt }: { status: PollStatus; generatedAt: string }) {
  if (status === "fresh") return null;
  const last = new Date(generatedAt);
  let message: string;
  if (status === "error") {
    message = "Can't reach the live feed right now. Showing the last update; we'll keep trying.";
  } else if (isOvernight(new Date())) {
    message = `Live updates pause overnight, from 22:00 to 06:00. This is the last update, from ${londonTime(last)}.`;
  } else {
    message = `The live feed hasn't updated since ${londonTime(last)}, so this may be out of date.`;
  }
  return (
    <p className="notice" role="status">
      <AlertIcon />
      <span>{message}</span>
    </p>
  );
}

export function Verdict({ network, generatedAt, status }: Props) {
  const band = classifyAnomaly(network.crowdingAnomaly);
  return (
    <section className="verdict" aria-labelledby="verdict-title">
      <h1 id="verdict-title" className="led verdict__title">{verdictTitle(network.verdict)}</h1>
      {/* The title already says busier/quieter and the readout counts disruptions; this line adds the baseline. */}
      <p className="verdict__headline">Versus a typical {londonWeekdayName(new Date(generatedAt))} at this time.</p>
      <dl className="led verdict__readout">
        <div>
          <dt>Network</dt>
          <dd style={{ color: bandColor(band), textShadow: "none" }}>
            {network.crowdingAnomaly === null ? "No live crowding" : `${signedPercent(network.crowdingAnomaly)} vs usual`}
          </dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>{network.disruptedLineCount === 0 ? "All running" : `${network.disruptedLineCount} disrupted`}</dd>
        </div>
      </dl>
      <FeedNotice status={status} generatedAt={generatedAt} />
    </section>
  );
}
