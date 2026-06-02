import type { Route } from "./+types/home";
import { loadSnapshot } from "../lib/snapshot-source";

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
  return (
    <main className="page">
      <header className="page__header">
        <h1>Pulse of London</h1>
        <p className="mono">{loaderData.snapshot.network.headline}</p>
      </header>
    </main>
  );
}
