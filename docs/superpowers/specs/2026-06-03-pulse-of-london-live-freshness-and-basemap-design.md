# Pulse of London — Live Freshness & Self-Hosted Basemap (Design)

**Date:** 2026-06-03
**Status:** Approved (pending implementation plans)
**Supersedes/extends:** [2026-05-30 Pulse of London design](./2026-05-30-pulse-of-london-design.md)

## Problem

Two issues surfaced once the site went live:

1. **Stale data.** The poller runs as a GitHub Actions cron requesting `*/10` (every 10 min), but GitHub throttles scheduled workflows on shared runners — actual firings are ~60–90 min apart. Every run *succeeds*; GitHub simply won't run it that often. The snapshot is routinely ~1 hr old, and the UI honestly shows "Updated 1 hr ago" + the "Data may be out of date" banner. A map sold as "live" is effectively hourly.

2. **Bare map.** `MapView` uses an empty MapLibre style (`sources: {}`, a single `#0b1120` background layer) and draws only the TfL line/station geometry on top. There is no basemap — no streets, river, or labels — so even in a real browser it reads as a dark rectangle with thin coloured lines and no geographic orientation.

## Goals

- Snapshot `generatedAt` consistently <1 min old; per-station crowding ≤ ~7 min old.
- Keep full ~254-station coverage.
- Stay $0 and on the existing Cloudflare stack.
- Give the map real geographic context (streets, Thames, labels) from a **self-hosted** basemap — no API key, no third-party tile ToS.
- Preserve TfL fair-use compliance (500 calls/min/feed) and OSM/Protomaps attribution.

## Non-goals

- Per-station age in the snapshot schema (possible later refinement; would bump `SCHEMA_VERSION` + coordinated web redeploy). Max staleness of ~7 min doesn't warrant it now.
- A schematic ("Beck diagram") tube-map layout — the data is geographic.
- Reworking the web Worker's data read path (it keeps polling `/api/snapshot`).

---

## Part 1 — Live data: sharded Cloudflare Cron Worker

### Decisions

- **New package `packages/poller`** — a Worker, separate from the RR7 web app, so the two deploy and fail independently.
- Reuse the platform-agnostic logic already in `@pulse/ingestor` (`tfl/fetchers`, `builder`, `anomaly`, the baseline math) and `@pulse/shared`. Replace only the Node-only pieces: `index.ts`'s `main()` and `writer.ts`'s AWS-SDK `S3Client` give way to a `scheduled()` handler wired to Cloudflare bindings (R2 `.put()`/`.get()`).
- **Bindings & secrets:** R2 bucket binding (the *same* bucket serving `snapshot.json` today); one KV namespace (typical baselines + shard cursor + cached station list); `TFL_APP_KEY` as a Worker secret.
- **Cron trigger:** `* * * * *` (every minute).

### The constraint that shapes the design

A full poll makes ~254 live-crowding `fetch()` calls (one per tube station; no batch endpoint). Cloudflare Workers cap outbound `fetch()` subrequests at **50/invocation on the free plan**. Crucially, **R2/KV binding reads/writes do NOT count** against that cap — only `fetch()` does. So we shard the live calls across ticks and keep all snapshot/baseline state in bindings.

### Per-tick algorithm (≤50 `fetch` budget)

1. **Station list** — load from KV; refreshed from TfL (`/StopPoint/Mode/tube`, filtered to `940GZZLU…`) once/day. 0 fetches on a hit.
2. **Shard select** — read the shard cursor from KV; pick shard *c* of *N*. With ~40 stations/shard, *N* = `ceil(254/40)` = 7 shards.
3. **Line status** — 1 fetch (`/Line/Mode/{modes}/Status`) every tick, so status is ≤1 min fresh.
4. **Live crowding** — fetch the shard's ~40 stations (`/crowding/{naptan}/Live`), ≤40 fetches.
5. **Typical baselines** — look up each shard station's baseline in KV (key `typical:{naptan}:{weekday}`, value = the day's bands, TTL ~48 h). For misses, fetch `/crowding/{naptan}/{dayOfWeek}` up to the *remaining* budget (≈ `50 − 1 − shardSize` ≈ 8/tick) and cache. Un-warmed stations carry live-only (null anomaly) until warmed; baselines fully warm for a given weekday within ~1 hr.
6. **Merge & write** — read the last snapshot from R2 (binding read), replace this shard's stations with the recomputed ones, apply the fresh line status, recompute the network verdict over the merged station set, stamp `generatedAt = now`, write back to R2 (binding `.put`, `Cache-Control: public, max-age=30`). Advance cursor to `(c+1) mod N` in KV.

### Outcome

