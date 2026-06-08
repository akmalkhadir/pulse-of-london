# Self-Hosted Protomaps Basemap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the map real geographic context (streets, the Thames, place labels) by rendering a dark Protomaps vector basemap from a single self-hosted `london.pmtiles` file on R2 — no API key, no third-party tile ToS, free egress — with the existing TfL line/station layers drawn on top.

**Architecture:** A one-off `pmtiles extract` pulls a Greater-London bounding box (in the **Protomaps basemap schema**) out of Protomaps' public planet build and uploads it to the existing R2 bucket. In the browser, `MapView` registers the `pmtiles://` protocol, builds a MapLibre style from `@protomaps/basemaps` (dark flavor) pointed at the R2 file, then adds the TfL `lines`/`stations` layers on top with a dark casing so they pop. All map code stays client-only (dynamic import), so SSR is unaffected.

**Tech Stack:** MapLibre GL 5, `pmtiles` (JS protocol + Go CLI), `@protomaps/basemaps` (style/layers), React Router v7 on Cloudflare Workers, Vitest (node), Playwright (smoke).

**Spec:** `docs/superpowers/specs/2026-06-03-pulse-of-london-live-freshness-and-basemap-design.md` (Part 2).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/web/package.json` (modify) | Add `pmtiles` + `@protomaps/basemaps` deps. |
| `packages/web/app/lib/basemap.ts` (create) | `basemapStyle(url)` (pure style builder) + `registerPmtilesProtocol(maplibregl)`. |
| `packages/web/test/basemap.test.ts` (create) | Unit test for `basemapStyle`. |
| `packages/web/app/components/MapView.tsx` (modify) | Use the basemap style, register the protocol, add line casing. |
| `packages/web/app/components/AttributionFooter.tsx` (modify) | Add OSM + Protomaps credit. |
| `docs/basemap.md` (create) | Document how `london.pmtiles` is generated + refreshed. |

---

## Task 1: Add the basemap dependencies

**Files:**
- Modify: `packages/web/package.json`

- [ ] **Step 1: Install the two libraries into `@pulse/web`**

Run:
```bash
pnpm --filter @pulse/web add pmtiles@^4 @protomaps/basemaps@^5
```
Expected: both added under `dependencies` in `packages/web/package.json`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Verify the build still succeeds (no code uses them yet)**

Run: `pnpm --filter @pulse/web build`
Expected: build completes (client + SSR bundles) with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add pmtiles + @protomaps/basemaps"
```

---

## Task 2: Generate and upload `london.pmtiles`

This is an operational task (CLI + R2), not application code. The key correctness point: `@protomaps/basemaps` styles the **Protomaps basemap schema**, so the tiles must come from Protomaps' planet build (NOT a Planetiler/OpenMapTiles build). `pmtiles extract` reads the remote planet over HTTP range requests, so only the London region downloads.

- [ ] **Step 1: Install the `pmtiles` Go CLI**

Run (macOS): `brew install protomaps/tap/pmtiles`
(Or download a release binary from `https://github.com/protomaps/go-pmtiles/releases` and put it on PATH.)
Verify: `pmtiles version`
Expected: prints a version.

- [ ] **Step 2: Pick a recent planet build**

Protomaps publishes daily planet builds at `https://build.protomaps.com/`. Choose a recent dated file, e.g. `https://build.protomaps.com/20260601.pmtiles` (use a date that exists; the build page lists them).

- [ ] **Step 3: Extract the Greater London bounding box**

Run (bbox = west,south,east,north for Greater London):
```bash
pmtiles extract https://build.protomaps.com/20260601.pmtiles london.pmtiles \
  --bbox=-0.5103,51.2868,0.3340,51.6919 --maxzoom=15
```
Expected: writes `london.pmtiles` (tens of MB). The command reports tiles extracted.

- [ ] **Step 4: Sanity-check the archive**

Run: `pmtiles show london.pmtiles`
Expected: metadata shows a vector tileset, max zoom 15, and Protomaps layer names (e.g. `earth`, `water`, `roads`, `places`, `landuse`, `boundaries`). If you instead see `transportation`/`waterway` (OpenMapTiles names), you extracted from the wrong source — re-do Step 3 against a Protomaps planet build.

