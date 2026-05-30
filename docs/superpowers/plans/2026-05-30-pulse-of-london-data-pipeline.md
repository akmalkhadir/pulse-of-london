# Pulse of London — Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ingestor — a scheduled GitHub Action that polls the TfL Unified API, computes "worse-than-usual" crowding anomalies and line status, and writes one `snapshot.json` to Cloudflare R2.

**Architecture:** A monorepo (pnpm workspaces). `packages/shared` holds the snapshot schema + pure classifiers (the contract the frontend will consume). `packages/ingestor` holds the TfL client, fetchers, the pure anomaly engine, the snapshot builder, the R2 writer, and an orchestrator run on a cron via GitHub Actions. The TfL `app_key` is a GitHub Actions secret and never leaves the ingestor.

**Tech Stack:** TypeScript (ESM), Node 20+, pnpm workspaces, Vitest (TDD), native `fetch`, `tsx` (run TS directly), `@aws-sdk/client-s3` (R2 is S3-compatible).

**Spec:** `docs/superpowers/specs/2026-05-30-pulse-of-london-design.md`

---

## External setup (do once, before Task 14/15 run live)

These are real-world prerequisites; the build and all tests below work without them (everything external is mocked in tests).

1. **TfL app key** — register at <https://api-portal.tfl.gov.uk/>, create an app, copy the **Primary access key**.
2. **Cloudflare R2** — create a bucket (e.g. `pulse-of-london`), create an R2 **API token** (Object Read & Write), note the Account ID, Access Key ID, Secret Access Key.
3. **GitHub repo secrets** (Settings → Secrets → Actions): `TFL_APP_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

## File structure (created by this plan)

```
package.json                       # workspace root: scripts + devDeps
pnpm-workspace.yaml
tsconfig.base.json
vitest.config.ts                   # root, scans all packages
.gitignore
.nvmrc
packages/
  shared/
    package.json                   # name: @pulse/shared, type: module
    tsconfig.json
    src/
      snapshot.ts                  # Snapshot + sub-types, enums, SCHEMA_VERSION
      anomaly.ts                   # classifyAnomaly, classifyStatus, thresholds
      index.ts                     # re-exports
    test/
      anomaly.test.ts
  ingestor/
    package.json                   # name: @pulse/ingestor, deps: @pulse/shared, @aws-sdk/client-s3
    tsconfig.json
    src/
      config.ts                    # env parsing/validation
      time.ts                      # weekday + 15-min band helpers (pure)
      tfl/
        client.ts                  # TflClient: fetch w/ app_key, timeout, retry
        types.ts                   # raw TfL response shapes we read
        fetchers.ts                # fetchLineStatus/LiveCrowding/Typical/Stations
      baseline.ts                  # TypicalBaselineStore
      anomaly.ts                   # crowdingAnomaly, aggregateLineCrowding, lineHealth, networkScore
      builder.ts                   # buildSnapshot
      writer.ts                    # writeSnapshot (R2)
      history.ts                   # logSnapshot (R2 per-cycle object)
      run.ts                       # runPollCycle (orchestrator, resilient)
      index.ts                     # entrypoint for the GH Action
      bootstrap-geometry.ts        # one-off: fetch line geometry + stations → static files
    test/
      config.test.ts
      time.test.ts
      tfl/client.test.ts
      tfl/fetchers.test.ts
      baseline.test.ts
      anomaly.test.ts
      builder.test.ts
      writer.test.ts
      history.test.ts
      run.test.ts
      fixtures/
        status.json
        crowding-live.json
        crowding-live-unavailable.json
        crowding-typical.json
        stoppoints-tube.json
.github/workflows/
  poll.yml                         # cron → run ingestor
data/                              # produced by bootstrap-geometry (consumed by frontend in Plan 2)
  geometry.geojson
  stations.json
```

---

### Task 0: Monorepo scaffold + tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.nvmrc`

- [ ] **Step 1: Enable pnpm and write the workspace root**

Run: `corepack enable && corepack prepare pnpm@9 --activate`

Create `package.json`:

```json
{
  "name": "pulse-of-london",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b",
    "ingest": "tsx packages/ingestor/src/index.ts",
    "bootstrap:geometry": "tsx packages/ingestor/src/bootstrap-geometry.ts"
  },
  "devDependencies": {
    "@types/node": "^22",
    "tsx": "^4.19",
    "typescript": "^5.6",
    "vitest": "^2.1"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "composite": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  }
}
```

Create `tsconfig.json` (solution file for `tsc -b`; the referenced package tsconfigs are created in Tasks 1 and 4, and the bare `tsc -b` is not run until both exist):

```json
{
  "files": [],
  "references": [{ "path": "packages/shared" }, { "path": "packages/ingestor" }]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
```

Create `.nvmrc`:

```
20
```

Create `.gitignore`:

```
node_modules/
dist/
*.tsbuildinfo
.env
.env.*
.DS_Store
coverage/
```

- [ ] **Step 2: Install and verify the toolchain**

Run: `pnpm install`
Expected: installs root devDeps, no errors.

Run: `pnpm exec vitest run`
Expected: "No test files found" (exit 0) — toolchain works, nothing to test yet.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json vitest.config.ts .gitignore .nvmrc pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo + vitest"
```

---

### Task 1: Shared snapshot schema (the contract)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/snapshot.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Create the shared package manifest + tsconfig**

`packages/shared/package.json`:

```json
{
  "name": "@pulse/shared",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

- [ ] **Step 2: Define the snapshot types**

`packages/shared/src/snapshot.ts`:

```ts
export const SCHEMA_VERSION = 1;

export type AnomalyBand =
  | "much_quieter"
  | "quieter"
  | "normal"
  | "busier"
  | "much_busier"
  | "unknown";

export type StatusLevel = "good" | "minor" | "severe" | "unknown";

export type NetworkVerdict = "quieter_than_usual" | "typical" | "busier_than_usual";

export interface LineDisruption {
  category: string;
  description: string;
}

export interface StationSnapshot {
  naptan: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
  live: number | null; // percentageOfBaseline now (0..1), null if unavailable
  typical: number | null; // typical for this weekday+band (0..1), null if missing
  anomaly: number | null; // live / typical, null if either missing
  anomalyBand: AnomalyBand;
  dataAvailable: boolean;
}

export interface LineSnapshot {
  id: string;
  name: string;
  mode: string;
  statusSeverity: number;
  statusDescription: string;
  statusLevel: StatusLevel;
  disruptions: LineDisruption[];
  crowdingAnomaly: number | null; // median of its stations' ratios; null for non-tube
}

export interface NetworkSummary {
  crowdingAnomaly: number | null; // median of available station ratios
  disruptedLineCount: number;
  verdict: NetworkVerdict;
  headline: string;
  worstLines: string[];
}

export interface SnapshotFreshness {
  statusAgeSec: number;
  crowdingAgeSec: number;
}

export interface Snapshot {
  schemaVersion: number;
  generatedAt: string; // ISO-8601 UTC
  freshness: SnapshotFreshness;
  network: NetworkSummary;
  lines: LineSnapshot[];
  stations: StationSnapshot[];
}
```

- [ ] **Step 3: Re-export from index**

`packages/shared/src/index.ts`:

```ts
export * from "./snapshot";
export * from "./anomaly";
```

(Note: `./anomaly` is added in Task 2; this line will not typecheck until then. That's expected — we add the file next.)

- [ ] **Step 4: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): snapshot schema types"
```

---

### Task 2: `classifyAnomaly` (pure, TDD)

**Files:**
- Create: `packages/shared/src/anomaly.ts`
- Test: `packages/shared/test/anomaly.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/test/anomaly.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyAnomaly, ANOMALY_THRESHOLDS } from "../src/anomaly";

