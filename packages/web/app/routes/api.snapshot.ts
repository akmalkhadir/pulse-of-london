import type { Route } from "./+types/api.snapshot";
import { loadSnapshot } from "../lib/snapshot-source";

// Same-origin proxy for the live snapshot: the browser polls THIS route (no CORS),
// and the Worker fetches the public R2 snapshot server-side. The upstream r2.dev URL
// already sets max-age=30, so Cloudflare edge-caches the upstream fetch.
export async function loader({ context }: Route.LoaderArgs) {
  const env = (context as { cloudflare?: { env?: Record<string, string | undefined> } }).cloudflare?.env;
  const snapshot = await loadSnapshot({ SNAPSHOT_URL: env?.SNAPSHOT_URL });
  return Response.json(snapshot, {
    headers: { "cache-control": "public, max-age=30" },
  });
}
