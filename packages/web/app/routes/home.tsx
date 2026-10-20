import { useState } from "react";
import type { Route } from "./+types/home";
import { loadSnapshot } from "../lib/snapshot-source";
import { useSnapshot } from "../lib/use-snapshot";
import type { Selection } from "../lib/selection";
import { Masthead } from "../components/Masthead";
import { Verdict } from "../components/Verdict";
import { MapView } from "../components/MapView";
import { DetailPanel } from "../components/DetailPanel";
import { LineBoard } from "../components/LineBoard";
import { StationBoard } from "../components/StationBoard";
import { AttributionFooter } from "../components/AttributionFooter";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Pulse of London — is the network worse than usual?" },
    { name: "description", content: "A live, unofficial map of how busy and disrupted London's rail network is right now versus a typical day." },
    { name: "theme-color", content: "#0b0c0e" },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  // On Cloudflare, env/bindings come from context.cloudflare.env (not process.env).
  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } }).cloudflare?.env;
  const snapshot = await loadSnapshot({ SNAPSHOT_URL: env?.SNAPSHOT_URL });
  // The browser polls this public URL directly (zero Worker requests per poll); null in dev/test.
  return { snapshot, snapshotUrl: env?.SNAPSHOT_URL ?? null };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { snapshot, status } = useSnapshot(loaderData.snapshot, loaderData.snapshotUrl);
  const [selection, setSelection] = useState<Selection>(null);

  return (
    <div className="app">
      <Masthead generatedAt={snapshot.generatedAt} />
      <Verdict network={snapshot.network} generatedAt={snapshot.generatedAt} status={status} />
      <MapView snapshot={snapshot} selection={selection} onSelect={setSelection} />
      {selection && (
        <DetailPanel snapshot={snapshot} selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />
      )}
      <LineBoard snapshot={snapshot} selection={selection} onSelect={setSelection} />
      <StationBoard snapshot={snapshot} selection={selection} onSelect={setSelection} />
      <AttributionFooter />
    </div>
  );
}
