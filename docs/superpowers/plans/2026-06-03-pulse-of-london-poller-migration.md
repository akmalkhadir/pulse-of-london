# Sharded Cloudflare Cron Poller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the throttled GitHub Actions poller with a `packages/poller` Cloudflare Cron Worker that polls TfL in ~40-station shards every minute, keeping the R2 `snapshot.json` always <1 min old at full ~254-station coverage, for $0.

**Architecture:** A scheduled Worker (cron `* * * * *`) runs a dependency-injected orchestrator `runShardedCycle`. Each tick: load the station list (KV-cached, refreshed daily), pick one shard via a KV cursor, fetch line status (1 call) + the shard's live crowding (~40 calls), look up typical baselines from KV (fetching misses within a 50-`fetch` budget), then merge the shard's fresh values into the previous snapshot read from R2 and write it back via the R2 binding. KV/R2 binding ops do not count against the Workers free-tier 50-subrequest cap; only `fetch()` does.

**Tech Stack:** TypeScript ESM, Cloudflare Workers (`scheduled` handler), KV + R2 bindings, Wrangler, Vitest (node env, in-memory KV/R2 fakes), reusing pure logic from `@pulse/ingestor` and `@pulse/shared`.

**Spec:** `docs/superpowers/specs/2026-06-03-pulse-of-london-live-freshness-and-basemap-design.md` (Part 1).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/ingestor/src/time.ts` (modify) | Add `londonDateKey` (London-local `YYYY-MM-DD`) for daily station-list refresh. |
| `packages/ingestor/src/lib.ts` (create) | Worker-safe barrel re-exporting the pure ingestor modules (no aws-sdk / fs). |
| `packages/ingestor/package.json` (modify) | Add `"exports"` so `@pulse/poller` can import `@pulse/ingestor`. |
| `packages/poller/package.json` (create) | Poller workspace package + deps. |
| `packages/poller/tsconfig.json` (create) | TS project config (mirrors ingestor). |
| `packages/poller/wrangler.jsonc` (create) | Worker name, cron trigger, KV + R2 bindings, vars. |
| `packages/poller/src/bindings.ts` (create) | `Env`, `KvLike`, `R2Like` minimal binding interfaces. |
| `packages/poller/src/shard.ts` (create) | Pure `selectShard` (deterministic shard slice + count). |
| `packages/poller/src/merge.ts` (create) | Pure `mergeStationInputs` + `linesInput` (snapshot merge). |
| `packages/poller/src/baseline.ts` (create) | KV typical-baseline cache: `readCachedTypical`, `cacheTypical`. |
| `packages/poller/src/cycle.ts` (create) | `runShardedCycle` orchestrator (DI'd). |
| `packages/poller/src/index.ts` (create) | `scheduled()` handler — wires real bindings to `runShardedCycle`. |
| `packages/poller/test/*.test.ts` (create) | Unit tests for the helpers + orchestrator with fakes. |
| `.github/workflows/poll.yml` (modify) | Remove the `schedule:` trigger; keep `workflow_dispatch`. |
| `tsconfig.json` (modify) | Add `packages/poller` to project references. |
| `README.md` / `packages/ingestor/README.md` (modify) | Note the poller is now the live data source. |

---

## Task 1: Add `londonDateKey` to the time helpers

**Files:**
- Modify: `packages/ingestor/src/time.ts`
- Test: `packages/ingestor/test/time.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/ingestor/test/time.test.ts`:

```typescript
import { londonDateKey } from "../src/time";

describe("londonDateKey", () => {
  it("formats London-local date as YYYY-MM-DD", () => {
    // 2026-06-03T10:30:00Z is 11:30 BST on 2026-06-03 in London.
    expect(londonDateKey(new Date("2026-06-03T10:30:00Z"))).toBe("2026-06-03");
  });

  it("rolls the date using London time, not UTC", () => {
    // 2026-01-15T23:30:00Z is 23:30 GMT — still the 15th in London.
    expect(londonDateKey(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-15");
    // 2026-06-15T23:30:00Z is 00:30 BST on the 16th in London.
    expect(londonDateKey(new Date("2026-06-15T23:30:00Z"))).toBe("2026-06-16");
  });
});
```

If `time.test.ts` does not already import `describe/it/expect`, ensure the top of the file has: `import { describe, expect, it } from "vitest";` (add only if missing — do not duplicate).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- time`
Expected: FAIL — `londonDateKey is not a function` / no export.

- [ ] **Step 3: Implement `londonDateKey`**

Append to `packages/ingestor/src/time.ts`:

```typescript
/** London-local calendar date as "YYYY-MM-DD" (for daily cache rollover). */
export function londonDateKey(d: Date): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- time`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ingestor/src/time.ts packages/ingestor/test/time.test.ts
git commit -m "feat(ingestor): add londonDateKey for daily cache rollover"
```

---

## Task 2: Expose a Worker-safe barrel from `@pulse/ingestor`

