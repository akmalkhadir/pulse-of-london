# Pulse of London — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Remix / React Router v7 web app that renders "Pulse of London" — a live, SSR'd geographic map of London's rail network where stations glow by how far today deviates from the typical pattern ("worse than usual"), with an accessible list fallback, an opinionated headline, and the required TfL attribution.

**Architecture:** A React Router v7 (framework mode, SSR) app at `packages/web` in the existing pnpm monorepo. The route `loader` fetches the public `snapshot.json` (produced by the Plan 1 ingestor) for server-rendered first paint; the client then polls it for live updates. Presentation logic is pure and unit-tested (TDD); MapLibre GL renders client-only on a dark canvas; everything else (headline, list, legend, footer) is SSR'd. Develops against committed fixtures so it is fully testable without the live pipeline.

**Tech Stack:** React Router v7 (`@react-router/dev`, SSR), React 18, TypeScript, Vite, MapLibre GL JS (open-source, no token), Vitest (pure-logic TDD, reusing the monorepo's node runner), Playwright (e2e smoke + a11y). Consumes `@pulse/shared` for the snapshot contract.

**Spec:** `docs/superpowers/specs/2026-05-30-pulse-of-london-design.md` (frontend = §7, §10, §11; ToS = §12)
**Depends on:** Plan 1 (`@pulse/shared` snapshot schema). The live `snapshot.json` + `data/geometry.geojson` are produced by the ingestor at go-live; this plan uses committed sample fixtures until then.

---

## External setup (do once)

1. **Playwright browser** — Task 16 runs `pnpm --filter @pulse/web exec playwright install chromium` (downloads a headless Chromium). Needs network once.
2. **Fonts** — the "elegant" theme names *Google Sans* (proprietary, not freely embeddable — spec §16 open Q3) and *Anonymous Pro* (open). This plan uses **Inter** (open, geometric-humanist — the closest faithful substitute for Google Sans) for body/display and **Anonymous Pro** for mono, loaded via Google Fonts `<link>`. This resolves spec open Q3.
3. **Production data URL** — at go-live set `SNAPSHOT_URL` to the public R2 URL of `snapshot.json` and place the generated `geometry.geojson` at `packages/web/public/data/geometry.geojson` (see Task 17). Until then the bundled fixtures are used.

## File structure (created by this plan)

```
pnpm-workspace.yaml                    # MODIFY: already globs packages/* — no change needed
packages/web/
  package.json                         # @pulse/web — RR7 app
  react-router.config.ts               # ssr: true
  vite.config.ts                       # reactRouter() plugin
  tsconfig.json                        # RR7 + react types
  .gitignore                           # build/, .react-router/
  app/
    root.tsx                           # HTML shell, fonts, theme tokens, ErrorBoundary
    routes.ts                          # route table (index → home)
    routes/home.tsx                    # loader (SSR snapshot) + page composition
    styles/
      tokens.css                       # elegant design tokens (light chrome)
      app.css                          # layout + component styles (incl. dark map chrome)
    lib/
      geometry.ts                      # Geometry GeoJSON types
      colors.ts                        # band/status → dark-map hex
      format.ts                        # describeAnomaly / relativeAge / computeStaleness
      sort.ts                          # worst-first ordering
      snapshot-source.ts               # loadSnapshot(env, fetch) + schemaVersion guard
      poller.ts                        # pure poll reducer (fresh|stale|error)
      map-data.ts                      # snapshot+geometry → station GeoJSON + line colours
      use-snapshot.ts                  # React hook: SSR data + client polling
    components/
      AttributionFooter.tsx
      Legend.tsx
      HeadlinePanel.tsx
      DetailPanel.tsx
      ListView.tsx
      MapView.tsx                      # client-only MapLibre
    fixtures/
      sample-snapshot.ts               # bundled fallback Snapshot (typed)
  public/
    data/geometry.geojson              # sample line geometry (replaced at go-live)
  test/                                # node-env unit tests (picked up by root vitest)
    colors.test.ts
    format.test.ts
    sort.test.ts
    snapshot-source.test.ts
    poller.test.ts
    map-data.test.ts
  e2e/
    smoke.spec.ts                      # Playwright
  playwright.config.ts
```

**Test wiring note:** the monorepo's root `vitest.config.ts` already includes `packages/**/test/**/*.test.ts` with the node environment. All web **pure-logic** tests live in `packages/web/test/` and import from `../app/lib/*`, so they are picked up by `pnpm test` with **no root config change**. Components are verified by the Playwright e2e (Task 16), per spec §14. Web typechecking is its own script (`react-router typegen && tsc`), NOT part of the root `tsc -b` (RR7 generates its own types).

---

### Task 0: Scaffold the React Router v7 app

**Files:**
- Create: `packages/web/package.json`, `react-router.config.ts`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `app/root.tsx`, `app/routes.ts`, `app/routes/home.tsx`

- [ ] **Step 1: Create the package manifest**

`packages/web/package.json`:

```json
{
  "name": "@pulse/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc --noEmit",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@pulse/shared": "workspace:*",
    "@react-router/node": "^7.1.0",
    "@react-router/serve": "^7.1.0",
    "isbot": "^5.1.0",
    "maplibre-gl": "^4.7.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router": "^7.1.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@react-router/dev": "^7.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "vite": "^5.4.0",
    "vite-tsconfig-paths": "^5.1.0"
  }
}
```

- [ ] **Step 2: Create the RR7 config files**

`packages/web/react-router.config.ts`:

```ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
} satisfies Config;
```

`packages/web/vite.config.ts`:

```ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
});
```

`packages/web/tsconfig.json`:

```json
{
  "include": ["app/**/*", ".react-router/types/**/*"],
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "types": ["@react-router/node", "vite/client"],
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "rootDirs": [".", "./.react-router/types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

`packages/web/.gitignore`:

```
build/
.react-router/
```

- [ ] **Step 3: Create the root layout + route table + a minimal home route**

`packages/web/app/root.tsx`:

```tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/root";
import "./styles/tokens.css";
import "./styles/app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@100..600&family=Anonymous+Pro&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";
  return (
    <main className="error">
      <h1>Something went wrong</h1>
      <p>{message}</p>
    </main>
  );
}
```

`packages/web/app/routes.ts`:

```ts
import { type RouteConfig, index } from "@react-router/dev/routes";

export default [index("routes/home.tsx")] satisfies RouteConfig;
```

`packages/web/app/routes/home.tsx`:

```tsx
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Pulse of London — is the network worse than usual?" },
    { name: "description", content: "A live, unofficial map of how busy and disrupted London's rail network is right now versus a typical day." },
  ];
}