- [ ] **Step 5: Upload to the R2 bucket** (same bucket serving `snapshot.json`)

Run (replace `<BUCKET_NAME>` with the bucket behind `pub-65d41e5468344746919009655cb3a516.r2.dev`):
```bash
pnpm --filter @pulse/web exec wrangler r2 object put <BUCKET_NAME>/basemap/london.pmtiles \
  --file london.pmtiles --content-type application/octet-stream --remote
```
Expected: "Upload complete".

- [ ] **Step 6: Confirm public read + HTTP range support**

Run:
```bash
curl -s -r 0-99 -o /dev/null -w "%{http_code}\n" \
  https://pub-65d41e5468344746919009655cb3a516.r2.dev/basemap/london.pmtiles
```
Expected: `206` (Partial Content). A `200` means range requests aren't honored — pmtiles needs `206`; check the object exists and the bucket's public access is on.

- [ ] **Step 7: Document the process**

Create `docs/basemap.md`:

```markdown
# Self-hosted basemap (`london.pmtiles`)

The map's dark vector basemap is a single Protomaps-schema PMTiles file served
from R2 at `…/basemap/london.pmtiles`. It is **not** part of CI — regenerate it
manually a few times a year (OSM data drifts slowly):

1. `brew install protomaps/tap/pmtiles`
2. Extract Greater London from a recent Protomaps planet build:
   ```
   pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles london.pmtiles \
     --bbox=-0.5103,51.2868,0.3340,51.6919 --maxzoom=15
   ```
3. `pmtiles show london.pmtiles` — confirm Protomaps schema (layers: earth, water,
   roads, places, …), max zoom 15.
4. Upload: `wrangler r2 object put <bucket>/basemap/london.pmtiles --file london.pmtiles --content-type application/octet-stream --remote`
5. Confirm a ranged GET returns HTTP 206.

Attribution: OSM (ODbL) + Protomaps — rendered by `AttributionFooter` and the
map's compact attribution control. Glyphs/sprites load from
`protomaps.github.io/basemaps-assets` (no key); they may be moved to R2 later.
```

- [ ] **Step 8: Commit**

```bash
git add docs/basemap.md
git commit -m "docs: how to generate + upload london.pmtiles"
```

---

## Task 3: The basemap style module

**Files:**
- Create: `packages/web/app/lib/basemap.ts`
- Test: `packages/web/test/basemap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/basemap.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { basemapStyle } from "../app/lib/basemap";

describe("basemapStyle", () => {
  it("points the vector source at the pmtiles:// url", () => {
    const style = basemapStyle("https://cdn.example/london.pmtiles");
    const src = style.sources.protomaps as { type: string; url: string; attribution?: string };
    expect(src.type).toBe("vector");
    expect(src.url).toBe("pmtiles://https://cdn.example/london.pmtiles");
  });

  it("declares OSM attribution and a non-empty layer list", () => {
    const style = basemapStyle("https://cdn.example/london.pmtiles");
    const src = style.sources.protomaps as { attribution?: string };
    expect(src.attribution).toContain("OpenStreetMap");
    expect(Array.isArray(style.layers)).toBe(true);
    expect(style.layers.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- basemap`
Expected: FAIL — module not found / `basemapStyle` undefined.

- [ ] **Step 3: Implement the module**

Create `packages/web/app/lib/basemap.ts`:

```typescript
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

// Single self-hosted London vector basemap on R2 (no API key; R2 egress is free).
export const BASEMAP_PMTILES_URL =
  "https://pub-65d41e5468344746919009655cb3a516.r2.dev/basemap/london.pmtiles";

// Protomaps' public static font/sprite assets (no key). Could be moved to R2 later.
const ASSETS = "https://protomaps.github.io/basemaps-assets";

/** A dark Protomaps basemap style backed by a self-hosted pmtiles archive. */
export function basemapStyle(pmtilesUrl: string = BASEMAP_PMTILES_URL): StyleSpecification {
  return {
    version: 8,
    glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ASSETS}/sprites/v4/dark`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", namedFlavor("dark"), { lang: "en" }),
  };
}