The poller must import the pure TfL/build logic but NOT `writer.ts`/`history.ts` (they pull in `@aws-sdk/client-s3`) or `config.ts`/`index.ts`/`run.ts`/`bootstrap-geometry.ts` (Node-only). A dedicated barrel keeps the Worker bundle clean.

**Files:**
- Create: `packages/ingestor/src/lib.ts`
- Modify: `packages/ingestor/package.json`

- [ ] **Step 1: Create the barrel**

Create `packages/ingestor/src/lib.ts`:

```typescript
// Worker-safe surface of @pulse/ingestor: pure TfL fetch/build logic only.
// Deliberately excludes writer.ts/history.ts (aws-sdk) and config/index/run
// (Node entrypoints) so consumers like @pulse/poller bundle clean for workerd.
export * from "./tfl/client";
export * from "./tfl/fetchers";
export * from "./tfl/types";
export * from "./builder";
export * from "./anomaly";
export * from "./time";
```

- [ ] **Step 2: Add the `exports` field**

Edit `packages/ingestor/package.json` to add an `exports` map (mirrors `@pulse/shared`). Result:

```json
{
  "name": "@pulse/ingestor",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/lib.ts" },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.654.0",
    "@pulse/shared": "workspace:*"
  }
}
```

- [ ] **Step 3: Verify the existing tests + typecheck still pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (no behavior change; the barrel only re-exports). The root scripts `ingest`/`bootstrap:geometry` reference files by path, so `exports` does not affect them.

- [ ] **Step 4: Commit**

```bash
git add packages/ingestor/src/lib.ts packages/ingestor/package.json
git commit -m "feat(ingestor): expose worker-safe lib barrel via package exports"
```

---

## Task 3: Scaffold the `@pulse/poller` package

**Files:**
- Create: `packages/poller/package.json`
- Create: `packages/poller/tsconfig.json`
- Create: `packages/poller/src/bindings.ts`
- Modify: `tsconfig.json` (root)

- [ ] **Step 1: Create `packages/poller/package.json`**

```json
{
  "name": "@pulse/poller",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev --test-scheduled",
    "cf-typegen": "wrangler types"
  },
  "dependencies": {
    "@pulse/ingestor": "workspace:*",
    "@pulse/shared": "workspace:*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260602.1",
    "wrangler": "^4.96.0"
  }
}
```

- [ ] **Step 2: Create `packages/poller/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["@cloudflare/workers-types"]
  },
  "references": [{ "path": "../shared" }, { "path": "../ingestor" }],
  "include": ["src"]
}
```

- [ ] **Step 3: Create the binding interfaces `packages/poller/src/bindings.ts`**

```typescript
// Minimal structural surfaces of the Cloudflare bindings we use, so the
// orchestrator is testable with plain in-memory fakes (no Miniflare needed).
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface R2Like {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  TFL_APP_KEY: string;
  PULSE_KV: KVNamespace;
  PULSE_BUCKET: R2Bucket;
  SNAPSHOT_KEY?: string;
  SHARD_SIZE?: string;
  FETCH_BUDGET?: string;
  TFL_MODES?: string;
}
```

- [ ] **Step 4: Add the package to the root TypeScript project references**

Edit root `tsconfig.json` to:

```json
{
  "files": [],
  "references": [
    { "path": "packages/shared" },
    { "path": "packages/ingestor" },
    { "path": "packages/poller" }
  ]
}
```

- [ ] **Step 5: Install workspace deps**

Run: `pnpm install`
Expected: links `@pulse/poller` into the workspace; adds `@cloudflare/workers-types` + `wrangler` to the poller.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (empty package compiles; `bindings.ts` has no unresolved refs).

- [ ] **Step 7: Commit**

```bash
git add packages/poller/package.json packages/poller/tsconfig.json packages/poller/src/bindings.ts tsconfig.json pnpm-lock.yaml
git commit -m "chore(poller): scaffold @pulse/poller worker package"
```

---

## Task 4: Pure shard selection

**Files:**
- Create: `packages/poller/src/shard.ts`
- Test: `packages/poller/test/shard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/poller/test/shard.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { selectShard } from "../src/shard";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `S${String(i).padStart(3, "0")}`);

describe("selectShard", () => {
  it("splits into ceil(total/size) shards and returns the cursor's slice", () => {
    const items = ids(5);
    const r = selectShard(items, 0, 2);
    expect(r.shardCount).toBe(3); // ceil(5/2)
    expect(r.shard).toEqual(["S000", "S001"]);
  });

  it("wraps the cursor modulo shardCount", () => {
    const items = ids(5);
    expect(selectShard(items, 3, 2).shard).toEqual(["S000", "S001"]); // 3 % 3 == 0
    expect(selectShard(items, 4, 2).shard).toEqual(["S002", "S003"]); // 4 % 3 == 1
  });

  it("returns a short final shard", () => {
    expect(selectShard(ids(5), 2, 2).shard).toEqual(["S004"]);
  });

  it("handles an empty list without dividing by zero", () => {
    const r = selectShard<string>([], 0, 2);
    expect(r.shardCount).toBe(0);
    expect(r.shard).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- shard`