export default function Home(_: Route.ComponentProps) {
  return <main>Pulse of London</main>;
}
```

Create empty stub stylesheets so the imports resolve (filled in Task 8):
`packages/web/app/styles/tokens.css` → `/* tokens (Task 8) */`
`packages/web/app/styles/app.css` → `/* app styles (Task 8) */`

- [ ] **Step 4: Install and verify build + typecheck**

Run: `pnpm install`
Expected: links `@pulse/shared`, installs RR7 + MapLibre, no errors.

Run: `pnpm --filter @pulse/web typecheck`
Expected: `react-router typegen` generates `.react-router/types`, then `tsc --noEmit` exits 0.

Run: `pnpm --filter @pulse/web build`
Expected: builds client + server bundles into `packages/web/build/`, exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/web pnpm-lock.yaml
git commit -m "feat(web): scaffold React Router v7 app"
```

---

### Task 1: Sample fixtures + geometry types

**Files:**
- Create: `packages/web/app/lib/geometry.ts`, `packages/web/app/fixtures/sample-snapshot.ts`, `packages/web/public/data/geometry.geojson`

- [ ] **Step 1: Define the geometry types**

`packages/web/app/lib/geometry.ts`:

```ts
export interface LineFeature {
  type: "Feature";
  properties: { lineId: string; lineName: string };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export interface LineFeatureCollection {
  type: "FeatureCollection";
  features: LineFeature[];
}
```

- [ ] **Step 2: Create the bundled sample snapshot (typed, used as the dev/test fallback)**

`packages/web/app/fixtures/sample-snapshot.ts`:

```ts
import type { Snapshot } from "@pulse/shared";

/** Representative snapshot for local dev + tests until the live pipeline is wired. */
export const sampleSnapshot: Snapshot = {
  schemaVersion: 1,
  generatedAt: "2026-05-30T17:10:00.000Z",
  freshness: { statusAgeSec: 35, crowdingAgeSec: 130 },
  network: {
    crowdingAnomaly: 1.22,
    disruptedLineCount: 2,
    verdict: "busier_than_usual",
    headline: "Busier than usual for a Saturday, with 2 lines disrupted (worst: Central).",
    worstLines: ["Central"],
  },
  lines: [
    { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", statusLevel: "good", disruptions: [], crowdingAnomaly: 1.31 },
    { id: "central", name: "Central", mode: "tube", statusSeverity: 6, statusDescription: "Severe Delays", statusLevel: "severe", disruptions: [{ category: "RealTime", description: "Severe delays due to a signal failure at Liverpool Street." }], crowdingAnomaly: 1.8 },
    { id: "circle", name: "Circle", mode: "tube", statusSeverity: 9, statusDescription: "Minor Delays", statusLevel: "minor", disruptions: [{ category: "RealTime", description: "Minor delays due to an earlier faulty train." }], crowdingAnomaly: 0.7 },
    { id: "elizabeth", name: "Elizabeth line", mode: "elizabeth-line", statusSeverity: 10, statusDescription: "Good Service", statusLevel: "good", disruptions: [], crowdingAnomaly: null },
  ],
  stations: [
    { naptan: "940GZZLUVIC", name: "Victoria", lat: 51.496, lon: -0.1437, lines: ["victoria", "circle"], live: 0.62, typical: 0.48, anomaly: 1.29, anomalyBand: "busier", dataAvailable: true },
    { naptan: "940GZZLUOXC", name: "Oxford Circus", lat: 51.515, lon: -0.1417, lines: ["victoria", "central"], live: 0.9, typical: 0.5, anomaly: 1.8, anomalyBand: "much_busier", dataAvailable: true },
    { naptan: "940GZZLULVT", name: "Liverpool Street", lat: 51.5178, lon: -0.0823, lines: ["central", "circle"], live: 0.3, typical: 0.55, anomaly: 0.55, anomalyBand: "much_quieter", dataAvailable: true },
    { naptan: "940GZZLUKSX", name: "King's Cross St. Pancras", lat: 51.5308, lon: -0.1238, lines: ["victoria", "circle"], live: null, typical: null, anomaly: null, anomalyBand: "unknown", dataAvailable: false },
  ],
};
```

- [ ] **Step 3: Create the sample geometry (served as a static asset)**

`packages/web/public/data/geometry.geojson` (coordinates are `[lon, lat]`; short representative segments):

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": { "lineId": "victoria", "lineName": "Victoria" }, "geometry": { "type": "LineString", "coordinates": [[-0.1437, 51.496], [-0.1417, 51.515], [-0.1238, 51.5308]] } },
    { "type": "Feature", "properties": { "lineId": "central", "lineName": "Central" }, "geometry": { "type": "LineString", "coordinates": [[-0.1417, 51.515], [-0.0823, 51.5178]] } },
    { "type": "Feature", "properties": { "lineId": "circle", "lineName": "Circle" }, "geometry": { "type": "LineString", "coordinates": [[-0.1437, 51.496], [-0.1238, 51.5308], [-0.0823, 51.5178]] } },
    { "type": "Feature", "properties": { "lineId": "elizabeth", "lineName": "Elizabeth line" }, "geometry": { "type": "LineString", "coordinates": [[-0.0823, 51.5178], [-0.1417, 51.515]] } }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/geometry.ts packages/web/app/fixtures packages/web/public
git commit -m "feat(web): sample snapshot + geometry fixtures"
```

---

### Task 2: `colors.ts` — band/status → dark-map hex (TDD)

**Files:**
- Create: `packages/web/app/lib/colors.ts`
- Test: `packages/web/test/colors.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/web/test/colors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bandColor, statusColor, BAND_COLORS, STATUS_COLORS } from "../app/lib/colors";

describe("bandColor", () => {
  it("maps every anomaly band to a hex colour", () => {
    expect(bandColor("much_busier")).toBe(BAND_COLORS.much_busier);
    expect(bandColor("busier")).toBe(BAND_COLORS.busier);
    expect(bandColor("normal")).toBe(BAND_COLORS.normal);
    expect(bandColor("quieter")).toBe(BAND_COLORS.quieter);
    expect(bandColor("much_quieter")).toBe(BAND_COLORS.much_quieter);
    expect(bandColor("unknown")).toBe(BAND_COLORS.unknown);
  });
  it("busier is warm (Danger/Warning), quieter is cool (Primary), unknown is neutral", () => {
    expect(bandColor("much_busier")).toBe("#DC2626");
    expect(bandColor("busier")).toBe("#D97706");
    expect(bandColor("quieter")).toBe("#3B82F6");
    expect(bandColor("unknown")).toBe("#64748B");
  });
});