- `generatedAt` always <1 min old → the staleness banner clears under normal operation.
- Each station refreshes ~every 7 min — within TfL's ~5-min crowding cadence; acceptable for a "busier/quieter than usual" read.
- Full 254-station coverage retained; $0; entirely on Cloudflare.
- ~41 TfL calls/min steady-state — far under the 500/min fair-use limit.

### Schema

Unchanged (`SCHEMA_VERSION = 1`). The web client's `schemaVersion` check still passes; no coordinated redeploy needed. The merge keeps the existing `Snapshot` shape; `generatedAt` is the only freshness signal the UI uses.

### Decommission GitHub Actions

Disable the scheduled trigger in `.github/workflows/poll.yml`, retaining `workflow_dispatch` as a manual fallback (and a way to re-bootstrap the station list / geometry). TfL + R2 secrets move to Worker secrets; the R2 access-key/secret pair is replaced by the bucket binding.

### Testing

- The orchestrator stays dependency-injected (as `runPollCycle` is today), so **shard selection, baseline KV cache, per-tick fetch-budget allocation, and snapshot merge** are unit-tested with in-memory fakes (TDD, Vitest).
- A Miniflare / `@cloudflare/vitest-pool-workers` test drives the `scheduled()` handler against fake KV + R2 bindings and asserts: cursor advances, only the shard's stations change, `generatedAt` updates, fetch count ≤ 50.
- Existing `@pulse/shared` and ingestor unit tests remain green (logic is reused, not rewritten).

### Risks / mitigations

- **Cold-start baseline storm** (all shard stations miss baseline at once → live+typical could exceed 50): mitigated by capping baseline fetches to the leftover budget per tick and warming gradually. Shard size (~40) leaves ~8 baseline slots/tick.
- **Free-plan CPU/limits on `scheduled`:** work is I/O-bound (mostly `fetch` await), so CPU stays low; binding ops are cheap. If the per-invocation wall-clock is ever tight, reduce shard size.
- **Cron minute-granularity drift:** Cloudflare cron is reliable to the minute but not real-time; ~7-min station refresh has margin.

---

## Part 2 — Map: self-hosted Protomaps basemap

### Decisions

- **Generate a Greater London PMTiles extract once:** Geofabrik Greater London `.osm.pbf` → Planetiler → `london.pmtiles`, via a one-off bootstrap script alongside the existing `bootstrap-geometry`. Upload to the **same R2 bucket** at `basemap/london.pmtiles`.
- **Serve via HTTP range requests:** the browser uses the `pmtiles` JS library + MapLibre `maplibregl.addProtocol("pmtiles", …)`, reading the single `.pmtiles` directly from its R2 public URL. Only viewport tiles are fetched; R2 egress is free; no API key; no third-party tile ToS.

### Rendering changes (client-only, in `MapView`)

- Replace the empty style with a **dark Protomaps theme** (`@protomaps/basemaps` dark style flavor) whose vector source points at the pmtiles `tiles://` source.
- Keep the existing TfL `lines` and `stations` layers drawn on top; tune line casing/width and circle styling so status colours pop against the basemap.
- `pmtiles` and the theme load through the same dynamic `import()` path as MapLibre (client-only) — no SSR impact; `public/data/geometry.geojson` is unchanged.
- Map init currently sets `attributionControl: false`; we restore attribution (see below).

### Attribution (ToS-critical)

The basemap is OSM-derived (ODbL), so the UI must display **"© OpenStreetMap contributors"** and a Protomaps credit, alongside the existing TfL notice. Add these to `AttributionFooter` (and/or a compact MapLibre attribution control). This sits beside the existing "Unofficial — not affiliated with TfL" notice (TfL ToS §12).

### Testing

- WebGL doesn't paint in headless Chromium, so the e2e keeps asserting the DOM/list. Add a unit/integration check that the pmtiles protocol registers and the basemap source is added (mock the range fetch), keeping the existing fixture-based e2e assertions green.

### Risks / mitigations

- **Extract size:** a Greater London build is modest (tens of MB); range requests mean only viewport tiles transfer. If too large, tighten the bbox or max zoom.
- **Bundle weight:** `pmtiles` + theme are client-only and dynamically imported, so they don't affect SSR or first byte.

---

## Implementation plans

This single design yields **two independent implementation plans**, each shippable on its own:

1. **Poller migration** — `packages/poller` Worker, sharded `scheduled()` orchestrator, KV/R2 bindings, GitHub Actions decommission.
2. **Self-hosted basemap** — PMTiles bootstrap + R2 upload, `MapView` Protomaps integration, attribution.

Both are created via the writing-plans skill after this spec is approved.