Expected: FAIL — `selectShard` not defined.

- [ ] **Step 3: Implement `selectShard`**

Create `packages/poller/src/shard.ts`:

```typescript
export interface ShardResult<T> {
  shard: T[];
  shardCount: number;
  cursor: number; // normalised cursor actually used
}

/** Deterministically slice `items` into shards of `size`; return shard `cursor mod count`. */
export function selectShard<T>(items: T[], cursor: number, size: number): ShardResult<T> {
  if (items.length === 0 || size <= 0) return { shard: [], shardCount: 0, cursor: 0 };
  const shardCount = Math.ceil(items.length / size);
  const normalised = ((cursor % shardCount) + shardCount) % shardCount;
  const start = normalised * size;
  return { shard: items.slice(start, start + size), shardCount, cursor: normalised };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- shard`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/poller/src/shard.ts packages/poller/test/shard.test.ts
git commit -m "feat(poller): deterministic shard selection"
```

---

## Task 5: Pure snapshot merge

Merges this tick's fresh shard values into the previous snapshot, so every station appears every tick (un-polled ones carry their last value, or null until first polled).

**Files:**
- Create: `packages/poller/src/merge.ts`
- Test: `packages/poller/test/merge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/poller/test/merge.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@pulse/shared";
import type { DomainStation, DomainLineStatus } from "@pulse/ingestor";
import { mergeStationInputs, linesInput, type FreshStation } from "../src/merge";

const station = (naptan: string): DomainStation => ({
  naptan, name: naptan, lat: 51.5, lon: -0.1, lines: ["x"],
});

const prevSnapshot = (): Snapshot => ({
  schemaVersion: 1,
  generatedAt: "2026-06-03T10:00:00.000Z",
  freshness: { statusAgeSec: 0, crowdingAgeSec: 0 },
  network: { crowdingAnomaly: null, disruptedLineCount: 0, verdict: "typical", headline: "", worstLines: [] },
  lines: [
    { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 5, statusDescription: "Minor Delays", statusLevel: "minor", disruptions: [{ category: "C", description: "D" }], crowdingAnomaly: null },
  ],
  stations: [
    { naptan: "A", name: "A", lat: 51.5, lon: -0.1, lines: ["x"], live: 0.9, typical: 0.5, anomaly: 1.8, anomalyBand: "much_busier", dataAvailable: true },
    { naptan: "B", name: "B", lat: 51.5, lon: -0.1, lines: ["x"], live: 0.4, typical: 0.5, anomaly: 0.8, anomalyBand: "normal", dataAvailable: true },
  ],
});

describe("mergeStationInputs", () => {
  it("uses fresh values for shard stations and previous values otherwise", () => {
    const all = [station("A"), station("B")];
    const fresh = new Map<string, FreshStation>([["A", { naptan: "A", live: 0.2, typical: 0.5 }]]);
    const out = mergeStationInputs(all, prevSnapshot(), fresh);
    expect(out.find((s) => s.naptan === "A")).toMatchObject({ live: 0.2, typical: 0.5 });
    expect(out.find((s) => s.naptan === "B")).toMatchObject({ live: 0.4, typical: 0.5 }); // from prev
  });

  it("includes never-seen stations with null live/typical", () => {
    const all = [station("A"), station("C")];
    const out = mergeStationInputs(all, prevSnapshot(), new Map());
    expect(out.find((s) => s.naptan === "C")).toMatchObject({ live: null, typical: null });
    expect(out).toHaveLength(2);
  });

  it("works with no previous snapshot (all from fresh or null)", () => {
    const all = [station("A")];
    const fresh = new Map<string, FreshStation>([["A", { naptan: "A", live: 0.3, typical: null }]]);
    const out = mergeStationInputs(all, null, fresh);
    expect(out[0]).toMatchObject({ naptan: "A", name: "A", lat: 51.5, lon: -0.1, live: 0.3, typical: null });
  });
});