describe("classifyAnomaly", () => {
  it.each([
    [0.3, "much_quieter"],
    [0.59, "much_quieter"],
    [0.6, "quieter"],
    [0.84, "quieter"],
    [0.85, "normal"],
    [1.0, "normal"],
    [1.15, "normal"],
    [1.16, "busier"],
    [1.4, "busier"],
    [1.41, "much_busier"],
    [3.0, "much_busier"],
  ] as const)("maps ratio %s → %s", (ratio, band) => {
    expect(classifyAnomaly(ratio)).toBe(band);
  });

  it("returns unknown for null / non-finite", () => {
    expect(classifyAnomaly(null)).toBe("unknown");
    expect(classifyAnomaly(Number.NaN)).toBe("unknown");
    expect(classifyAnomaly(Number.POSITIVE_INFINITY)).toBe("unknown");
  });

  it("exposes thresholds", () => {
    expect(ANOMALY_THRESHOLDS.muchBusier).toBe(1.4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/shared/test/anomaly.test.ts`
Expected: FAIL — cannot find module `../src/anomaly`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/anomaly.ts`:

```ts
import type { AnomalyBand, StatusLevel } from "./snapshot";

export const ANOMALY_THRESHOLDS = {
  muchQuieter: 0.6,
  quieter: 0.85,
  busier: 1.15,
  muchBusier: 1.4,
} as const;

/** Classify a live/typical ratio into a band. null/non-finite → "unknown". */
export function classifyAnomaly(ratio: number | null): AnomalyBand {
  if (ratio === null || !Number.isFinite(ratio)) return "unknown";
  if (ratio < ANOMALY_THRESHOLDS.muchQuieter) return "much_quieter";
  if (ratio < ANOMALY_THRESHOLDS.quieter) return "quieter";
  if (ratio <= ANOMALY_THRESHOLDS.busier) return "normal";
  if (ratio <= ANOMALY_THRESHOLDS.muchBusier) return "busier";
  return "much_busier";
}

/**
 * Classify a TfL statusSeverity into a level. See /Line/Meta/Severity for the
 * authoritative code list. 10 = Good Service, 18 = No Issues → good; 9 = Minor
 * Delays → minor; everything else (Severe Delays, Part/Full Suspended, Closures)
 * → severe; null/non-finite → unknown.
 */
export function classifyStatus(severity: number | null | undefined): StatusLevel {
  if (severity == null || !Number.isFinite(severity)) return "unknown";
  if (severity === 10 || severity === 18) return "good";
  if (severity === 9) return "minor";
  return "severe";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/shared/test/anomaly.test.ts`
Expected: PASS (14 assertions).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/anomaly.ts packages/shared/test/anomaly.test.ts
git commit -m "feat(shared): classifyAnomaly band thresholds"
```

---

### Task 3: `classifyStatus` (pure, TDD)

**Files:**
- Modify: `packages/shared/test/anomaly.test.ts` (add a describe block)

- [ ] **Step 1: Add the failing test**

Append to `packages/shared/test/anomaly.test.ts`:

```ts
import { classifyStatus } from "../src/anomaly";

describe("classifyStatus", () => {
  it.each([
    [10, "good"],
    [18, "good"],
    [9, "minor"],
    [6, "severe"],
    [4, "severe"],
    [0, "severe"],
    [20, "severe"],
  ] as const)("maps severity %s → %s", (sev, level) => {
    expect(classifyStatus(sev)).toBe(level);
  });

  it("returns unknown for null/undefined/NaN", () => {
    expect(classifyStatus(null)).toBe("unknown");
    expect(classifyStatus(undefined)).toBe("unknown");
    expect(classifyStatus(Number.NaN)).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

`classifyStatus` was already implemented in Task 2, Step 3.
Run: `pnpm exec vitest run packages/shared/test/anomaly.test.ts`
Expected: PASS (all `classifyAnomaly` + `classifyStatus` cases).

- [ ] **Step 3: Verify the package typechecks**

Run: `pnpm exec tsc -b packages/shared`
Expected: no errors (confirms `index.ts` re-exports resolve).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/test/anomaly.test.ts
git commit -m "test(shared): classifyStatus severity mapping"
```

---

### Task 4: Ingestor package + config (TDD)

**Files:**
- Create: `packages/ingestor/package.json`, `packages/ingestor/tsconfig.json`, `packages/ingestor/src/config.ts`
- Test: `packages/ingestor/test/config.test.ts`

- [ ] **Step 1: Create the ingestor manifest + tsconfig, install deps**

`packages/ingestor/package.json`:

```json
{
  "name": "@pulse/ingestor",
  "version": "0.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.654.0",
    "@pulse/shared": "workspace:*"
  }
}
```

`packages/ingestor/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "references": [{ "path": "../shared" }],
  "include": ["src"]
}
```

Run: `pnpm install`
Expected: links `@pulse/shared`, installs the AWS SDK.

- [ ] **Step 2: Write the failing test**

`packages/ingestor/test/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const base = {
  TFL_APP_KEY: "k",
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "id",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
};

describe("loadConfig", () => {
  it("reads required vars and applies defaults", () => {
    const cfg = loadConfig(base);
    expect(cfg.tflAppKey).toBe("k");
    expect(cfg.r2.bucket).toBe("bucket");
    expect(cfg.snapshotKey).toBe("snapshot.json");
    expect(cfg.modes).toEqual(["tube", "overground", "elizabeth-line", "dlr", "tram"]);
  });

  it("overrides modes and snapshot key from env", () => {
    const cfg = loadConfig({ ...base, TFL_MODES: "tube,dlr", SNAPSHOT_KEY: "pulse/s.json" });
    expect(cfg.modes).toEqual(["tube", "dlr"]);
    expect(cfg.snapshotKey).toBe("pulse/s.json");
  });

  it("throws listing every missing required var", () => {
    expect(() => loadConfig({})).toThrowError(/TFL_APP_KEY.*R2_ACCOUNT_ID/s);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/config.test.ts`
Expected: FAIL — cannot find module `../src/config`.

- [ ] **Step 4: Write the implementation**

`packages/ingestor/src/config.ts`:

```ts
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface Config {
  tflAppKey: string;
  r2: R2Config;
  snapshotKey: string;
  historyPrefix: string;
  modes: string[];
}

const DEFAULT_MODES = ["tube", "overground", "elizabeth-line", "dlr", "tram"];

export function loadConfig(env: Record<string, string | undefined>): Config {
  const missing: string[] = [];
  const req = (name: string): string => {
    const v = env[name];
    if (!v) missing.push(name);
    return v ?? "";
  };

  const tflAppKey = req("TFL_APP_KEY");
  const accountId = req("R2_ACCOUNT_ID");
  const accessKeyId = req("R2_ACCESS_KEY_ID");
  const secretAccessKey = req("R2_SECRET_ACCESS_KEY");
  const bucket = req("R2_BUCKET");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    tflAppKey,
    r2: { accountId, accessKeyId, secretAccessKey, bucket },
    snapshotKey: env.SNAPSHOT_KEY ?? "snapshot.json",
    historyPrefix: env.HISTORY_PREFIX ?? "history",
    modes: (env.TFL_MODES ?? DEFAULT_MODES.join(",")).split(",").map((m) => m.trim()),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ingestor/package.json packages/ingestor/tsconfig.json packages/ingestor/src/config.ts packages/ingestor/test/config.test.ts pnpm-lock.yaml
git commit -m "feat(ingestor): config loader"
```

---

### Task 5: Time helpers — weekday + 15-min band (pure, TDD)

**Files:**
- Create: `packages/ingestor/src/time.ts`
- Test: `packages/ingestor/test/time.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ingestor/test/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { londonWeekday, londonBand } from "../src/time";

describe("london time helpers", () => {
  it("returns the 3-letter weekday in London time", () => {
    // 2026-05-30 is a Saturday
    expect(londonWeekday(new Date("2026-05-30T12:00:00Z"))).toBe("Sat");
  });

  it("buckets a time into a 15-min band 'HH:MM'", () => {
    expect(londonBand(new Date("2026-05-30T17:10:00Z"))).toBe("18:00"); // BST = UTC+1
    expect(londonBand(new Date("2026-05-30T17:20:00Z"))).toBe("18:15");
  });

  it("handles GMT (winter) offset", () => {
    expect(londonBand(new Date("2026-01-15T08:05:00Z"))).toBe("08:00"); // GMT = UTC
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/time.test.ts`
Expected: FAIL — cannot find module `../src/time`.

- [ ] **Step 3: Write the implementation**

`packages/ingestor/src/time.ts`:

```ts
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** London-local parts of a Date, honouring BST/GMT via Intl. */
function londonParts(d: Date): { weekday: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

export function londonWeekday(d: Date): string {
  const wd = londonParts(d).weekday;
  // Normalise to our 3-letter form (Intl already returns e.g. "Sat").
  return WEEKDAYS.includes(wd as (typeof WEEKDAYS)[number]) ? wd : wd.slice(0, 3);
}

/** Floor to the enclosing 15-minute band, formatted "HH:MM". */
export function londonBand(d: Date): string {
  const { hour, minute } = londonParts(d);
  const banded = Math.floor(minute / 15) * 15;
  return `${String(hour).padStart(2, "0")}:${String(banded).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/time.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ingestor/src/time.ts packages/ingestor/test/time.test.ts
git commit -m "feat(ingestor): London weekday + 15-min band helpers"
```

---

### Task 6: TfL HTTP client (TDD, mocked fetch)

**Files:**
- Create: `packages/ingestor/src/tfl/client.ts`
- Test: `packages/ingestor/test/tfl/client.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ingestor/test/tfl/client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { TflClient } from "../../src/tfl/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("TflClient", () => {
  it("appends app_key and base URL, parses JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new TflClient({ appKey: "secret", fetchFn });
    const data = await client.getJson<{ ok: boolean }>("/Line/victoria/Status");
    expect(data.ok).toBe(true);
    const url = fetchFn.mock.calls[0]![0] as string;
    expect(url).toBe("https://api.tfl.gov.uk/Line/victoria/Status?app_key=secret");
  });

  it("retries once on a 5xx then succeeds", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    const client = new TflClient({ appKey: "k", fetchFn, retries: 1, retryDelayMs: 0 });
    await expect(client.getJson("/x")).resolves.toEqual({ ok: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on a 4xx (no retry)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ msg: "bad" }, 404));
    const client = new TflClient({ appKey: "k", fetchFn, retries: 2, retryDelayMs: 0 });
    await expect(client.getJson("/x")).rejects.toThrow(/404/);
    expect(fetchFn).toHaveBeenCalledTimes(1); // 4xx is not retried
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/tfl/client.test.ts`
Expected: FAIL — cannot find module `../../src/tfl/client`.

- [ ] **Step 3: Write the implementation**

`packages/ingestor/src/tfl/client.ts`:

```ts
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface TflClientOptions {
  appKey: string;
  baseUrl?: string;
  fetchFn?: FetchFn;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TflClient {
  private readonly appKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(opts: TflClientOptions) {
    this.appKey = opts.appKey;
    this.baseUrl = opts.baseUrl ?? "https://api.tfl.gov.uk";
    this.fetchFn = opts.fetchFn ?? ((u, i) => fetch(u, i));
    this.retries = opts.retries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 500;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private buildUrl(path: string, query: Record<string, string> = {}): string {
    const params = new URLSearchParams({ ...query, app_key: this.appKey });
    return `${this.baseUrl}${path}?${params.toString()}`;
  }

  async getJson<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await this.fetchFn(url, { signal: ctrl.signal });
        if (res.ok) return (await res.json()) as T;
        // 4xx: caller error, do not retry.
        if (res.status >= 400 && res.status < 500) {
          throw new Error(`TfL ${res.status} for ${path}`);
        }
        lastErr = new Error(`TfL ${res.status} for ${path}`);
      } catch (err) {
        if (err instanceof Error && err.message.includes("TfL 4")) throw err;
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < this.retries) await sleep(this.retryDelayMs);
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/tfl/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ingestor/src/tfl/client.ts packages/ingestor/test/tfl/client.test.ts
git commit -m "feat(ingestor): TfL client with app_key, timeout, retry"
```

---

### Task 7: Fetchers + raw types + fixtures (contract tests)

**Files:**
- Create: `packages/ingestor/src/tfl/types.ts`, `packages/ingestor/src/tfl/fetchers.ts`
- Create fixtures: `packages/ingestor/test/fixtures/status.json`, `crowding-live.json`, `crowding-live-unavailable.json`, `crowding-typical.json`, `stoppoints-tube.json`
- Test: `packages/ingestor/test/tfl/fetchers.test.ts`

> The fixtures below are representative of the documented TfL shapes. After Task 15 runs once live, re-record real responses into these files (`curl 'https://api.tfl.gov.uk/<path>?app_key=KEY'`) and re-run the tests to confirm the parsers still pass.

- [ ] **Step 1: Create the fixtures**

`packages/ingestor/test/fixtures/status.json`:

```json
[
  {
    "id": "victoria",
    "name": "Victoria",
    "modeName": "tube",
    "lineStatuses": [{ "statusSeverity": 10, "statusSeverityDescription": "Good Service" }]
  },
  {
    "id": "central",
    "name": "Central",
    "modeName": "tube",
    "lineStatuses": [
      {
        "statusSeverity": 6,
        "statusSeverityDescription": "Severe Delays",
        "disruption": {
          "category": "RealTime",
          "description": "Severe delays due to a signal failure at Liverpool Street."
        }
      }
    ]
  }
]
```

`packages/ingestor/test/fixtures/crowding-live.json`:

```json
{ "dataAvailable": true, "percentageOfBaseline": 0.62, "timeUtc": "2026-05-30T17:10:00Z", "timeLocal": "2026-05-30T18:10:00" }
```

`packages/ingestor/test/fixtures/crowding-live-unavailable.json`:

```json
{ "dataAvailable": false, "percentageOfBaseline": 0, "timeUtc": "2026-05-30T17:10:00Z", "timeLocal": "2026-05-30T18:10:00" }
```

`packages/ingestor/test/fixtures/crowding-typical.json`:

```json
{
  "naptan": "940GZZLUVIC",
  "dayOfWeek": "Sat",
  "timeBands": [
    { "timeBand": { "from": "18:00", "until": "18:15" }, "percentageOfBaseLine": 0.48 },
    { "timeBand": { "from": "18:15", "until": "18:30" }, "percentageOfBaseLine": 0.51 }
  ]
}
```

`packages/ingestor/test/fixtures/stoppoints-tube.json`:

```json
{
  "stopPoints": [
    {
      "naptanId": "940GZZLUVIC",
      "commonName": "Victoria Underground Station",
      "lat": 51.496359,
      "lon": -0.143686,
      "lines": [{ "id": "circle" }, { "id": "district" }, { "id": "victoria" }]
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`packages/ingestor/test/tfl/fetchers.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TflClient } from "../../src/tfl/client";
import {
  fetchLineStatus,
  fetchLiveCrowding,
  fetchTypical,
  fetchStations,
} from "../../src/tfl/fetchers";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFile(join(here, "..", "fixtures", name), "utf8");

function clientReturning(body: string): TflClient {
  const fetchFn = vi.fn(async () =>
    new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
  );
  return new TflClient({ appKey: "k", fetchFn });
}

describe("fetchers", () => {
  it("parses line status into domain lines (worst lineStatus wins)", async () => {
    const client = clientReturning(await fixture("status.json"));
    const lines = await fetchLineStatus(client, ["tube"]);
    const central = lines.find((l) => l.id === "central")!;
    expect(central.statusSeverity).toBe(6);
    expect(central.statusDescription).toBe("Severe Delays");
    expect(central.disruptions).toEqual([
      { category: "RealTime", description: "Severe delays due to a signal failure at Liverpool Street." },
    ]);
    const victoria = lines.find((l) => l.id === "victoria")!;
    expect(victoria.disruptions).toEqual([]);
  });

  it("parses live crowding", async () => {
    const client = clientReturning(await fixture("crowding-live.json"));
    const live = await fetchLiveCrowding(client, "940GZZLUVIC");
    expect(live).toEqual({ dataAvailable: true, percentageOfBaseline: 0.62 });
  });

  it("parses unavailable live crowding to null value", async () => {
    const client = clientReturning(await fixture("crowding-live-unavailable.json"));
    const live = await fetchLiveCrowding(client, "940GZZLUVIC");
    expect(live).toEqual({ dataAvailable: false, percentageOfBaseline: null });
  });

  it("parses typical bands keyed by 'HH:MM' (handles percentageOfBaseLine casing)", async () => {
    const client = clientReturning(await fixture("crowding-typical.json"));
    const bands = await fetchTypical(client, "940GZZLUVIC", "Sat");
    expect(bands["18:00"]).toBe(0.48);
    expect(bands["18:15"]).toBe(0.51);
  });

  it("parses stations with coords and line ids", async () => {
    const client = clientReturning(await fixture("stoppoints-tube.json"));
    const stations = await fetchStations(client);
    expect(stations[0]).toEqual({
      naptan: "940GZZLUVIC",
      name: "Victoria",
      lat: 51.496359,
      lon: -0.143686,
      lines: ["circle", "district", "victoria"],
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/tfl/fetchers.test.ts`
Expected: FAIL — cannot find module `../../src/tfl/fetchers`.

- [ ] **Step 4: Write the raw types**

`packages/ingestor/src/tfl/types.ts`:

```ts
export interface RawLineStatus {
  statusSeverity?: number;
  statusSeverityDescription?: string;
  disruption?: { category?: string; description?: string };
}

export interface RawLine {
  id: string;
  name: string;
  modeName: string;
  lineStatuses?: RawLineStatus[];
}

export interface RawLiveCrowding {
  dataAvailable?: boolean;
  percentageOfBaseline?: number;
}

export interface RawTypicalBand {
  timeBand?: { from?: string; until?: string };
  percentageOfBaseLine?: number; // note: TfL uses this casing
  percentageOfBaseline?: number; // defensive: accept both
}

export interface RawTypical {
  timeBands?: RawTypicalBand[];
}

export interface RawStopPoint {
  naptanId: string;
  commonName: string;
  lat: number;
  lon: number;
  lines?: { id: string }[];
}

export interface RawStopPointsResponse {
  stopPoints?: RawStopPoint[];
}
```

- [ ] **Step 5: Write the fetchers**

`packages/ingestor/src/tfl/fetchers.ts`:

```ts
import type { LineDisruption } from "@pulse/shared";
import type { TflClient } from "./client";
import type {
  RawLine,
  RawLiveCrowding,
  RawStopPointsResponse,
  RawTypical,
} from "./types";

export interface DomainLineStatus {
  id: string;
  name: string;
  mode: string;
  statusSeverity: number;
  statusDescription: string;
  disruptions: LineDisruption[];
}

export interface DomainLive {
  dataAvailable: boolean;
  percentageOfBaseline: number | null;
}

export type TypicalBands = Record<string, number>; // "HH:MM" -> value

export interface DomainStation {
  naptan: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
}

function cleanName(name: string): string {
  return name.replace(/\s+Underground Station$/i, "").trim();
}

export async function fetchLineStatus(
  client: TflClient,
  modes: string[],
): Promise<DomainLineStatus[]> {
  const raw = await client.getJson<RawLine[]>(`/Line/Mode/${modes.join(",")}/Status`, {
    detail: "true",
  });
  return raw.map((line) => {
    // Pick the worst lineStatus (lowest severity number = worst).
    const worst = (line.lineStatuses ?? [])
      .slice()
      .sort((a, b) => (a.statusSeverity ?? 99) - (b.statusSeverity ?? 99))[0];
    const disruptions: LineDisruption[] = (line.lineStatuses ?? [])
      .filter((s) => s.disruption?.description)
      .map((s) => ({
        category: s.disruption?.category ?? "Unknown",
        description: s.disruption!.description!,
      }));
    return {
      id: line.id,
      name: line.name,
      mode: line.modeName,
      statusSeverity: worst?.statusSeverity ?? 10,
      statusDescription: worst?.statusSeverityDescription ?? "Good Service",
      disruptions,
    };
  });
}

export async function fetchLiveCrowding(client: TflClient, naptan: string): Promise<DomainLive> {
  const raw = await client.getJson<RawLiveCrowding>(`/crowding/${naptan}/Live`);
  const available = raw.dataAvailable === true;
  return {
    dataAvailable: available,
    percentageOfBaseline: available ? (raw.percentageOfBaseline ?? null) : null,
  };
}

export async function fetchTypical(
  client: TflClient,
  naptan: string,
  dayOfWeek: string,
): Promise<TypicalBands> {
  const raw = await client.getJson<RawTypical>(`/crowding/${naptan}/${dayOfWeek}`);
  const out: TypicalBands = {};
  for (const b of raw.timeBands ?? []) {
    const from = b.timeBand?.from;
    const value = b.percentageOfBaseLine ?? b.percentageOfBaseline;
    if (from && typeof value === "number") out[from] = value;
  }
  return out;
}

export async function fetchStations(client: TflClient): Promise<DomainStation[]> {
  const raw = await client.getJson<RawStopPointsResponse>(`/StopPoint/Mode/tube`);
  return (raw.stopPoints ?? []).map((sp) => ({
    naptan: sp.naptanId,
    name: cleanName(sp.commonName),
    lat: sp.lat,
    lon: sp.lon,
    lines: (sp.lines ?? []).map((l) => l.id),
  }));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/tfl/fetchers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/ingestor/src/tfl/types.ts packages/ingestor/src/tfl/fetchers.ts packages/ingestor/test/tfl
git commit -m "feat(ingestor): TfL fetchers + contract fixtures"
```

---

### Task 8: TypicalBaselineStore (TDD)

**Files:**
- Create: `packages/ingestor/src/baseline.ts`
- Test: `packages/ingestor/test/baseline.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ingestor/test/baseline.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { TypicalBaselineStore } from "../src/baseline";

describe("TypicalBaselineStore", () => {
  it("fetches a station's bands once per weekday and caches them", async () => {
    const fetchTypical = vi.fn(async () => ({ "18:00": 0.48, "18:15": 0.51 }));
    const store = new TypicalBaselineStore(fetchTypical);

    expect(await store.typicalFor("940GZZLUVIC", "Sat", "18:00")).toBe(0.48);
    expect(await store.typicalFor("940GZZLUVIC", "Sat", "18:15")).toBe(0.51);
    expect(fetchTypical).toHaveBeenCalledTimes(1); // cached after first lookup
  });

  it("returns null for an unknown band", async () => {
    const fetchTypical = vi.fn(async () => ({ "18:00": 0.48 }));
    const store = new TypicalBaselineStore(fetchTypical);
    expect(await store.typicalFor("X", "Sat", "03:00")).toBeNull();
  });

  it("returns null and does not throw if the fetch fails", async () => {
    const fetchTypical = vi.fn(async () => {
      throw new Error("boom");
    });
    const store = new TypicalBaselineStore(fetchTypical);
    expect(await store.typicalFor("X", "Sat", "18:00")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/baseline.test.ts`
Expected: FAIL — cannot find module `../src/baseline`.

- [ ] **Step 3: Write the implementation**

`packages/ingestor/src/baseline.ts`:

```ts
import type { TypicalBands } from "./tfl/fetchers";

type Fetcher = (naptan: string, dayOfWeek: string) => Promise<TypicalBands>;

/** Caches per (naptan, weekday) typical bands; one fetch per key. */
export class TypicalBaselineStore {
  private readonly cache = new Map<string, Promise<TypicalBands | null>>();

  constructor(private readonly fetchTypical: Fetcher) {}

  private load(naptan: string, weekday: string): Promise<TypicalBands | null> {
    const key = `${naptan}|${weekday}`;
    let entry = this.cache.get(key);
    if (!entry) {
      entry = this.fetchTypical(naptan, weekday).catch(() => null);
      this.cache.set(key, entry);
    }
    return entry;
  }

  async typicalFor(naptan: string, weekday: string, band: string): Promise<number | null> {
    const bands = await this.load(naptan, weekday);
    if (!bands) return null;
    return bands[band] ?? null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/baseline.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ingestor/src/baseline.ts packages/ingestor/test/baseline.test.ts
git commit -m "feat(ingestor): typical-baseline store with caching"
```

---

### Task 9: Anomaly engine — station, line, network (TDD)

**Files:**
- Create: `packages/ingestor/src/anomaly.ts`
- Test: `packages/ingestor/test/anomaly.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ingestor/test/anomaly.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { crowdingAnomaly, median, aggregateLineCrowding, networkScore } from "../src/anomaly";
import type { StationSnapshot, LineSnapshot } from "@pulse/shared";

describe("crowdingAnomaly", () => {
  it("computes ratio + band when both values present", () => {
    expect(crowdingAnomaly(0.62, 0.48)).toEqual({ anomaly: 0.62 / 0.48, band: "busier" });
  });
  it("is unknown when live missing", () => {
    expect(crowdingAnomaly(null, 0.48)).toEqual({ anomaly: null, band: "unknown" });
  });
  it("is unknown when typical missing or zero", () => {
    expect(crowdingAnomaly(0.5, null)).toEqual({ anomaly: null, band: "unknown" });
    expect(crowdingAnomaly(0.5, 0)).toEqual({ anomaly: null, band: "unknown" });
  });
});

describe("median", () => {
  it("handles odd and even counts and ignores nulls", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([null, 2, null, 4])).toBe(3);
    expect(median([])).toBeNull();
    expect(median([null])).toBeNull();
  });
});

describe("aggregateLineCrowding", () => {
  it("medians the anomalies of a line's tube stations", () => {
    const stations: StationSnapshot[] = [
      stub("a", ["victoria"], 1.2),
      stub("b", ["victoria"], 1.6),
      stub("c", ["central"], 0.5),
    ];
    expect(aggregateLineCrowding("victoria", stations)).toBeCloseTo(1.4);
    expect(aggregateLineCrowding("waterloo-city", stations)).toBeNull();
  });
});

describe("networkScore", () => {
  it("summarises verdict, disrupted count, worst lines, headline", () => {
    const stations: StationSnapshot[] = [stub("a", ["victoria"], 1.5), stub("b", ["central"], 1.6)];
    const lines: LineSnapshot[] = [
      line("victoria", "Victoria", "good", 1.5),
      line("central", "Central", "severe", 1.6),
      line("circle", "Circle", "minor", null),
    ];
    const s = networkScore(stations, lines, new Date("2026-05-30T17:10:00Z"));
    expect(s.disruptedLineCount).toBe(2); // minor + severe
    expect(s.verdict).toBe("busier_than_usual");
    expect(s.worstLines).toContain("Central");
    expect(s.headline).toMatch(/busier than usual/i);
  });
});

function stub(naptan: string, lines: string[], anomaly: number): StationSnapshot {
  return {
    naptan, name: naptan, lat: 0, lon: 0, lines,
    live: 0.5, typical: 0.5 / anomaly, anomaly, anomalyBand: "busier", dataAvailable: true,
  };
}
function line(id: string, name: string, level: LineSnapshot["statusLevel"], crowd: number | null): LineSnapshot {
  return {
    id, name, mode: "tube", statusSeverity: level === "good" ? 10 : 6,
    statusDescription: level, statusLevel: level, disruptions: [], crowdingAnomaly: crowd,
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/anomaly.test.ts`
Expected: FAIL — cannot find module `../src/anomaly`.

- [ ] **Step 3: Write the implementation**

`packages/ingestor/src/anomaly.ts`:

```ts
import {
  classifyAnomaly,
  type AnomalyBand,
  type LineSnapshot,
  type NetworkSummary,
  type NetworkVerdict,
  type StationSnapshot,
} from "@pulse/shared";
import { londonWeekday } from "./time";

export function crowdingAnomaly(
  live: number | null,
  typical: number | null,
): { anomaly: number | null; band: AnomalyBand } {
  if (live === null || typical === null || typical === 0) {
    return { anomaly: null, band: "unknown" };
  }
  const anomaly = live / typical;
  return { anomaly, band: classifyAnomaly(anomaly) };
}

export function median(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1]! + nums[mid]!) / 2 : nums[mid]!;
}

export function aggregateLineCrowding(
  lineId: string,
  stations: StationSnapshot[],
): number | null {
  const ratios = stations
    .filter((s) => s.lines.includes(lineId))
    .map((s) => s.anomaly);
  return median(ratios);
}

export function networkScore(
  stations: StationSnapshot[],
  lines: LineSnapshot[],
  now: Date,
): NetworkSummary {
  const crowdingAnomaly = median(stations.map((s) => s.anomaly));
  const disrupted = lines.filter((l) => l.statusLevel === "minor" || l.statusLevel === "severe");
  const worstLines = lines
    .filter((l) => l.statusLevel === "severe")
    .map((l) => l.name)
    .slice(0, 3);

  let verdict: NetworkVerdict = "typical";
  if (crowdingAnomaly !== null) {
    if (crowdingAnomaly >= 1.15) verdict = "busier_than_usual";
    else if (crowdingAnomaly <= 0.85) verdict = "quieter_than_usual";
  }

  return {
    crowdingAnomaly,
    disruptedLineCount: disrupted.length,
    verdict,
    worstLines,
    headline: buildHeadline(verdict, disrupted.length, worstLines, now),
  };
}

function buildHeadline(
  verdict: NetworkVerdict,
  disruptedCount: number,
  worstLines: string[],
  now: Date,
): string {
  const day = fullWeekday(londonWeekday(now));
  const crowd =
    verdict === "busier_than_usual"
      ? `Busier than usual for a ${day}`
      : verdict === "quieter_than_usual"
        ? `Quieter than usual for a ${day}`
        : `About as busy as a typical ${day}`;
  if (disruptedCount === 0) return `${crowd}, and every line has a good service.`;
  const worst = worstLines.length ? ` (worst: ${worstLines.join(", ")})` : "";
  const lineWord = disruptedCount === 1 ? "line" : "lines";
  return `${crowd}, with ${disruptedCount} ${lineWord} disrupted${worst}.`;
}

function fullWeekday(short: string): string {
  const map: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  };
  return map[short] ?? short;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/anomaly.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add packages/ingestor/src/anomaly.ts packages/ingestor/test/anomaly.test.ts
git commit -m "feat(ingestor): station/line/network anomaly engine"
```

---

### Task 10: Snapshot builder (TDD, golden)

**Files:**
- Create: `packages/ingestor/src/builder.ts`
- Test: `packages/ingestor/test/builder.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ingestor/test/builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSnapshot, type BuildInput } from "../src/builder";
import { SCHEMA_VERSION } from "@pulse/shared";

const now = new Date("2026-05-30T17:10:00Z"); // Sat, BST band 18:00

const input: BuildInput = {
  now,
  statusFetchedAt: new Date("2026-05-30T17:09:30Z"),
  crowdingFetchedAt: new Date("2026-05-30T17:08:00Z"),
  lines: [
    { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
    { id: "central", name: "Central", mode: "tube", statusSeverity: 6, statusDescription: "Severe Delays", disruptions: [{ category: "RealTime", description: "Signal failure." }] },
    { id: "london-overground", name: "London Overground", mode: "overground", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
  ],
  stations: [
    { naptan: "VIC", name: "Victoria", lat: 51.49, lon: -0.14, lines: ["victoria"], live: 0.62, typical: 0.48 },
    { naptan: "OXC", name: "Oxford Circus", lat: 51.51, lon: -0.14, lines: ["victoria", "central"], live: 0.9, typical: 0.5 },
    { naptan: "DARK", name: "No Data", lat: 51.5, lon: -0.1, lines: ["central"], live: null, typical: null },
  ],
};

describe("buildSnapshot", () => {
  it("produces a versioned snapshot with computed bands + freshness", () => {
    const snap = buildSnapshot(input);
    expect(snap.schemaVersion).toBe(SCHEMA_VERSION);
    expect(snap.generatedAt).toBe("2026-05-30T17:10:00.000Z");
    expect(snap.freshness.statusAgeSec).toBe(30);
    expect(snap.freshness.crowdingAgeSec).toBe(120);

    const vic = snap.stations.find((s) => s.naptan === "VIC")!;
    expect(vic.anomalyBand).toBe("busier"); // 0.62/0.48 ≈ 1.29
    const dark = snap.stations.find((s) => s.naptan === "DARK")!;
    expect(dark.anomalyBand).toBe("unknown");
    expect(dark.dataAvailable).toBe(false);

    const central = snap.lines.find((l) => l.id === "central")!;
    expect(central.statusLevel).toBe("severe");
    expect(central.crowdingAnomaly).toBeCloseTo(0.9 / 0.5); // only OXC on central has data

    const overground = snap.lines.find((l) => l.id === "london-overground")!;
    expect(overground.crowdingAnomaly).toBeNull(); // non-tube → no crowding

    expect(snap.network.verdict).toBe("busier_than_usual");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/builder.test.ts`
Expected: FAIL — cannot find module `../src/builder`.

- [ ] **Step 3: Write the implementation**

`packages/ingestor/src/builder.ts`:

```ts
import {
  classifyStatus,
  type LineSnapshot,
  type Snapshot,
  type StationSnapshot,
  SCHEMA_VERSION,
} from "@pulse/shared";
import { aggregateLineCrowding, crowdingAnomaly, networkScore } from "./anomaly";

export interface BuildLineInput {
  id: string;
  name: string;
  mode: string;
  statusSeverity: number;
  statusDescription: string;
  disruptions: { category: string; description: string }[];
}

export interface BuildStationInput {
  naptan: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
  live: number | null;
  typical: number | null;
}

export interface BuildInput {
  now: Date;
  statusFetchedAt: Date;
  crowdingFetchedAt: Date;
  lines: BuildLineInput[];
  stations: BuildStationInput[];
}

const TUBE_MODE = "tube";
const ageSec = (now: Date, then: Date) => Math.round((now.getTime() - then.getTime()) / 1000);

export function buildSnapshot(input: BuildInput): Snapshot {
  const stations: StationSnapshot[] = input.stations.map((s) => {
    const { anomaly, band } = crowdingAnomaly(s.live, s.typical);
    return {
      naptan: s.naptan,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      lines: s.lines,
      live: s.live,
      typical: s.typical,
      anomaly,
      anomalyBand: band,
      dataAvailable: s.live !== null,
    };
  });

  const lines: LineSnapshot[] = input.lines.map((l) => ({
    id: l.id,
    name: l.name,
    mode: l.mode,
    statusSeverity: l.statusSeverity,
    statusDescription: l.statusDescription,
    statusLevel: classifyStatus(l.statusSeverity),
    disruptions: l.disruptions,
    crowdingAnomaly: l.mode === TUBE_MODE ? aggregateLineCrowding(l.id, stations) : null,
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: input.now.toISOString(),
    freshness: {
      statusAgeSec: ageSec(input.now, input.statusFetchedAt),
      crowdingAgeSec: ageSec(input.now, input.crowdingFetchedAt),
    },
    network: networkScore(stations, lines, input.now),
    lines,
    stations,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/builder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ingestor/src/builder.ts packages/ingestor/test/builder.test.ts
git commit -m "feat(ingestor): snapshot builder"
```

---

### Task 11: R2 writer (TDD, injected S3 client)

**Files:**
- Create: `packages/ingestor/src/writer.ts`
- Test: `packages/ingestor/test/writer.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ingestor/test/writer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { writeSnapshot, makeR2Client } from "../src/writer";
import type { Snapshot } from "@pulse/shared";

const snap = { schemaVersion: 1, generatedAt: "t", freshness: { statusAgeSec: 0, crowdingAgeSec: 0 }, network: { crowdingAnomaly: null, disruptedLineCount: 0, verdict: "typical", headline: "h", worstLines: [] }, lines: [], stations: [] } as unknown as Snapshot;

describe("writeSnapshot", () => {
  it("puts JSON with content-type and a short cache header", async () => {
    const send = vi.fn().mockResolvedValue({});
    await writeSnapshot({ send } as never, "bucket", "snapshot.json", snap);
    const cmd = send.mock.calls[0]![0];
    expect(cmd.input.Bucket).toBe("bucket");
    expect(cmd.input.Key).toBe("snapshot.json");
    expect(cmd.input.ContentType).toBe("application/json");
    expect(cmd.input.CacheControl).toMatch(/max-age=/);
    expect(JSON.parse(cmd.input.Body as string).generatedAt).toBe("t");
  });

  it("makeR2Client builds an S3 client pointed at the R2 endpoint", () => {
    const client = makeR2Client({ accountId: "acct", accessKeyId: "id", secretAccessKey: "s", bucket: "b" });
    expect(client).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/writer.test.ts`
Expected: FAIL — cannot find module `../src/writer`.

- [ ] **Step 3: Write the implementation**

`packages/ingestor/src/writer.ts`:

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Snapshot } from "@pulse/shared";
import type { R2Config } from "./config";

/** Minimal surface we use, so tests can inject a fake (type-safe: derived from S3Client). */
export type S3Like = Pick<S3Client, "send">;

export function makeR2Client(r2: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
  });
}

export async function writeSnapshot(
  client: S3Like,
  bucket: string,
  key: string,
  snapshot: Snapshot,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(snapshot),
      ContentType: "application/json",
      // Short edge cache; the loader (Plan 2) layers its own Caches API TTL.
      CacheControl: "public, max-age=30",
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/writer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ingestor/src/writer.ts packages/ingestor/test/writer.test.ts
git commit -m "feat(ingestor): R2 snapshot writer"
```

---

### Task 12: Snapshot history logger (TDD)

**Files:**
- Create: `packages/ingestor/src/history.ts`
- Test: `packages/ingestor/test/history.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ingestor/test/history.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { logSnapshot } from "../src/history";
import type { Snapshot } from "@pulse/shared";

const snap = {
  schemaVersion: 1,
  generatedAt: "2026-05-30T17:10:00.000Z",
  freshness: { statusAgeSec: 0, crowdingAgeSec: 0 },
  network: { crowdingAnomaly: 1.2, disruptedLineCount: 1, verdict: "busier_than_usual", headline: "h", worstLines: ["Central"] },
  lines: [],
  stations: [],
} as unknown as Snapshot;

describe("logSnapshot", () => {
  it("writes a compact per-cycle history object keyed by date/time", async () => {
    const send = vi.fn().mockResolvedValue({});
    await logSnapshot({ send } as never, "bucket", "history", snap, new Date("2026-05-30T17:10:00Z"));
    const cmd = send.mock.calls[0]![0];
    expect(cmd.input.Key).toBe("history/2026-05-30/17-10.json");
    const body = JSON.parse(cmd.input.Body as string);
    expect(body).toEqual({
      generatedAt: "2026-05-30T17:10:00.000Z",
      crowdingAnomaly: 1.2,
      disruptedLineCount: 1,
      verdict: "busier_than_usual",
      worstLines: ["Central"],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/history.test.ts`
Expected: FAIL — cannot find module `../src/history`.

- [ ] **Step 3: Write the implementation**

`packages/ingestor/src/history.ts`:

```ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { Snapshot } from "@pulse/shared";
import type { S3Like } from "./writer";

function utcKeyParts(d: Date): { date: string; time: string } {
  const iso = d.toISOString(); // 2026-05-30T17:10:00.000Z
  const date = iso.slice(0, 10);
  const time = `${iso.slice(11, 13)}-${iso.slice(14, 16)}`;
  return { date, time };
}

/** Append-free history: one small object per cycle, seeds the future status-anomaly. */
export async function logSnapshot(
  client: S3Like,
  bucket: string,
  prefix: string,
  snapshot: Snapshot,
  now: Date,
): Promise<void> {
  const { date, time } = utcKeyParts(now);
  const body = {
    generatedAt: snapshot.generatedAt,
    crowdingAnomaly: snapshot.network.crowdingAnomaly,
    disruptedLineCount: snapshot.network.disruptedLineCount,
    verdict: snapshot.network.verdict,
    worstLines: snapshot.network.worstLines,
  };
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}/${date}/${time}.json`,
      Body: JSON.stringify(body),
      ContentType: "application/json",
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ingestor/src/history.ts packages/ingestor/test/history.test.ts
git commit -m "feat(ingestor): per-cycle history logger"
```

---

### Task 13: Orchestrator `runPollCycle` (TDD, resilient)

**Files:**
- Create: `packages/ingestor/src/run.ts`
- Test: `packages/ingestor/test/run.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ingestor/test/run.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runPollCycle, type Deps } from "../src/run";

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    now: () => new Date("2026-05-30T17:10:00Z"),
    fetchLineStatus: vi.fn(async () => [
      { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
    ]),
    fetchStations: vi.fn(async () => [
      { naptan: "VIC", name: "Victoria", lat: 51.49, lon: -0.14, lines: ["victoria"] },
      { naptan: "OXC", name: "Oxford Circus", lat: 51.51, lon: -0.14, lines: ["victoria"] },
    ]),
    fetchLiveCrowding: vi.fn(async (naptan: string) =>
      naptan === "VIC"
        ? { dataAvailable: true, percentageOfBaseline: 0.62 }
        : { dataAvailable: false, percentageOfBaseline: null },
    ),
    typicalFor: vi.fn(async () => 0.48),
    writeSnapshot: vi.fn(async () => {}),
    logSnapshot: vi.fn(async () => {}),
    modes: ["tube"],
    ...overrides,
  };
}

describe("runPollCycle", () => {
  it("fetches, builds, writes, and logs a snapshot", async () => {
    const deps = makeDeps();
    const snap = await runPollCycle(deps);
    expect(deps.writeSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.logSnapshot).toHaveBeenCalledTimes(1);
    expect(snap.stations).toHaveLength(2);
    const vic = snap.stations.find((s) => s.naptan === "VIC")!;
    expect(vic.anomalyBand).toBe("busier");
  });

  it("isolates a single station's crowding failure (marks it unknown, still ships)", async () => {
    const deps = makeDeps({
      fetchLiveCrowding: vi.fn(async (naptan: string) => {
        if (naptan === "OXC") throw new Error("station boom");
        return { dataAvailable: true, percentageOfBaseline: 0.62 };
      }),
    });
    const snap = await runPollCycle(deps);
    const oxc = snap.stations.find((s) => s.naptan === "OXC")!;
    expect(oxc.dataAvailable).toBe(false);
    expect(oxc.anomalyBand).toBe("unknown");
    expect(deps.writeSnapshot).toHaveBeenCalledTimes(1); // cycle still ships
  });

  it("still ships a snapshot (stations only) if status fetch fails", async () => {
    const deps = makeDeps({
      fetchLineStatus: vi.fn(async () => {
        throw new Error("status boom");
      }),
    });
    const snap = await runPollCycle(deps);
    expect(snap.lines).toEqual([]);
    expect(deps.writeSnapshot).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingestor/test/run.test.ts`
Expected: FAIL — cannot find module `../src/run`.

- [ ] **Step 3: Write the implementation**

`packages/ingestor/src/run.ts`:

```ts
import type { Snapshot } from "@pulse/shared";
import { buildSnapshot, type BuildLineInput, type BuildStationInput } from "./builder";
import { londonBand, londonWeekday } from "./time";
import type { DomainLive, DomainLineStatus, DomainStation } from "./tfl/fetchers";

export interface Deps {
  now: () => Date;
  fetchLineStatus: (modes: string[]) => Promise<DomainLineStatus[]>;
  fetchStations: () => Promise<DomainStation[]>;
  fetchLiveCrowding: (naptan: string) => Promise<DomainLive>;
  typicalFor: (naptan: string, weekday: string, band: string) => Promise<number | null>;
  writeSnapshot: (snapshot: Snapshot) => Promise<void>;
  logSnapshot: (snapshot: Snapshot, now: Date) => Promise<void>;
  modes: string[];
  crowdingConcurrency?: number;
}

/** Run promises in batches to respect TfL rate limits. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

export async function runPollCycle(deps: Deps): Promise<Snapshot> {
  const now = deps.now();
  const weekday = londonWeekday(now);
  const band = londonBand(now);

  // Status and stations are independent; a failure in one must not sink the other.
  const statusFetchedAt = deps.now();
  const lines: BuildLineInput[] = await deps.fetchLineStatus(deps.modes).catch(() => []);

  const stationsMeta = await deps.fetchStations().catch(() => []);

  const crowdingFetchedAt = deps.now();
  const stations: BuildStationInput[] = await inBatches(
    stationsMeta,
    deps.crowdingConcurrency ?? 20,
    async (st) => {
      let live: number | null = null;
      try {
        const res = await deps.fetchLiveCrowding(st.naptan);
        live = res.dataAvailable ? res.percentageOfBaseline : null;
      } catch {
        live = null; // isolate per-station failure
      }
      let typical: number | null = null;
      if (live !== null) {
        typical = await deps.typicalFor(st.naptan, weekday, band).catch(() => null);
      }
      return { ...st, live, typical };
    },
  );

  const snapshot = buildSnapshot({ now, statusFetchedAt, crowdingFetchedAt, lines, stations });

  await deps.writeSnapshot(snapshot);
  await deps.logSnapshot(snapshot, now).catch(() => {}); // history is best-effort
  return snapshot;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingestor/test/run.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole suite + typecheck**

Run: `pnpm exec vitest run`
Expected: ALL tests pass.
Run: `pnpm exec tsc -b`
Expected: no type errors across both packages.

- [ ] **Step 6: Commit**

```bash
git add packages/ingestor/src/run.ts packages/ingestor/test/run.test.ts
git commit -m "feat(ingestor): resilient poll-cycle orchestrator"
```

---

### Task 14: Entrypoint wiring `index.ts`

**Files:**
- Create: `packages/ingestor/src/index.ts`

- [ ] **Step 1: Write the entrypoint**

`packages/ingestor/src/index.ts`:

```ts
import { loadConfig } from "./config";
import { TflClient } from "./tfl/client";
import {
  fetchLineStatus,
  fetchLiveCrowding,
  fetchStations,
  fetchTypical,
} from "./tfl/fetchers";
import { TypicalBaselineStore } from "./baseline";
import { makeR2Client, writeSnapshot } from "./writer";
import { logSnapshot } from "./history";
import { runPollCycle } from "./run";

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const client = new TflClient({ appKey: cfg.tflAppKey });
  const r2 = makeR2Client(cfg.r2);
  const baseline = new TypicalBaselineStore((naptan, weekday) =>
    fetchTypical(client, naptan, weekday),
  );

  const snapshot = await runPollCycle({
    now: () => new Date(),
    fetchLineStatus: (modes) => fetchLineStatus(client, modes),
    fetchStations: () => fetchStations(client),
    fetchLiveCrowding: (naptan) => fetchLiveCrowding(client, naptan),
    typicalFor: (naptan, weekday, band) => baseline.typicalFor(naptan, weekday, band),
    writeSnapshot: (snap) => writeSnapshot(r2, cfg.r2.bucket, cfg.snapshotKey, snap),
    logSnapshot: (snap, now) => logSnapshot(r2, cfg.r2.bucket, cfg.historyPrefix, snap, now),
    modes: cfg.modes,
  });

  console.log(
    `snapshot ${snapshot.generatedAt}: ${snapshot.stations.length} stations, ` +
      `${snapshot.lines.length} lines, verdict=${snapshot.network.verdict}`,
  );
}

main().catch((err) => {
  console.error("ingest failed:", err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Typecheck the entrypoint**

Run: `pnpm exec tsc -b`
Expected: no errors.

- [ ] **Step 3: Dry-run against the real API (optional, needs a TfL key + R2)**

Create a local `.env` (already gitignored) with the five secrets, then:
Run: `set -a && source .env && set +a && pnpm ingest`
Expected: logs a snapshot summary line; `snapshot.json` appears in the R2 bucket. (Skip if you don't yet have credentials — tests already prove the logic.)

- [ ] **Step 4: Commit**

```bash
git add packages/ingestor/src/index.ts
git commit -m "feat(ingestor): wire entrypoint"
```

---

### Task 15: Geometry + station bootstrap (static assets for the frontend)

**Files:**
- Create: `packages/ingestor/src/bootstrap-geometry.ts`

> This is a one-off generator (run manually, not on the cron). It produces `data/geometry.geojson` and `data/stations.json`, which Plan 2's frontend bundles. Verify the coordinate order once (see note in the code).

- [ ] **Step 1: Write the bootstrap script**

`packages/ingestor/src/bootstrap-geometry.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { loadConfig } from "./config";
import { TflClient } from "./tfl/client";
import { fetchStations } from "./tfl/fetchers";

interface RawSequence {
  lineId: string;
  lineName: string;
  lineStrings?: string[]; // each is a JSON string of coordinate pairs
}

interface GeoFeature {
  type: "Feature";
  properties: { lineId: string; lineName: string };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const client = new TflClient({ appKey: cfg.tflAppKey });

  // Fetch geometry per line across all configured rail modes.
  const features: GeoFeature[] = [];
  const lineMeta = await client.getJson<{ id: string; name: string }[]>(
    `/Line/Mode/${cfg.modes.join(",")}/Route`,
  );
  for (const line of lineMeta) {
    const seq = await client.getJson<RawSequence>(`/Line/${line.id}/Route/Sequence/all`);
    for (const ls of seq.lineStrings ?? []) {
      const coords = JSON.parse(ls) as [number, number][];
      // NOTE: TfL lineStrings are [lon, lat] (GeoJSON order). Verify once against a
      // known station (Victoria ≈ [-0.1437, 51.4965]); if reversed, map to [c[1], c[0]].
      features.push({
        type: "Feature",
        properties: { lineId: line.id, lineName: line.name },
        geometry: { type: "LineString", coordinates: coords },
      });
    }
  }

  const stations = await fetchStations(client);

  await mkdir("data", { recursive: true });
  await writeFile(
    "data/geometry.geojson",
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  await writeFile("data/stations.json", JSON.stringify(stations, null, 2));
  console.log(`wrote ${features.length} line features, ${stations.length} stations`);
}

main().catch((err) => {
  console.error("bootstrap failed:", err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc -b`
Expected: no errors.

- [ ] **Step 3: Generate the assets (needs a TfL key)**

Run: `set -a && source .env && set +a && pnpm bootstrap:geometry`
Expected: `data/geometry.geojson` + `data/stations.json` created; logs feature/station counts. Open `data/geometry.geojson` and spot-check that a Victoria-line coordinate is near `[-0.14, 51.50]` (lon, lat). If lat/lon are swapped, apply the `[c[1], c[0]]` fix noted in the code and re-run.

- [ ] **Step 4: Commit**

```bash
git add packages/ingestor/src/bootstrap-geometry.ts data/geometry.geojson data/stations.json
git commit -m "feat(ingestor): geometry + station bootstrap generator"
```

---

### Task 16: GitHub Actions cron workflow

**Files:**
- Create: `.github/workflows/poll.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/poll.yml`:

```yaml
name: Poll TfL → snapshot

on:
  schedule:
    - cron: "*/5 * * * *" # every 5 minutes (GitHub's minimum granularity)
  workflow_dispatch: {}

concurrency:
  group: poll
  cancel-in-progress: true

jobs:
  poll:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm ingest
        env:
          TFL_APP_KEY: ${{ secrets.TFL_APP_KEY }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
          SNAPSHOT_KEY: snapshot.json
```

- [ ] **Step 2: Validate the workflow locally**

Run: `cat .github/workflows/poll.yml | pnpm exec js-yaml >/dev/null && echo "yaml ok"` — if `js-yaml` is not installed, instead verify the file opens without tabs and the indentation is consistent (YAML forbids tabs).
Expected: no parse error.

- [ ] **Step 3: Commit, push, and confirm a live run**

```bash
git add .github/workflows/poll.yml
git commit -m "ci: poll TfL every 5 min and write snapshot to R2"
```

After pushing and adding the repo secrets (see External setup), trigger the workflow manually (Actions tab → "Poll TfL → snapshot" → Run workflow). Confirm:
- the job succeeds,
- `snapshot.json` exists in the R2 bucket and parses as valid JSON,
- `snapshot.json` contains non-empty `lines` and `stations` arrays with sane `anomalyBand` values.

---

## Self-Review

**1. Spec coverage** (spec §-by-§):
- §4 anomaly model → Tasks 2, 9, 10. §4.2 edge cases (typical=0, dataAvailable=false, missing band) → Tasks 8, 9, 10, 13. ✓
- §5 data sources / endpoints → Tasks 7, 15. Modes default → Task 4. ✓
- §6 architecture (GitHub Actions poller → R2) → Tasks 11, 14, 16. app_key only in ingestor → Tasks 6, 16. ✓
- §7 components (Fetchers, TypicalBaselineStore, AnomalyEngine, SnapshotBuilder, Writer, SnapshotLogger) → Tasks 7, 8, 9, 10, 11, 12. ✓
- §8 snapshot schema → Task 1, exercised by Task 10. ✓
- §9 rate-limit discipline (batched crowding calls) → Task 13 `inBatches`. ✓
- §13 resilience (per-station isolation; status/crowding independence; freshness) → Tasks 10, 13. ✓
- §14 testing (pure-engine TDD, golden builder, contract fetchers, orchestrator) → Tasks 2,3,9,10,7,13. ✓
- §15 day-1 history logging → Task 12. ✓
- Geometry static assets (for Plan 2) → Task 15. ✓
- **Frontend (§7 frontend units, §10 theme, §11 a11y)** → intentionally **out of scope** — that is Plan 2.

**2. Placeholder scan:** No "TBD"/"implement later"/"add error handling" left. The fixture re-record note (Task 7) and the lon/lat verify note (Task 15) are concrete instructions with real starting content, not vague placeholders. ✓

**3. Type consistency:** `Snapshot`/`StationSnapshot`/`LineSnapshot`/`NetworkSummary`/`AnomalyBand`/`StatusLevel` defined in Task 1 and imported everywhere. `classifyAnomaly`/`classifyStatus` (Task 2) used by `crowdingAnomaly`/`buildSnapshot` (Tasks 9, 10). `crowdingAnomaly`/`aggregateLineCrowding`/`networkScore`/`median` (Task 9) used by `buildSnapshot` (Task 10). `S3Like` (Task 11) reused by `logSnapshot` (Task 12). `Deps` (Task 13) satisfied by `index.ts` (Task 14). `DomainLineStatus`/`DomainStation`/`DomainLive`/`TypicalBands` (Task 7) flow into `Deps` and the builder inputs. ✓

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration (superpowers:subagent-driven-development).
2. **Inline Execution** — execute tasks in this session with checkpoints for review (superpowers:executing-plans).
