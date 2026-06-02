import { useState } from "react";
import type { Route } from "./+types/home";
import { loadSnapshot } from "../lib/snapshot-source";
import { useSnapshot } from "../lib/use-snapshot";
import { HeadlinePanel } from "../components/HeadlinePanel";
import { MapView } from "../components/MapView";
import { ListView } from "../components/ListView";
import { DetailPanel, type Selection } from "../components/DetailPanel";
import { Legend } from "../components/Legend";
import { AttributionFooter } from "../components/AttributionFooter";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Pulse of London — is the network worse than usual?" },
    { name: "description", content: "A live, unofficial map of how busy and disrupted London's rail network is right now versus a typical day." },
  ];
}

export async function loader(_: Route.LoaderArgs) {
  const snapshotUrl = process.env.SNAPSHOT_URL;
  const snapshot = await loadSnapshot({ SNAPSHOT_URL: snapshotUrl });
  return { snapshot, snapshotUrl: snapshotUrl ?? null };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { snapshot, status } = useSnapshot(loaderData.snapshot, loaderData.snapshotUrl ?? undefined);
  const [selection, setSelection] = useState<Selection>(null);
  const now = new Date();

  return (
    <div className="page">
      <header className="page__header">
        <h1>Pulse of London</h1>
        <HeadlinePanel network={snapshot.network} generatedAt={snapshot.generatedAt} status={status} now={now} />
      </header>
      <div className="page__body">
        <MapView snapshot={snapshot} onSelect={setSelection} />
        <div>
          <DetailPanel snapshot={snapshot} selection={selection} />
          <Legend />
          <ListView snapshot={snapshot} onSelect={setSelection} />
        </div>
      </div>
      <AttributionFooter />
    </div>
  );
}