/** Register the pmtiles:// protocol on a MapLibre instance (call once, client-only). */
export async function registerPmtilesProtocol(
  maplibregl: typeof import("maplibre-gl").default,
): Promise<void> {
  const { Protocol } = await import("pmtiles");
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}
```

> Note on `@protomaps/basemaps` versions: `layers(source, namedFlavor("dark"), { lang })` is the v4/v5 signature. If `pnpm` installed a different major where `namedFlavor` is absent, check that package's README — older builds accept `layers("protomaps", "dark")`. The source/glyphs/sprite wiring is unchanged either way.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- basemap`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/basemap.ts packages/web/test/basemap.test.ts
git commit -m "feat(web): dark Protomaps basemap style + pmtiles protocol"
```

---

## Task 4: Wire the basemap into `MapView`

Replace the empty style with the Protomaps style, register the protocol first, and add a dark **casing** under the coloured line layer so lines stay legible over streets. Keep all map imports inside the existing client-only effect (dynamic `import`) so SSR/workerd never loads `pmtiles`/`@protomaps/basemaps`.

**Files:**
- Modify: `packages/web/app/components/MapView.tsx`

- [ ] **Step 1: Replace the map-initialisation block**

In `packages/web/app/components/MapView.tsx`, find the init effect body (the `(async () => { … })()` that imports maplibre and constructs `new maplibregl.Map(...)`). Replace from the `const maplibregl = …` line through the end of the `map.on("load", …)` handler with:

```typescript
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      const { basemapStyle, registerPmtilesProtocol } = await import("../lib/basemap");
      if (cancelled || !containerRef.current) return;

      await registerPmtilesProtocol(maplibregl);
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        center: LONDON,
        zoom: 11,
        attributionControl: { compact: true },
        style: basemapStyle(),
      });
      mapRef.current = map;
      // Remove the MapLibre canvas from the tab order so keyboard focus goes
      // to the list controls first (WCAG 2.2 AA). The map container div already
      // has role="img" + aria-label for screen readers; the ListView provides
      // the full keyboard-navigable equivalent.
      map.getCanvas().setAttribute("tabindex", "-1");

      map.on("load", async () => {
        if (cancelled) return;
        const geometry: LineFeatureCollection = await fetch("/data/geometry.geojson").then((r) => r.json());
        if (cancelled) return;
        geometryRef.current = geometry;
        const snap = snapshotRef.current;

        map.addSource("lines", { type: "geojson", data: colourLines(geometry, snap.lines) as GeoJSON.FeatureCollection });
        // Dark casing under the coloured line so it reads over basemap streets.
        map.addLayer({ id: "lines-casing", type: "line", source: "lines", paint: { "line-color": "#0b1120", "line-width": 5 } });
        map.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": ["get", "color"], "line-width": 3 } });

        map.addSource("stations", { type: "geojson", data: stationsToGeoJSON(snap.stations) as GeoJSON.FeatureCollection });
        map.addLayer({
          id: "stations",
          type: "circle",
          source: "stations",
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["get", "radius"],
            "circle-stroke-color": "#0b1120",
            "circle-stroke-width": 1,
          },
        });

        map.on("click", "stations", (e) => {
          const naptan = e.features?.[0]?.properties?.naptan;
          if (typeof naptan === "string") onSelectRef.current({ kind: "station", naptan });
        });
        map.on("click", "lines", (e) => {
          const lineId = e.features?.[0]?.properties?.lineId;
          if (typeof lineId === "string") onSelectRef.current({ kind: "line", id: lineId });
        });

        loadedRef.current = true;
      });
```

(The top-of-file imports, the refs, the live-update effect, and the returned JSX are unchanged. Do not add a static `import` of `../lib/basemap` at the top — it must stay dynamic.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @pulse/web typecheck`
Expected: PASS. (`attributionControl: { compact: true }` and `style: StyleSpecification` are valid MapLibre `MapOptions`.)

- [ ] **Step 3: Build**