describe("linesInput", () => {
  it("passes fresh line status straight through", () => {
    const fresh: DomainLineStatus[] = [
      { id: "v", name: "V", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
    ];
    expect(linesInput(fresh, null)).toEqual(fresh);
  });

  it("falls back to the previous snapshot's lines when fresh is empty", () => {
    const out = linesInput([], prevSnapshot());
    expect(out).toEqual([
      { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 5, statusDescription: "Minor Delays", disruptions: [{ category: "C", description: "D" }] },
    ]);
  });

  it("returns empty when fresh is empty and there is no previous", () => {
    expect(linesInput([], null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- merge`
Expected: FAIL — `mergeStationInputs`/`linesInput` not defined.

- [ ] **Step 3: Implement the merge**

Create `packages/poller/src/merge.ts`:

```typescript
import type { Snapshot } from "@pulse/shared";
import type { BuildStationInput, BuildLineInput, DomainStation, DomainLineStatus } from "@pulse/ingestor";

export interface FreshStation {
  naptan: string;
  live: number | null;
  typical: number | null;
}

/**
 * Produce a full BuildStationInput[] for every station in `all`: fresh crowding
 * for stations polled this tick, otherwise the previous snapshot's values, else
 * null. Station metadata (name/lat/lon/lines) always comes from `all` (the
 * authoritative, KV-cached station list) so newly added stations still appear.
 */
export function mergeStationInputs(
  all: DomainStation[],
  prev: Snapshot | null,
  fresh: Map<string, FreshStation>,
): BuildStationInput[] {
  const prevByNaptan = new Map((prev?.stations ?? []).map((s) => [s.naptan, s]));
  return all.map((st) => {
    const f = fresh.get(st.naptan);
    const p = prevByNaptan.get(st.naptan);
    const live = f ? f.live : (p?.live ?? null);
    const typical = f ? f.typical : (p?.typical ?? null);
    return { naptan: st.naptan, name: st.name, lat: st.lat, lon: st.lon, lines: st.lines, live, typical };
  });
}

/** Fresh line status if we have it, else the previous snapshot's lines, else none. */
export function linesInput(fresh: DomainLineStatus[], prev: Snapshot | null): BuildLineInput[] {
  if (fresh.length > 0) return fresh;
  return (prev?.lines ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    mode: l.mode,
    statusSeverity: l.statusSeverity,
    statusDescription: l.statusDescription,
    disruptions: l.disruptions,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- merge`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/poller/src/merge.ts packages/poller/test/merge.test.ts
git commit -m "feat(poller): pure snapshot merge for sharded updates"
```

---

## Task 6: KV typical-baseline cache

**Files:**
- Create: `packages/poller/src/baseline.ts`
- Test: `packages/poller/test/baseline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/poller/test/baseline.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { KvLike } from "../src/bindings";
import { readCachedTypical, cacheTypical, typicalKey } from "../src/baseline";

function fakeKv(seed: Record<string, string> = {}): KvLike & { store: Map<string, string>; ttls: Map<string, number> } {
  const store = new Map(Object.entries(seed));
  const ttls = new Map<string, number>();
  return {
    store,
    ttls,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string, o?: { expirationTtl?: number }) => {
      store.set(k, v);
      if (o?.expirationTtl) ttls.set(k, o.expirationTtl);
    }),
  };
}

describe("typicalKey", () => {
  it("namespaces by naptan and weekday", () => {
    expect(typicalKey("940GZZLUVIC", "Wed")).toBe("typical:940GZZLUVIC:Wed");
  });
});

describe("readCachedTypical", () => {
  it("returns null on a miss", async () => {
    expect(await readCachedTypical(fakeKv(), "X", "Wed")).toBeNull();
  });

  it("parses cached bands on a hit", async () => {
    const kv = fakeKv({ "typical:X:Wed": JSON.stringify({ "08:00": 0.7 }) });
    expect(await readCachedTypical(kv, "X", "Wed")).toEqual({ "08:00": 0.7 });
  });

  it("returns null (not throw) on corrupt JSON", async () => {
    const kv = fakeKv({ "typical:X:Wed": "{not json" });
    expect(await readCachedTypical(kv, "X", "Wed")).toBeNull();
  });
});

describe("cacheTypical", () => {
  it("writes JSON with the given TTL", async () => {
    const kv = fakeKv();
    await cacheTypical(kv, "X", "Wed", { "08:00": 0.7 }, 172800);
    expect(kv.store.get("typical:X:Wed")).toBe(JSON.stringify({ "08:00": 0.7 }));
    expect(kv.ttls.get("typical:X:Wed")).toBe(172800);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- baseline`
Expected: FAIL — module/exports not defined. (Note: the existing `packages/ingestor/test/baseline.test.ts` also matches `-- baseline`; that's fine — both run, the poller one fails.)

- [ ] **Step 3: Implement the cache**

Create `packages/poller/src/baseline.ts`:

```typescript
import type { TypicalBands } from "@pulse/ingestor";
import type { KvLike } from "./bindings";

export function typicalKey(naptan: string, weekday: string): string {
  return `typical:${naptan}:${weekday}`;
}

/** Read cached typical bands for (naptan, weekday); null on miss or corrupt value. */
export async function readCachedTypical(
  kv: KvLike,
  naptan: string,
  weekday: string,
): Promise<TypicalBands | null> {
  const raw = await kv.get(typicalKey(naptan, weekday));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TypicalBands;
  } catch {
    return null;
  }
}

/** Cache typical bands with an expiry (seconds). */
export async function cacheTypical(
  kv: KvLike,
  naptan: string,
  weekday: string,
  bands: TypicalBands,
  ttlSec: number,
): Promise<void> {
  await kv.put(typicalKey(naptan, weekday), JSON.stringify(bands), { expirationTtl: ttlSec });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- baseline`
Expected: PASS (the poller baseline tests + the existing ingestor baseline tests).

- [ ] **Step 5: Commit**

```bash
git add packages/poller/src/baseline.ts packages/poller/test/baseline.test.ts
git commit -m "feat(poller): KV typical-baseline cache"
```

---

## Task 7: The `runShardedCycle` orchestrator

**Files:**
- Create: `packages/poller/src/cycle.ts`
- Test: `packages/poller/test/cycle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/poller/test/cycle.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@pulse/shared";
import type { DomainStation, DomainLineStatus, DomainLive, TypicalBands } from "@pulse/ingestor";
import type { KvLike, R2Like } from "../src/bindings";
import { runShardedCycle, type CycleDeps } from "../src/cycle";

function fakeKv(): KvLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
  };
}

function fakeR2(): R2Like & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => (store.has(k) ? { text: async () => store.get(k)! } : null),
    put: async (k, v) => void store.set(k, v),
  };
}

const stationList: DomainStation[] = [
  { naptan: "A", name: "A", lat: 51.5, lon: -0.10, lines: ["victoria"] },
  { naptan: "B", name: "B", lat: 51.5, lon: -0.11, lines: ["victoria"] },
  { naptan: "C", name: "C", lat: 51.5, lon: -0.12, lines: ["victoria"] },
];

function makeDeps(kv: KvLike, r2: R2Like, overrides: Partial<CycleDeps> = {}): CycleDeps {
  return {
    now: () => new Date("2026-06-03T08:05:00Z"), // Wed 09:05 BST → band 09:00, weekday Wed
    shardSize: 2,
    fetchBudget: 50,
    typicalTtlSec: 172800,
    modes: ["tube"],
    fetchStations: vi.fn(async () => stationList),
    fetchLineStatus: vi.fn(async () => [
      { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
    ] satisfies DomainLineStatus[]),
    fetchLiveCrowding: vi.fn(async (naptan: string): Promise<DomainLive> => ({ dataAvailable: true, percentageOfBaseline: naptan === "A" ? 0.9 : 0.5 })),
    fetchTypical: vi.fn(async (): Promise<TypicalBands> => ({ "09:00": 0.5 })),
    kv,
    r2,
    snapshotKey: "snapshot.json",
    ...overrides,
  };
}

describe("runShardedCycle", () => {
  it("tick 1: caches stations, polls shard 0, writes all stations, advances cursor", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    const res = await runShardedCycle(makeDeps(kv, r2));

    expect(res.shardCount).toBe(2); // ceil(3/2)
    const snap = JSON.parse(r2.store.get("snapshot.json")!) as Snapshot;
    expect(snap.stations).toHaveLength(3); // ALL stations present from tick 1
    expect(snap.stations.find((s) => s.naptan === "A")!.live).toBe(0.9); // shard 0 polled
    expect(snap.stations.find((s) => s.naptan === "C")!.live).toBeNull(); // not yet polled
    expect(kv.store.get("meta:cursor")).toBe("1");
    expect(kv.store.has("meta:stations")).toBe(true);
  });

  it("tick 2: reuses cached stations, polls shard 1, keeps shard 0's previous values", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    await runShardedCycle(makeDeps(kv, r2)); // tick 1 -> cursor 1
    const deps2 = makeDeps(kv, r2);
    await runShardedCycle(deps2); // tick 2 -> shard [C]

    expect(deps2.fetchStations).not.toHaveBeenCalled(); // same London day -> cached
    const snap = JSON.parse(r2.store.get("snapshot.json")!) as Snapshot;
    expect(snap.stations.find((s) => s.naptan === "C")!.live).toBe(0.5); // now polled
    expect(snap.stations.find((s) => s.naptan === "A")!.live).toBe(0.9); // retained from tick 1
    expect(kv.store.get("meta:cursor")).toBe("0"); // wrapped (2 shards)
  });

  it("caches typical baselines so fetchTypical runs once per (naptan, weekday)", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    const deps = makeDeps(kv, r2);
    await runShardedCycle(deps); // shard 0 = [A, B]
    expect(deps.fetchTypical).toHaveBeenCalledTimes(2); // A and B missed -> fetched
    const deps2 = makeDeps(kv, r2);
    await runShardedCycle(deps2); // shard 1 = [C]
    expect(deps2.fetchTypical).toHaveBeenCalledTimes(1); // only C; A/B served from KV next time
  });

  it("never exceeds the fetch budget; extra baseline misses get null typical", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    let fetches = 0;
    const count = () => { fetches++; };
    const deps = makeDeps(kv, r2, {
      shardSize: 3, // poll all 3 in one tick
      fetchBudget: 4, // 1 status + 3 live = 4 -> zero budget left for baselines
      fetchLineStatus: vi.fn(async () => { count(); return []; }),
      fetchLiveCrowding: vi.fn(async (): Promise<DomainLive> => { count(); return { dataAvailable: true, percentageOfBaseline: 0.5 }; }),
      fetchTypical: vi.fn(async (): Promise<TypicalBands> => { count(); return { "09:00": 0.5 }; }),
    });
    const res = await runShardedCycle(deps);
    expect(fetches).toBeLessThanOrEqual(4);
    expect(deps.fetchTypical).not.toHaveBeenCalled();
    expect(res.snapshot.stations.every((s) => s.typical === null)).toBe(true);
  });

  it("keeps previous lines when the status fetch fails", async () => {
    const kv = fakeKv();
    const r2 = fakeR2();
    await runShardedCycle(makeDeps(kv, r2)); // seeds a snapshot with the victoria line
    const deps2 = makeDeps(kv, r2, { fetchLineStatus: vi.fn(async () => { throw new Error("status boom"); }) });
    const res = await runShardedCycle(deps2);
    expect(res.snapshot.lines.map((l) => l.id)).toContain("victoria");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- cycle`
Expected: FAIL — `runShardedCycle` not defined.

- [ ] **Step 3: Implement the orchestrator**

Create `packages/poller/src/cycle.ts`:

```typescript
import type { Snapshot } from "@pulse/shared";
import {
  buildSnapshot,
  londonBand,
  londonWeekday,
  londonDateKey,
  type DomainStation,
  type DomainLineStatus,
  type DomainLive,
  type TypicalBands,
} from "@pulse/ingestor";
import type { KvLike, R2Like } from "./bindings";
import { selectShard } from "./shard";
import { mergeStationInputs, linesInput, type FreshStation } from "./merge";
import { readCachedTypical, cacheTypical } from "./baseline";

const CURSOR_KEY = "meta:cursor";
const STATIONS_KEY = "meta:stations";

export interface CycleDeps {
  now: () => Date;
  shardSize: number;
  fetchBudget: number;
  typicalTtlSec: number;
  modes: string[];
  fetchStations: () => Promise<DomainStation[]>;
  fetchLineStatus: (modes: string[]) => Promise<DomainLineStatus[]>;
  fetchLiveCrowding: (naptan: string) => Promise<DomainLive>;
  fetchTypical: (naptan: string, weekday: string) => Promise<TypicalBands>;
  kv: KvLike;
  r2: R2Like;
  snapshotKey: string;
}

export interface CycleResult {
  snapshot: Snapshot;
  shardCount: number;
  cursor: number;
  fetchCount: number;
}

interface CachedStations {
  day: string;
  stations: DomainStation[];
}

/** Load the station list from KV, refreshing it (1 fetch) once per London day. */
async function loadStations(deps: CycleDeps, today: string): Promise<{ stations: DomainStation[]; fetched: boolean }> {
  const raw = await deps.kv.get(STATIONS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CachedStations;
      if (parsed.day === today && parsed.stations.length > 0) return { stations: parsed.stations, fetched: false };
    } catch {
      // fall through to refetch
    }
  }
  const stations = await deps.fetchStations();
  await deps.kv.put(STATIONS_KEY, JSON.stringify({ day: today, stations } satisfies CachedStations));
  return { stations, fetched: true };
}

async function readPrevSnapshot(deps: CycleDeps): Promise<Snapshot | null> {
  const obj = await deps.r2.get(deps.snapshotKey);
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text()) as Snapshot;
  } catch {
    return null;
  }
}

export async function runShardedCycle(deps: CycleDeps): Promise<CycleResult> {
  const now = deps.now();
  const weekday = londonWeekday(now);
  const band = londonBand(now);
  const today = londonDateKey(now);

  let fetchCount = 0;

  // 1. Station list (KV-cached, daily refresh). Sort for deterministic sharding.
  const { stations: allStations, fetched } = await loadStations(deps, today);
  if (fetched) fetchCount++;
  const sorted = [...allStations].sort((a, b) => a.naptan.localeCompare(b.naptan));

  // 2. Shard selection from the KV cursor.
  const cursor = Number((await deps.kv.get(CURSOR_KEY)) ?? "0") || 0;
  const { shard, shardCount, cursor: usedCursor } = selectShard(sorted, cursor, deps.shardSize);

  // 3. Line status (1 fetch); keep previous on failure.
  let freshLines: DomainLineStatus[] = [];
  if (fetchCount < deps.fetchBudget) {
    fetchCount++;
    freshLines = await deps.fetchLineStatus(deps.modes).catch(() => []);
  }

  // 4. Live crowding for the shard (1 fetch each, within budget).
  const fresh = new Map<string, FreshStation>();
  for (const st of shard) {
    if (fetchCount >= deps.fetchBudget) break;
    fetchCount++;
    let live: number | null = null;
    try {
      const res = await deps.fetchLiveCrowding(st.naptan);
      live = res.dataAvailable ? res.percentageOfBaseline : null;
    } catch {
      live = null;
    }
    fresh.set(st.naptan, { naptan: st.naptan, live, typical: null });
  }

  // 5. Typical baselines: KV hit is free; misses fetch within remaining budget.
  for (const st of shard) {
    const entry = fresh.get(st.naptan);
    if (!entry || entry.live === null) continue;
    const cached = await readCachedTypical(deps.kv, st.naptan, weekday);
    if (cached) {
      entry.typical = cached[band] ?? null;
      continue;
    }
    if (fetchCount >= deps.fetchBudget) continue; // out of budget -> warm later
    fetchCount++;
    const bands = await deps.fetchTypical(st.naptan, weekday).catch(() => null);
    if (bands) {
      await cacheTypical(deps.kv, st.naptan, weekday, bands, deps.typicalTtlSec);
      entry.typical = bands[band] ?? null;
    }
  }

  // 6. Merge into the previous snapshot and write back.
  const prev = await readPrevSnapshot(deps);
  const snapshot = buildSnapshot({
    now,
    statusFetchedAt: now,
    crowdingFetchedAt: now,
    lines: linesInput(freshLines, prev),
    stations: mergeStationInputs(sorted, prev, fresh),
  });

  await deps.r2.put(deps.snapshotKey, JSON.stringify(snapshot));
  await deps.kv.put(CURSOR_KEY, String(shardCount === 0 ? 0 : (usedCursor + 1) % shardCount));

  return { snapshot, shardCount, cursor: usedCursor, fetchCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- cycle`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (existing 77 tests + the new poller tests).

- [ ] **Step 6: Commit**

```bash
git add packages/poller/src/cycle.ts packages/poller/test/cycle.test.ts
git commit -m "feat(poller): sharded poll-cycle orchestrator"
```

---

## Task 8: The `scheduled()` Worker handler

**Files:**
- Create: `packages/poller/src/index.ts`

- [ ] **Step 1: Implement the handler (glue — adapts real bindings to the orchestrator)**

Create `packages/poller/src/index.ts`:

```typescript
import { TflClient, fetchStations, fetchLineStatus, fetchLiveCrowding, fetchTypical } from "@pulse/ingestor";
import type { Env, KvLike, R2Like } from "./bindings";
import { runShardedCycle } from "./cycle";

const DEFAULT_MODES = "tube,overground,elizabeth-line,dlr,tram";
const TYPICAL_TTL_SEC = 172_800; // 48h

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const client = new TflClient({ appKey: env.TFL_APP_KEY });

    // Adapters: present the real KV/R2 bindings through our minimal interfaces.
    const kv: KvLike = {
      get: (k) => env.PULSE_KV.get(k),
      put: (k, v, o) => env.PULSE_KV.put(k, v, o),
    };
    const r2: R2Like = {
      get: async (k) => {
        const obj = await env.PULSE_BUCKET.get(k);
        return obj ? { text: () => obj.text() } : null;
      },
      put: async (k, v) => {
        await env.PULSE_BUCKET.put(k, v, {
          httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=30" },
        });
      },
    };

    const res = await runShardedCycle({
      now: () => new Date(),
      shardSize: Number(env.SHARD_SIZE ?? "40") || 40,
      fetchBudget: Number(env.FETCH_BUDGET ?? "50") || 50,
      typicalTtlSec: TYPICAL_TTL_SEC,
      modes: (env.TFL_MODES ?? DEFAULT_MODES).split(",").map((m) => m.trim()),
      fetchStations: () => fetchStations(client),
      fetchLineStatus: (modes) => fetchLineStatus(client, modes),
      fetchLiveCrowding: (naptan) => fetchLiveCrowding(client, naptan),
      fetchTypical: (naptan, weekday) => fetchTypical(client, naptan, weekday),
      kv,
      r2,
      snapshotKey: env.SNAPSHOT_KEY ?? "snapshot.json",
    });

    console.log(
      `tick: shard ${res.cursor + 1}/${res.shardCount}, ${res.fetchCount} fetches, ` +
        `${res.snapshot.stations.length} stations, verdict=${res.snapshot.network.verdict}`,
    );
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (`ScheduledEvent`/`ExecutionContext`/`KVNamespace`/`R2Bucket` come from `@cloudflare/workers-types` via the poller tsconfig `types`.)

- [ ] **Step 3: Commit**

```bash
git add packages/poller/src/index.ts
git commit -m "feat(poller): scheduled() handler wiring bindings to the cycle"
```

---

## Task 9: Wrangler config + Cloudflare resources + deploy

**Files:**
- Create: `packages/poller/wrangler.jsonc`

- [ ] **Step 1: Create the KV namespace** (records the id you paste into wrangler.jsonc)

Run: `pnpm --filter @pulse/poller exec wrangler kv namespace create PULSE_KV`
Expected: prints an `id` (a 32-char hex). Copy it.

- [ ] **Step 2: Look up the existing R2 bucket name**

Run: `pnpm --filter @pulse/poller exec wrangler r2 bucket list`
Expected: lists buckets; note the one currently serving `snapshot.json` (the bucket behind `pub-65d41e5468344746919009655cb3a516.r2.dev`). Use that exact `bucket_name`.

- [ ] **Step 2a: STOP — report to the human and get the two values**

The KV id (Step 1) and bucket name (Step 2) are account-specific. If you are a subagent, return these to the operator and request confirmation of the bucket name before writing the config. Do not invent values.

- [ ] **Step 3: Create `packages/poller/wrangler.jsonc`** (replace the two placeholders with the real values from Steps 1–2)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "pulse-poller",
  "main": "./src/index.ts",
  "compatibility_date": "2026-05-01",
  "compatibility_flags": ["nodejs_compat"],
  "triggers": { "crons": ["* * * * *"] },
  "kv_namespaces": [{ "binding": "PULSE_KV", "id": "PASTE_KV_ID_FROM_STEP_1" }],
  "r2_buckets": [{ "binding": "PULSE_BUCKET", "bucket_name": "PASTE_BUCKET_NAME_FROM_STEP_2" }],
  "vars": { "SHARD_SIZE": "40", "FETCH_BUDGET": "50" },
  "observability": { "enabled": true }
}
```

- [ ] **Step 4: Set the TfL secret**

Run: `pnpm --filter @pulse/poller exec wrangler secret put TFL_APP_KEY`
Paste the TfL app key when prompted (from the existing GitHub Actions secret / `.env`). Expected: "Success! Uploaded secret TFL_APP_KEY".

- [ ] **Step 5: Smoke-test locally against a test trigger** (uses real TfL + a local KV/R2 simulation)

Run: `pnpm --filter @pulse/poller exec wrangler dev --test-scheduled`
Then in a second terminal: `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`
Expected: the worker logs a `tick: shard 1/7, …` line with a non-zero station count and `fetchCount` ≤ 50. Stop with Ctrl-C.

- [ ] **Step 6: Deploy**

Run: `pnpm --filter @pulse/poller exec wrangler deploy`
Expected: deploy succeeds and prints the cron trigger `* * * * *` registered.

- [ ] **Step 7: Verify live after ~10 minutes**

Run: `pnpm --filter @pulse/poller exec wrangler tail`
Expected: a `tick:` log roughly every minute. Separately, `curl -s https://pub-65d41e5468344746919009655cb3a516.r2.dev/snapshot.json | head -c 200` should show a `generatedAt` within the last minute or two, and after ~7 minutes all stations should have non-null `live` where TfL has data.

- [ ] **Step 8: Commit**

```bash
git add packages/poller/wrangler.jsonc
git commit -m "feat(poller): wrangler cron config + bindings"
```

---

## Task 10: Decommission the GitHub Actions schedule

**Files:**
- Modify: `.github/workflows/poll.yml`

- [ ] **Step 1: Remove the `schedule:` trigger, keep `workflow_dispatch`**

Edit `.github/workflows/poll.yml` — replace the `on:` block's trigger section so it reads:

```yaml
on:
  # Scheduled polling moved to the Cloudflare Cron Worker (@pulse/poller), which
  # honours minute-level schedules (GitHub throttled */10 to ~90 min). Kept as a
  # manual fallback / for re-bootstrapping the station list + geometry.
  workflow_dispatch: {}
```

Leave the job steps unchanged. (Do not delete the file — the manual trigger and its secrets remain a useful break-glass path.)

- [ ] **Step 2: Verify no other `schedule:` / `cron:` remains in the file**

Run: `grep -nE "schedule:|cron:" .github/workflows/poll.yml`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/poll.yml
git commit -m "chore(ci): disable GH Actions schedule (poller now on Cloudflare cron)"
```

---

## Task 11: Docs + final verification

**Files:**
- Modify: `README.md` (root) and/or `packages/ingestor/README.md` (whichever documents the data pipeline)

- [ ] **Step 1: Document the new data source**

In the root `README.md` data-pipeline section, replace any "GitHub Actions cron every N minutes" description with:

```markdown
**Live data:** the `@pulse/poller` Cloudflare Cron Worker runs every minute,
polling TfL in ~40-station shards (KV cursor + KV-cached typical baselines) and
merging each shard into `snapshot.json` in R2. The snapshot's `generatedAt` stays
under a minute old; each station refreshes ~every 7 minutes. The legacy
`@pulse/ingestor` Node entrypoint (`pnpm ingest`) remains for local/manual runs,
and `.github/workflows/poll.yml` is a manual `workflow_dispatch` fallback.
```

(If the root README has no such section, add this under a `## Data pipeline` heading.)

- [ ] **Step 2: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Confirm the live banner cleared**

Open `https://pulse-of-london.akmal-a-khadir.workers.dev` and confirm the "Updated …" label reads under a couple of minutes and the amber "Data may be out of date" banner is gone.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: poller is now the live data source"
```

---

## Self-Review Notes (for the implementer)

- **TfL fair use:** steady state ≈ 1 (status) + ~40 (live) + ≤8 (baseline) ≈ 49 calls/minute, far under 500/min/feed.
- **Schema unchanged:** `buildSnapshot` still emits `SCHEMA_VERSION = 1`; the web client's version check and `/api/snapshot` proxy are untouched — no web redeploy required for this plan.
- **Cold start:** on the very first ticks many baselines miss; the budget cap means some stations carry `typical: null` (anomaly `unknown`) until warmed over ~the first hour. This is expected and the UI already handles `unknown`.
- **`now` injection:** `runShardedCycle` takes `now()` so tests are deterministic; the handler passes `() => new Date()`.
