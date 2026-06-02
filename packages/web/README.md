# @pulse/web — Pulse of London frontend

React Router v7 (SSR) app. Renders the live anomaly map from `snapshot.json`.

## Local dev

```
pnpm --filter @pulse/web dev      # http://localhost:5173 (uses the bundled fixture)
pnpm --filter @pulse/web build && pnpm --filter @pulse/web start
pnpm test                         # unit tests (run from repo root)
pnpm --filter @pulse/web test:e2e # Playwright smoke (see note below)
```

## Data wiring

- **Dev/test:** no `SNAPSHOT_URL` set — the loader returns the bundled `app/fixtures/sample-snapshot.ts`. The `app_key` never reaches the browser; it lives only in the ingestor.
- **Prod:** set `SNAPSHOT_URL` to the **public** R2 URL of `snapshot.json` (written by the Plan 1 ingestor). The loader fetches it server-side on every request for SSR first paint; the client then polls the same URL every 30 s. On any fetch failure or schema-version mismatch the loader falls back to the bundled sample, so the page always renders.
- **Line geometry:** replace `public/data/geometry.geojson` with the file produced by `pnpm bootstrap:geometry` (Plan 1). Before deploying, verify that coordinates are in **[lon, lat]** order (GeoJSON standard): open the file and confirm the first number is negative (London's longitude is roughly −0.1, latitude is roughly 51.5).

## Deploy to Cloudflare Pages (go-live)

1. Add the Cloudflare preset:
   ```
   pnpm --filter @pulse/web add -D @cloudflare/vite-plugin wrangler
   ```
   Then follow the React Router Cloudflare guide to switch the server build target (`ssr: true` stays; the adapter changes).
2. Set the `SNAPSHOT_URL` environment variable in the Pages project settings.
3. **Workers Caches API:** Cloudflare Pages ignores `Cache-Control` headers set by the loader, so every request triggers a fresh upstream fetch. For production efficiency, wrap the `fetch(SNAPSHOT_URL)` call in the [Workers Caches API](https://developers.cloudflare.com/workers/runtime-apis/cache/) with a ~30 s TTL inside the loader. This is an optional performance optimisation — correctness holds without it, since the fallback to the bundled sample is always in place.
4. Attribution, independent branding, and the "Unofficial" notice are already rendered by `AttributionFooter` (satisfies TfL ToS §12).

## Go-live considerations

- **Hydration timing on "Updated X ago":** The home route computes `now = new Date()` at render time and passes it to `HeadlinePanel`, which produces the "Updated X ago" label. With the fixed sample fixture the SSR and client clocks agree to the second. Once a live, recently-generated `snapshot.generatedAt` is wired up, the server-rendered label and the client-rendered label can differ by a second (server renders at request time; client renders slightly later), causing a React hydration warning in the browser console. Before go-live, either seed `now` from `generatedAt` and refresh it in a `useEffect`, or add `suppressHydrationWarning` to the `<p>` element that contains the label.
- **Map live updates preserve pan/zoom:** `MapView` updates source data in place via `source.setData()` when the snapshot changes (no map rebuild). Users' current pan position and zoom level are preserved across every 30-second poll cycle.
- **Playwright browser install:** The first run of `pnpm --filter @pulse/web test:e2e` requires a one-time browser download. Run `pnpm --filter @pulse/web exec playwright install chromium` before the first e2e run (needs network access).