Run: `pnpm --filter @pulse/web build`
Expected: client + SSR bundles build with no errors (basemap code is only in the client chunk via dynamic import).

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/MapView.tsx
git commit -m "feat(web): render self-hosted basemap with line casing in MapView"
```

---

## Task 5: Attribution

**Files:**
- Modify: `packages/web/app/components/AttributionFooter.tsx`

- [ ] **Step 1: Add OSM + Protomaps credit**

Replace the body of `packages/web/app/components/AttributionFooter.tsx` with:

```tsx
export function AttributionFooter() {
  return (
    <footer className="footer">
      <p>
        Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016
        and Geomni UK Map data © and database rights 2019.
      </p>
      <p>
        Basemap © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors,
        tiles by <a href="https://protomaps.com">Protomaps</a>.
      </p>
      <p>
        <strong>Unofficial</strong> — not affiliated with or endorsed by Transport for London.
      </p>
    </footer>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @pulse/web typecheck && pnpm --filter @pulse/web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/AttributionFooter.tsx
git commit -m "feat(web): credit OpenStreetMap + Protomaps for the basemap"
```

---

## Task 6: End-to-end verification + deploy

**Files:** none (verification + deploy).

- [ ] **Step 1: Run the unit suite + the e2e smoke**

Run: `pnpm test`
Expected: PASS, including the new `basemap.test.ts`.

Run: `pnpm --filter @pulse/web test:e2e`
Expected: the smoke spec stays green (it asserts the DOM/list; WebGL doesn't paint headless, so the basemap canvas being blank in CI is expected and not asserted). First run may need `pnpm --filter @pulse/web exec playwright install chromium`.

- [ ] **Step 2: Visual check in a real browser locally**

Run: `pnpm --filter @pulse/web build && pnpm --filter @pulse/web preview --port 4173`
Open `http://localhost:4173`. Expected: a dark London map with **streets, the Thames, and place labels** behind the coloured tube lines and station dots; pan/zoom works; an "ⓘ" attribution control shows "© OpenStreetMap". (If the basemap is blank, open devtools → Network and confirm `…/basemap/london.pmtiles` returns 206s; check the console for `pmtiles`/protocol errors.)

- [ ] **Step 3: Deploy**

Run:
```bash
pnpm --filter @pulse/web build && pnpm --filter @pulse/web exec wrangler deploy \
  --var SNAPSHOT_URL:https://pub-65d41e5468344746919009655cb3a516.r2.dev/snapshot.json
```
Expected: deploy succeeds. (The `--var SNAPSHOT_URL` is still required at deploy — see the live-deploy memory — to keep the e2e fixture path intact while serving live data in prod.)

- [ ] **Step 4: Verify production**

Open `https://pulse-of-london.akmal-a-khadir.workers.dev`. Expected: the geographic dark basemap renders behind the live tube layers, and the footer shows OSM + Protomaps credit.

- [ ] **Step 5: Final commit (if any verification tweaks were needed)**

```bash
git add -A
git commit -m "chore(web): verify + deploy self-hosted basemap"
```

---

## Self-Review Notes (for the implementer)

- **Schema match is the #1 pitfall:** `@protomaps/basemaps` only styles Protomaps-schema tiles. Task 2 Step 4 guards against accidentally using an OpenMapTiles/Planetiler build.
- **SSR safety:** `pmtiles` and `@protomaps/basemaps` only ever load via dynamic `import()` inside the client effect, so the workerd SSR bundle never touches WebGL/browser-only code. The Vitest unit test runs `basemapStyle` in node, which is fine (pure JS).
- **CORS IS required (correction — the original assumption here was wrong):** the pmtiles file is fetched *cross-origin* by the browser (site on `…workers.dev`, file on `…r2.dev`). r2.dev serves ranges (206) but sends no `Access-Control-Allow-Origin`, so the bucket needs a one-time CORS rule allowing `GET` + the `Range` header from the site origin. See `docs/basemap.md`. (The snapshot avoids this via the same-origin `/api/snapshot` proxy; the basemap can't be proxied as cheaply because every tile is a range request, so direct-from-R2 + CORS is the right call.)
- **Cost:** R2 storage for ~tens of MB is pennies/month; egress is free. No API keys anywhere.