describe("statusColor", () => {
  it("maps status levels to Success/Warning/Danger/neutral", () => {
    expect(statusColor("good")).toBe(STATUS_COLORS.good);
    expect(statusColor("good")).toBe("#16A34A");
    expect(statusColor("minor")).toBe("#D97706");
    expect(statusColor("severe")).toBe("#DC2626");
    expect(statusColor("unknown")).toBe("#64748B");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/web/test/colors.test.ts`
Expected: FAIL — cannot find module `../app/lib/colors`.

- [ ] **Step 3: Write the implementation**

`packages/web/app/lib/colors.ts`:

```ts
import type { AnomalyBand, StatusLevel } from "@pulse/shared";

/** Anomaly band → colour, tuned for the dark map. Warm = busier than usual, cool = quieter. */
export const BAND_COLORS: Record<AnomalyBand, string> = {
  much_busier: "#DC2626", // Danger
  busier: "#D97706", // Warning
  normal: "#94A3B8", // muted slate (dim on dark)
  quieter: "#3B82F6", // Primary
  much_quieter: "#60A5FA", // lighter Primary
  unknown: "#64748B", // neutral — no live data
};

/** Line status level → colour. */
export const STATUS_COLORS: Record<StatusLevel, string> = {
  good: "#16A34A", // Success
  minor: "#D97706", // Warning
  severe: "#DC2626", // Danger
  unknown: "#64748B",
};

export function bandColor(band: AnomalyBand): string {
  return BAND_COLORS[band];
}

export function statusColor(level: StatusLevel): string {
  return STATUS_COLORS[level];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/web/test/colors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/colors.ts packages/web/test/colors.test.ts
git commit -m "feat(web): band/status colour mapping"
```

---

### Task 3: `format.ts` — anomaly text, relative age, staleness (TDD)

**Files:**
- Create: `packages/web/app/lib/format.ts`
- Test: `packages/web/test/format.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/web/test/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeAnomaly, relativeAge, computeStaleness } from "../app/lib/format";

describe("describeAnomaly", () => {
  it("renders a human phrase from band + ratio", () => {
    expect(describeAnomaly("much_busier", 1.8)).toBe("80% busier than usual");
    expect(describeAnomaly("busier", 1.29)).toBe("29% busier than usual");
    expect(describeAnomaly("much_quieter", 0.55)).toBe("45% quieter than usual");
    expect(describeAnomaly("normal", 1.02)).toBe("about as busy as usual");
  });
  it("handles unknown / null ratio", () => {
    expect(describeAnomaly("unknown", null)).toBe("no live data");
    expect(describeAnomaly("busier", null)).toBe("no live data");
  });
});

describe("relativeAge", () => {
  it("formats seconds into a short label", () => {
    expect(relativeAge(5)).toBe("just now");
    expect(relativeAge(45)).toBe("45s ago");
    expect(relativeAge(90)).toBe("1 min ago");
    expect(relativeAge(600)).toBe("10 min ago");
    expect(relativeAge(7200)).toBe("2 hr ago");
  });
});

describe("computeStaleness", () => {
  it("is fresh under the threshold, stale over it", () => {
    const now = new Date("2026-05-30T17:15:00.000Z");
    const fresh = computeStaleness("2026-05-30T17:14:00.000Z", now); // 60s
    expect(fresh.isStale).toBe(false);
    expect(fresh.ageSec).toBe(60);
    const stale = computeStaleness("2026-05-30T16:50:00.000Z", now); // 1500s > 900
    expect(stale.isStale).toBe(true);
    expect(stale.label).toBe("25 min ago");
  });
  it("treats an unparseable timestamp as stale", () => {
    const now = new Date("2026-05-30T17:15:00.000Z");
    expect(computeStaleness("not-a-date", now).isStale).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/web/test/format.test.ts`
Expected: FAIL — cannot find module `../app/lib/format`.

- [ ] **Step 3: Write the implementation**

`packages/web/app/lib/format.ts`:

```ts
import type { AnomalyBand } from "@pulse/shared";

const STALE_THRESHOLD_SEC = 900; // 15 min (spec §13)

export function describeAnomaly(band: AnomalyBand, ratio: number | null): string {
  if (band === "unknown" || ratio === null) return "no live data";
  if (band === "normal") return "about as busy as usual";
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  const direction = ratio >= 1 ? "busier" : "quieter";
  return `${pct}% ${direction} than usual`;
}

export function relativeAge(sec: number): string {
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} hr ago`;
}

export interface Staleness {
  ageSec: number;
  isStale: boolean;
  label: string;
}

export function computeStaleness(
  generatedAt: string,
  now: Date,
  thresholdSec: number = STALE_THRESHOLD_SEC,
): Staleness {
  const then = Date.parse(generatedAt);
  if (Number.isNaN(then)) {
    return { ageSec: Infinity, isStale: true, label: "unknown" };
  }
  const ageSec = Math.max(0, Math.round((now.getTime() - then) / 1000));
  return { ageSec, isStale: ageSec > thresholdSec, label: relativeAge(ageSec) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/web/test/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/format.ts packages/web/test/format.test.ts
git commit -m "feat(web): anomaly text, relative age, staleness"
```

---

### Task 4: `sort.ts` — worst-first ordering (TDD)

**Files:**
- Create: `packages/web/app/lib/sort.ts`
- Test: `packages/web/test/sort.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/web/test/sort.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sortLinesWorstFirst, sortStationsWorstFirst } from "../app/lib/sort";
import type { LineSnapshot, StationSnapshot } from "@pulse/shared";

const line = (id: string, level: LineSnapshot["statusLevel"], crowd: number | null): LineSnapshot => ({
  id, name: id, mode: "tube", statusSeverity: level === "good" ? 10 : 6,
  statusDescription: level, statusLevel: level, disruptions: [], crowdingAnomaly: crowd,
});

describe("sortLinesWorstFirst", () => {
  it("orders severe > minor > good, then by crowding desc", () => {
    const out = sortLinesWorstFirst([
      line("good-busy", "good", 1.5),
      line("severe", "severe", 1.0),
      line("minor", "minor", 1.0),
      line("good-quiet", "good", 0.5),
    ]);
    expect(out.map((l) => l.id)).toEqual(["severe", "minor", "good-busy", "good-quiet"]);
  });
  it("does not mutate the input", () => {
    const input = [line("a", "good", 1), line("b", "severe", 1)];
    sortLinesWorstFirst(input);
    expect(input[0]!.id).toBe("a");
  });
});

describe("sortStationsWorstFirst", () => {
  it("orders by anomaly desc, nulls last", () => {
    const st = (naptan: string, anomaly: number | null): StationSnapshot => ({
      naptan, name: naptan, lat: 0, lon: 0, lines: [], live: null, typical: null,
      anomaly, anomalyBand: anomaly === null ? "unknown" : "busier", dataAvailable: anomaly !== null,
    });
    const out = sortStationsWorstFirst([st("a", 1.2), st("b", null), st("c", 1.9)]);
    expect(out.map((s) => s.naptan)).toEqual(["c", "a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/web/test/sort.test.ts`
Expected: FAIL — cannot find module `../app/lib/sort`.

- [ ] **Step 3: Write the implementation**

`packages/web/app/lib/sort.ts`:

```ts
import type { LineSnapshot, StationSnapshot, StatusLevel } from "@pulse/shared";

const STATUS_RANK: Record<StatusLevel, number> = { severe: 0, minor: 1, unknown: 2, good: 3 };

export function sortLinesWorstFirst(lines: LineSnapshot[]): LineSnapshot[] {
  return [...lines].sort((a, b) => {
    const byStatus = STATUS_RANK[a.statusLevel] - STATUS_RANK[b.statusLevel];
    if (byStatus !== 0) return byStatus;
    return (b.crowdingAnomaly ?? -Infinity) - (a.crowdingAnomaly ?? -Infinity);
  });
}

export function sortStationsWorstFirst(stations: StationSnapshot[]): StationSnapshot[] {
  return [...stations].sort((a, b) => (b.anomaly ?? -Infinity) - (a.anomaly ?? -Infinity));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/web/test/sort.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/sort.ts packages/web/test/sort.test.ts
git commit -m "feat(web): worst-first sorting for the list view"
```

---

### Task 5: `snapshot-source.ts` — load + schemaVersion guard (TDD)

**Files:**
- Create: `packages/web/app/lib/snapshot-source.ts`
- Test: `packages/web/test/snapshot-source.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/web/test/snapshot-source.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { loadSnapshot } from "../app/lib/snapshot-source";
import { sampleSnapshot } from "../app/fixtures/sample-snapshot";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("loadSnapshot", () => {
  it("returns the bundled sample when no SNAPSHOT_URL is set", async () => {
    const snap = await loadSnapshot({}, vi.fn());
    expect(snap).toEqual(sampleSnapshot);
  });

  it("fetches and returns a valid remote snapshot", async () => {
    const remote = { ...sampleSnapshot, generatedAt: "2026-06-01T09:00:00.000Z" };
    const fetchFn = vi.fn(async () => jsonResponse(remote));
    const snap = await loadSnapshot({ SNAPSHOT_URL: "https://r2.example/snapshot.json" }, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith("https://r2.example/snapshot.json", expect.anything());
    expect(snap.generatedAt).toBe("2026-06-01T09:00:00.000Z");
  });

  it("falls back to the sample on a failed fetch", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 500));
    const snap = await loadSnapshot({ SNAPSHOT_URL: "https://r2.example/snapshot.json" }, fetchFn);
    expect(snap).toEqual(sampleSnapshot);
  });

  it("falls back to the sample on a schemaVersion mismatch", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ...sampleSnapshot, schemaVersion: 999 }));
    const snap = await loadSnapshot({ SNAPSHOT_URL: "https://r2.example/snapshot.json" }, fetchFn);
    expect(snap).toEqual(sampleSnapshot);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/web/test/snapshot-source.test.ts`
Expected: FAIL — cannot find module `../app/lib/snapshot-source`.

- [ ] **Step 3: Write the implementation**

`packages/web/app/lib/snapshot-source.ts`:

```ts
import { SCHEMA_VERSION, type Snapshot } from "@pulse/shared";
import { sampleSnapshot } from "../fixtures/sample-snapshot";

export interface SnapshotEnv {
  SNAPSHOT_URL?: string;
}

/**
 * Load the latest snapshot. With no SNAPSHOT_URL (dev/test) returns the bundled
 * sample. Otherwise fetches the already-public snapshot; on any failure or
 * schema mismatch, falls back to the sample so the page always renders.
 */
export async function loadSnapshot(
  env: SnapshotEnv,
  fetchFn: typeof fetch = fetch,
): Promise<Snapshot> {
  if (!env.SNAPSHOT_URL) return sampleSnapshot;
  try {
    const res = await fetchFn(env.SNAPSHOT_URL, { headers: { accept: "application/json" } });
    if (!res.ok) return sampleSnapshot;
    const data = (await res.json()) as Snapshot;
    if (data?.schemaVersion !== SCHEMA_VERSION) return sampleSnapshot;
    return data;
  } catch {
    return sampleSnapshot;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/web/test/snapshot-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/snapshot-source.ts packages/web/test/snapshot-source.test.ts
git commit -m "feat(web): snapshot source with fallback + schema guard"
```

---

### Task 6: `poller.ts` — pure poll reducer (TDD)

**Files:**
- Create: `packages/web/app/lib/poller.ts`
- Test: `packages/web/test/poller.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/web/test/poller.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reducePoll, type PollState } from "../app/lib/poller";
import { sampleSnapshot } from "../app/fixtures/sample-snapshot";

const initial: PollState = { snapshot: sampleSnapshot, status: "fresh" };

describe("reducePoll", () => {
  it("a successful fetch replaces the snapshot and recomputes freshness", () => {
    const now = new Date("2026-05-30T17:11:00.000Z"); // 60s after sample generatedAt
    const next = reducePoll(initial, { kind: "success", snapshot: sampleSnapshot, now });
    expect(next.snapshot).toBe(sampleSnapshot);
    expect(next.status).toBe("fresh");
  });

  it("a successful fetch of an old snapshot is marked stale", () => {
    const now = new Date("2026-05-30T18:00:00.000Z"); // ~50 min after sample
    const next = reducePoll(initial, { kind: "success", snapshot: sampleSnapshot, now });
    expect(next.status).toBe("stale");
  });

  it("a failure marks error but keeps the last good snapshot", () => {
    const next = reducePoll(initial, { kind: "failure" });
    expect(next.status).toBe("error");
    expect(next.snapshot).toBe(sampleSnapshot);
  });

  it("a recheck re-evaluates staleness without changing the snapshot", () => {
    const now = new Date("2026-05-30T18:00:00.000Z");
    const next = reducePoll(initial, { kind: "recheck", now });
    expect(next.status).toBe("stale");
    expect(next.snapshot).toBe(sampleSnapshot);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/web/test/poller.test.ts`
Expected: FAIL — cannot find module `../app/lib/poller`.

- [ ] **Step 3: Write the implementation**

`packages/web/app/lib/poller.ts`:

```ts
import type { Snapshot } from "@pulse/shared";
import { computeStaleness } from "./format";

export type PollStatus = "fresh" | "stale" | "error";

export interface PollState {
  snapshot: Snapshot;
  status: PollStatus;
}

export type PollEvent =
  | { kind: "success"; snapshot: Snapshot; now: Date }
  | { kind: "failure" }
  | { kind: "recheck"; now: Date };

function freshness(snapshot: Snapshot, now: Date): PollStatus {
  return computeStaleness(snapshot.generatedAt, now).isStale ? "stale" : "fresh";
}

/** Pure state transition for the snapshot poller (the SnapshotClient core). */
export function reducePoll(state: PollState, event: PollEvent): PollState {
  switch (event.kind) {
    case "success":
      return { snapshot: event.snapshot, status: freshness(event.snapshot, event.now) };
    case "failure":
      return { ...state, status: "error" };
    case "recheck":
      return { ...state, status: freshness(state.snapshot, event.now) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/web/test/poller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/poller.ts packages/web/test/poller.test.ts
git commit -m "feat(web): pure snapshot poll reducer"
```

---

### Task 7: `map-data.ts` — snapshot+geometry → map layers (TDD)

**Files:**
- Create: `packages/web/app/lib/map-data.ts`
- Test: `packages/web/test/map-data.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/web/test/map-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stationsToGeoJSON, lineColorById } from "../app/lib/map-data";
import { sampleSnapshot } from "../app/fixtures/sample-snapshot";
import { bandColor, statusColor } from "../app/lib/colors";

describe("stationsToGeoJSON", () => {
  it("builds a point FeatureCollection with colour + radius + label props", () => {
    const fc = stationsToGeoJSON(sampleSnapshot.stations);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(sampleSnapshot.stations.length);
    const oxc = fc.features.find((f) => f.properties.naptan === "940GZZLUOXC")!;
    expect(oxc.geometry.coordinates).toEqual([-0.1417, 51.515]);
    expect(oxc.properties.color).toBe(bandColor("much_busier"));
    expect(oxc.properties.radius).toBeGreaterThan(fc.features.find((f) => f.properties.naptan === "940GZZLUVIC")!.properties.radius);
  });
  it("gives no-data stations the unknown colour and the base radius", () => {
    const fc = stationsToGeoJSON(sampleSnapshot.stations);
    const ksx = fc.features.find((f) => f.properties.naptan === "940GZZLUKSX")!;
    expect(ksx.properties.color).toBe(bandColor("unknown"));
    expect(ksx.properties.radius).toBe(4);
  });
});

describe("lineColorById", () => {
  it("maps each line id to its status colour", () => {
    const map = lineColorById(sampleSnapshot.lines);
    expect(map.central).toBe(statusColor("severe"));
    expect(map.victoria).toBe(statusColor("good"));
    expect(map.circle).toBe(statusColor("minor"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/web/test/map-data.test.ts`
Expected: FAIL — cannot find module `../app/lib/map-data`.

- [ ] **Step 3: Write the implementation**

`packages/web/app/lib/map-data.ts`:

```ts
import type { LineSnapshot, StationSnapshot } from "@pulse/shared";
import { bandColor, statusColor } from "./colors";

const BASE_RADIUS = 4;
const MAX_EXTRA_RADIUS = 10;

export interface StationPointProps {
  naptan: string;
  name: string;
  color: string;
  radius: number;
  anomalyBand: string;
}

export interface StationPoint {
  type: "Feature";
  properties: StationPointProps;
  geometry: { type: "Point"; coordinates: [number, number] };
}

export interface StationCollection {
  type: "FeatureCollection";
  features: StationPoint[];
}

/** Radius grows with how far the station deviates from normal (either direction). */
function radiusFor(anomaly: number | null): number {
  if (anomaly === null) return BASE_RADIUS;
  const deviation = Math.min(Math.abs(anomaly - 1), 1); // cap at 100% deviation
  return BASE_RADIUS + deviation * MAX_EXTRA_RADIUS;
}

export function stationsToGeoJSON(stations: StationSnapshot[]): StationCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature",
      properties: {
        naptan: s.naptan,
        name: s.name,
        color: bandColor(s.anomalyBand),
        radius: radiusFor(s.anomaly),
        anomalyBand: s.anomalyBand,
      },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    })),
  };
}

export function lineColorById(lines: LineSnapshot[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of lines) out[l.id] = statusColor(l.statusLevel);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/web/test/map-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/map-data.ts packages/web/test/map-data.test.ts
git commit -m "feat(web): map layer data transforms"
```

---

### Task 8: Elegant theme tokens + global styles

**Files:**
- Modify: `packages/web/app/styles/tokens.css`, `packages/web/app/styles/app.css`

- [ ] **Step 1: Write the design tokens**

Replace `packages/web/app/styles/tokens.css` with:

```css
:root {
  /* Elegant semantic palette */
  --color-primary: #3b82f6;
  --color-secondary: #8b5cf6;
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  --color-surface: #ffffff;
  --color-text: #111827;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;

  /* Dark map chrome */
  --map-bg: #0b1120;
  --map-water: #15233b;

  /* Type */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "Anonymous Pro", ui-monospace, monospace;

  /* Spacing (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --radius: 12px;
}
```

- [ ] **Step 2: Write the global + layout styles**

Replace `packages/web/app/styles/app.css` with:

```css
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--font-sans);
  font-weight: 300;
  color: var(--color-text);
  background: var(--color-surface);
  font-size: 16px;
  line-height: 1.5;
}
h1, h2, h3 { font-weight: 500; margin: 0 0 var(--space-2); }
h1 { font-size: 32px; }
h2 { font-size: 24px; }

/* Visible focus for keyboard users (WCAG 2.2 AA) */
:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }

.page { display: grid; grid-template-rows: auto 1fr auto; min-height: 100vh; }
.page__header { padding: var(--space-6); border-bottom: 1px solid var(--color-border); }
.page__body { display: grid; grid-template-columns: 1fr; gap: var(--space-4); padding: var(--space-4); }
@media (min-width: 900px) { .page__body { grid-template-columns: 2fr 1fr; } }

.map { position: relative; min-height: 60vh; border-radius: var(--radius); overflow: hidden; background: var(--map-bg); }
.map__canvas { position: absolute; inset: 0; }

.panel { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: var(--space-4); }
.banner--stale { background: #fef3c7; color: #92400e; padding: var(--space-2) var(--space-4); border-radius: var(--radius); font-size: 14px; }
.footer { padding: var(--space-4) var(--space-6); border-top: 1px solid var(--color-border); color: var(--color-muted); font-size: 14px; }
.mono { font-family: var(--font-mono); }
.visually-hidden { position: absolute; width: 1px; height: 1px; clip: rect(0 0 0 0); overflow: hidden; }

table.list { width: 100%; border-collapse: collapse; font-size: 14px; }
table.list th, table.list td { text-align: left; padding: var(--space-2); border-bottom: 1px solid var(--color-border); }
table.list button { font: inherit; background: none; border: none; color: var(--color-primary); cursor: pointer; padding: 0; text-decoration: underline; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: var(--space-2); vertical-align: middle; }
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm --filter @pulse/web build`
Expected: exits 0 (CSS imports from `root.tsx` resolve).

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/styles
git commit -m "feat(web): elegant design tokens + global styles"
```

---

### Task 9: Home loader + `useSnapshot` hook

**Files:**
- Create: `packages/web/app/lib/use-snapshot.ts`
- Modify: `packages/web/app/routes/home.tsx`

- [ ] **Step 1: Write the client polling hook**

`packages/web/app/lib/use-snapshot.ts`:

```ts
import { useEffect, useReducer } from "react";
import type { Snapshot } from "@pulse/shared";
import { reducePoll, type PollState } from "./poller";
import { loadSnapshot } from "./snapshot-source";

const POLL_MS = 30_000;
const RECHECK_MS = 15_000;

/**
 * Seeds from the SSR snapshot, then polls the public snapshot URL on the client
 * and re-checks staleness between polls. SSR-safe: effects run only in the browser.
 */
export function useSnapshot(initial: Snapshot, snapshotUrl?: string) {
  const [state, dispatch] = useReducer(reducePoll, {
    snapshot: initial,
    status: "fresh",
  } satisfies PollState);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const snapshot = await loadSnapshot({ SNAPSHOT_URL: snapshotUrl });
        if (active) dispatch({ kind: "success", snapshot, now: new Date() });
      } catch {
        if (active) dispatch({ kind: "failure" });
      }
    };
    const pollId = setInterval(poll, POLL_MS);
    const recheckId = setInterval(() => active && dispatch({ kind: "recheck", now: new Date() }), RECHECK_MS);
    return () => {
      active = false;
      clearInterval(pollId);
      clearInterval(recheckId);
    };
  }, [snapshotUrl]);

  return state;
}
```

- [ ] **Step 2: Write the loader + wire it into the route**

Replace `packages/web/app/routes/home.tsx` with:

```tsx
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
```

- [ ] **Step 3: Verify build + typecheck**

Run: `pnpm --filter @pulse/web typecheck`
Expected: exits 0.
Run: `pnpm --filter @pulse/web build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/lib/use-snapshot.ts packages/web/app/routes/home.tsx
git commit -m "feat(web): snapshot loader + client polling hook"
```

---

### Task 10: AttributionFooter + Legend components

**Files:**
- Create: `packages/web/app/components/AttributionFooter.tsx`, `packages/web/app/components/Legend.tsx`

- [ ] **Step 1: Write the attribution footer (ToS §12 — verbatim required text)**

`packages/web/app/components/AttributionFooter.tsx`:

```tsx
export function AttributionFooter() {
  return (
    <footer className="footer">
      <p>
        Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016
        and Geomni UK Map data © and database rights 2019.
      </p>
      <p>
        <strong>Unofficial</strong> — not affiliated with or endorsed by Transport for London.
      </p>
    </footer>
  );
}
```

- [ ] **Step 2: Write the legend (explains the bi-directional colour)**

`packages/web/app/components/Legend.tsx`:

```tsx
import { BAND_COLORS } from "../lib/colors";

const ITEMS: { band: keyof typeof BAND_COLORS; label: string }[] = [
  { band: "much_busier", label: "Much busier than usual" },
  { band: "busier", label: "Busier than usual" },
  { band: "normal", label: "About normal" },
  { band: "quieter", label: "Quieter than usual" },
  { band: "unknown", label: "No live data" },
];

export function Legend() {
  return (
    <section className="panel" aria-label="Map legend">
      <h2>What the colours mean</h2>
      <p>Stations are coloured by how busy they are <em>compared with a typical day at this time</em> — not just how busy they are.</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {ITEMS.map((item) => (
          <li key={item.band}>
            <span className="swatch" style={{ background: BAND_COLORS[item.band] }} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @pulse/web build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/AttributionFooter.tsx packages/web/app/components/Legend.tsx
git commit -m "feat(web): attribution footer + legend"
```

---

### Task 11: HeadlinePanel + DetailPanel components

**Files:**
- Create: `packages/web/app/components/HeadlinePanel.tsx`, `packages/web/app/components/DetailPanel.tsx`

- [ ] **Step 1: Write the headline panel (verdict + stale banner)**

`packages/web/app/components/HeadlinePanel.tsx`:

```tsx
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
        <p className="banner--stale" role="status">Data may be out of date — the live feed hasn’t updated recently.</p>
      )}
      {status === "error" && (
        <p className="banner--stale" role="status">Couldn’t reach the live feed; showing the last good data.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Write the detail panel (selected line or station)**

`packages/web/app/components/DetailPanel.tsx`:

```tsx
import type { Snapshot } from "@pulse/shared";
import { describeAnomaly } from "../lib/format";

export type Selection =
  | { kind: "line"; id: string }
  | { kind: "station"; naptan: string }
  | null;

export function DetailPanel({ snapshot, selection }: { snapshot: Snapshot; selection: Selection }) {
  if (!selection) {
    return (
      <section className="panel" aria-label="Details">
        <p>Select a line or station for details.</p>
      </section>
    );
  }
  if (selection.kind === "line") {
    const line = snapshot.lines.find((l) => l.id === selection.id);
    if (!line) return <section className="panel">Unknown line.</section>;
    return (
      <section className="panel" aria-label={`Details for ${line.name}`}>
        <h2>{line.name}</h2>
        <p>{line.statusDescription}</p>
        {line.disruptions.map((d, i) => <p key={i}>{d.description}</p>)}
        {line.crowdingAnomaly !== null && (
          <p className="mono">Crowding: {describeAnomaly(line.crowdingAnomaly >= 1 ? "busier" : "quieter", line.crowdingAnomaly)}</p>
        )}
      </section>
    );
  }
  const station = snapshot.stations.find((s) => s.naptan === selection.naptan);
  if (!station) return <section className="panel">Unknown station.</section>;
  return (
    <section className="panel" aria-label={`Details for ${station.name}`}>
      <h2>{station.name}</h2>
      <p className="mono">{describeAnomaly(station.anomalyBand, station.anomaly)}</p>
    </section>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @pulse/web build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/HeadlinePanel.tsx packages/web/app/components/DetailPanel.tsx
git commit -m "feat(web): headline + detail panels"
```

---

### Task 12: ListView component (accessible, AA fallback)

**Files:**
- Create: `packages/web/app/components/ListView.tsx`

- [ ] **Step 1: Write the accessible list**

`packages/web/app/components/ListView.tsx`:

```tsx
import type { Snapshot } from "@pulse/shared";
import type { Selection } from "./DetailPanel";
import { sortLinesWorstFirst, sortStationsWorstFirst } from "../lib/sort";
import { describeAnomaly } from "../lib/format";
import { statusColor, bandColor } from "../lib/colors";

export function ListView({ snapshot, onSelect }: { snapshot: Snapshot; onSelect: (s: Selection) => void }) {
  const lines = sortLinesWorstFirst(snapshot.lines);
  const stations = sortStationsWorstFirst(snapshot.stations);
  return (
    <section className="panel" aria-label="Lines and stations, worst first">
      <h2>Lines</h2>
      <table className="list">
        <caption className="visually-hidden">Rail lines, most disrupted first</caption>
        <thead><tr><th scope="col">Line</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td><button type="button" onClick={() => onSelect({ kind: "line", id: l.id })}>{l.name}</button></td>
              <td><span className="swatch" style={{ background: statusColor(l.statusLevel) }} aria-hidden="true" />{l.statusDescription}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Busiest vs usual</h2>
      <table className="list">
        <caption className="visually-hidden">Tube stations, busiest-versus-usual first</caption>
        <thead><tr><th scope="col">Station</th><th scope="col">Vs usual</th></tr></thead>
        <tbody>
          {stations.map((s) => (
            <tr key={s.naptan}>
              <td><button type="button" onClick={() => onSelect({ kind: "station", naptan: s.naptan })}>{s.name}</button></td>
              <td><span className="swatch" style={{ background: bandColor(s.anomalyBand) }} aria-hidden="true" />{describeAnomaly(s.anomalyBand, s.anomaly)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @pulse/web build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/ListView.tsx
git commit -m "feat(web): accessible worst-first list view"
```

---

### Task 13: MapView component (client-only MapLibre)

**Files:**
- Create: `packages/web/app/components/MapView.tsx`

- [ ] **Step 1: Write the map component**

`packages/web/app/components/MapView.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { Snapshot } from "@pulse/shared";
import type { Selection } from "./DetailPanel";
import type { LineFeatureCollection } from "../lib/geometry";
import { stationsToGeoJSON, lineColorById } from "../lib/map-data";

const LONDON: [number, number] = [-0.118, 51.509];

export function MapView({ snapshot, onSelect }: { snapshot: Snapshot; onSelect: (s: Selection) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        center: LONDON,
        zoom: 11,
        attributionControl: false,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b1120" } }],
        },
      });

      map.on("load", async () => {
        if (!map) return;
        const geometry: LineFeatureCollection = await fetch("/data/geometry.geojson").then((r) => r.json());
        const colorById = lineColorById(snapshot.lines);
        // Colour each line feature by its status; default neutral if unknown.
        const colored = {
          ...geometry,
          features: geometry.features.map((f) => ({
            ...f,
            properties: { ...f.properties, color: colorById[f.properties.lineId] ?? "#64748B" },
          })),
        };
        map.addSource("lines", { type: "geojson", data: colored as GeoJSON.FeatureCollection });
        map.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": ["get", "color"], "line-width": 3 } });

        map.addSource("stations", { type: "geojson", data: stationsToGeoJSON(snapshot.stations) as GeoJSON.FeatureCollection });
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
          if (typeof naptan === "string") onSelect({ kind: "station", naptan });
        });
        map.on("click", "lines", (e) => {
          const lineId = e.features?.[0]?.properties?.lineId;
          if (typeof lineId === "string") onSelect({ kind: "line", id: lineId });
        });
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [snapshot, onSelect]);

  return (
    <div className="map">
      <div className="map__canvas" ref={containerRef} data-testid="map" role="img" aria-label="Map of London rail network coloured by how busy each station is versus usual. Use the list below for full details." />
    </div>
  );
}
```

- [ ] **Step 2: Verify build (the dynamic import keeps MapLibre out of the server bundle)**

Run: `pnpm --filter @pulse/web build`
Expected: exits 0 (SSR build does not evaluate MapLibre because it's imported inside `useEffect`).

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/MapView.tsx
git commit -m "feat(web): client-only MapLibre map view"
```

---

### Task 14: Compose the home page (wire everything)

**Files:**
- Modify: `packages/web/app/routes/home.tsx`

- [ ] **Step 1: Compose all components with live updates + selection state**

Replace the `Home` component (keep `meta` and `loader` from Task 9) in `packages/web/app/routes/home.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify typecheck + build**

Run: `pnpm --filter @pulse/web typecheck`
Expected: exits 0.
Run: `pnpm --filter @pulse/web build`
Expected: exits 0.

- [ ] **Step 3: Run the whole repo test suite (confirm web unit tests + Plan 1 all green)**

Run: `pnpm test`
Expected: PASS — Plan 1's 54 tests + the new web lib tests (colors/format/sort/snapshot-source/poller/map-data).

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/routes/home.tsx
git commit -m "feat(web): compose the live home page"
```

---

### Task 15: Manual smoke of the dev server

**Files:** none (verification task)

- [ ] **Step 1: Start the dev server and confirm SSR + render**

Run: `pnpm --filter @pulse/web dev` (starts Vite on http://localhost:5173)
In another shell: `curl -s http://localhost:5173/ | grep -o "Busier than usual for a Saturday"`
Expected: the headline text is present in the **server-rendered HTML** (proves SSR works with the bundled fixture).
Then stop the dev server (Ctrl-C).

- [ ] **Step 2: No commit** (verification only).

---

### Task 16: Playwright e2e smoke + a11y

**Files:**
- Create: `packages/web/playwright.config.ts`, `packages/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Install the browser**

Run: `pnpm --filter @pulse/web exec playwright install chromium`
Expected: downloads headless Chromium.

- [ ] **Step 2: Write the Playwright config**

`packages/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "pnpm build && pnpm start --port 4173",
    port: 4173,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 3: Write the smoke test**

`packages/web/e2e/smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("renders the pulse, list, map and attribution", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");

  // SSR'd headline (from the bundled fixture)
  await expect(page.getByText("Busier than usual for a Saturday", { exact: false })).toBeVisible();

  // Accessible list with worst-first content
  await expect(page.getByRole("button", { name: "Central" })).toBeVisible();
  await expect(page.getByText("80% busier than usual")).toBeVisible(); // Oxford Circus much_busier

  // Map mounts
  await expect(page.getByTestId("map")).toBeVisible();

  // Required attribution (ToS §12)
  await expect(page.getByText("Powered by TfL Open Data", { exact: false })).toBeVisible();
  await expect(page.getByText("not affiliated with or endorsed by Transport for London", { exact: false })).toBeVisible();

  // Selecting a line populates the detail panel
  await page.getByRole("button", { name: "Central" }).click();
  await expect(page.getByLabel("Details for Central")).toBeVisible();

  expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
});

test("keyboard focus reaches the list controls (WCAG 2.2 AA)", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const active = await page.evaluate(() => document.activeElement?.tagName);
  expect(["A", "BUTTON"]).toContain(active);
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `pnpm --filter @pulse/web test:e2e`
Expected: 2 tests PASS (Playwright builds + serves the app, drives Chromium). If the map test is flaky due to WebGL in headless, the `data-testid="map"` assertion checks the container mounts (not WebGL internals), which is stable.

- [ ] **Step 5: Commit**

```bash
git add packages/web/playwright.config.ts packages/web/e2e
git commit -m "test(web): Playwright smoke + a11y"
```

---

### Task 17: Cloudflare deployment config + docs

**Files:**
- Create: `packages/web/README.md`

- [ ] **Step 1: Document deployment + the go-live data wiring**

`packages/web/README.md`:

````md
# @pulse/web — Pulse of London frontend

React Router v7 (SSR) app. Renders the live anomaly map from `snapshot.json`.

## Local dev
```
pnpm --filter @pulse/web dev      # http://localhost:5173 (uses the bundled fixture)
pnpm --filter @pulse/web build && pnpm --filter @pulse/web start
pnpm test                         # unit tests (run from repo root)
pnpm --filter @pulse/web test:e2e # Playwright smoke
```

## Data wiring
- Dev/test: no `SNAPSHOT_URL` → the bundled `app/fixtures/sample-snapshot.ts` is used.
- Prod: set `SNAPSHOT_URL` to the **public** R2 URL of `snapshot.json` (written by the Plan 1 ingestor). The loader fetches it server-side for SSR; the TfL `app_key` never reaches the browser (it lives only in the ingestor). The loader falls back to the sample on any fetch/schema failure, so the page always renders.
- Line geometry: replace `public/data/geometry.geojson` with the file produced by `pnpm bootstrap:geometry` (Plan 1), **after verifying [lon, lat] order**.

## Deploy (Cloudflare Pages — go-live)
1. Add the Cloudflare preset: `pnpm --filter @pulse/web add -D @cloudflare/vite-plugin wrangler` and follow the React Router Cloudflare guide to switch the server build target.
2. Set the `SNAPSHOT_URL` environment variable in the Pages project.
3. Because Cloudflare Pages ignores loader `Cache-Control` (spec §6), wrap the snapshot fetch in the Workers Caches API with a ~30s TTL inside the loader for production. (Optional optimisation; correctness holds without it.)
4. Attribution, independent branding, and the "Unofficial" notice are already rendered (ToS §12).
````

- [ ] **Step 2: Commit**

```bash
git add packages/web/README.md
git commit -m "docs(web): deployment + data-wiring guide"
```

---

## Self-Review

**1. Spec coverage** (frontend portions):
- §7 frontend units: `SnapshotClient` → `poller.ts` + `use-snapshot.ts` (Tasks 6, 9); `MapView` → Task 13; `HeadlinePanel` → Task 11; `DetailPanel` → Task 11; `ListView` → Task 12; `Legend` → Task 10; `AttributionFooter` → Task 10. ✓
- §6 SSR loader reading the public snapshot → Tasks 5, 9 (loader); platform caching note → Task 17. ✓
- §10 elegant theme (light chrome + dark map, tokens, type scale, 4px spacing, fonts) → Tasks 0 (fonts), 8 (tokens/styles); data→colour mapping → Task 2. Light chrome + dark map canvas (`--map-bg`) → Tasks 8, 13. ✓
- §11 WCAG 2.2 AA: redundant (non-colour) encoding — node radius + text label + `aria-label` (Tasks 7, 12, 13); `ListView` keyboard/screen-reader equivalent (Task 12); visible focus (Task 8 `:focus-visible`); map `role="img"` + descriptive label (Task 13); a11y assertions (Task 16). ✓
- §12 ToS: verbatim attribution + "Unofficial" (Task 10); independent name/branding (no roundel) throughout; `app_key` never in the frontend (loader reads the public snapshot only — Tasks 5, 17). ✓
- §13 staleness: `computeStaleness` + stale/error banners (Tasks 3, 11); never fabricate (no-data → "no live data", neutral colour — Tasks 2, 3, 7). ✓
- §4.2 nullability handled (null live/typical/anomaly → unknown/neutral; non-tube `crowdingAnomaly` null) — Tasks 2, 3, 7, 11. ✓
- Develops against fixtures, configurable prod URL → Tasks 1, 5, 17. ✓

**2. Placeholder scan:** No "TBD"/"implement later"/"add error handling". The deferred items (live deploy, real geometry) are concrete go-live instructions in Task 17, not vague placeholders. Stub stylesheets in Task 0 are filled in Task 8 (explicitly). ✓

**3. Type consistency:** `Snapshot`/`StationSnapshot`/`LineSnapshot`/`NetworkSummary`/`AnomalyBand`/`StatusLevel` from `@pulse/shared` used consistently. `bandColor`/`statusColor`/`BAND_COLORS`/`STATUS_COLORS` (Task 2) used by `map-data` (7), `Legend` (10), `ListView` (12). `describeAnomaly`/`relativeAge`/`computeStaleness` (Task 3) used by `poller` (6), panels (11), `ListView` (12). `Selection` type defined in `DetailPanel` (11) and imported by `ListView` (12), `MapView` (13), `Home` (14). `reducePoll`/`PollState`/`PollStatus` (6) used by `use-snapshot` (9), `HeadlinePanel` (11). `stationsToGeoJSON`/`lineColorById` (7) used by `MapView` (13). `LineFeatureCollection` (1) used by `MapView` (13). `loadSnapshot` (5) used by loader (9, 14) + hook (9). ✓

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, two-stage review between tasks (superpowers:subagent-driven-development).
2. **Inline Execution** — execute in this session with checkpoints (superpowers:executing-plans).
