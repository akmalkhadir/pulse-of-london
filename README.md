# Pulse of London

Real-time London transport crowding and status dashboard.

## Data pipeline

**Live data:** the `@pulse/poller` Cloudflare Cron Worker runs every minute
(05:00–20:59 UTC), polling TfL in 30-station shards and merging each shard into
`snapshot.json` in R2. The shard is picked from the run index (the cron's
scheduled minute ÷ `TICK_MINUTES`; round-robin, no stored cursor), so if you
slow the cron, set `TICK_MINUTES` in `wrangler.jsonc` to match or shards get
skipped. Typical baselines are KV-cached. The snapshot's
`generatedAt` stays under a minute old; each station refreshes ~every 9 minutes.
The legacy `@pulse/ingestor` Node entrypoint (`pnpm ingest`) remains for
local/manual runs, and `.github/workflows/poll.yml` is a manual
`workflow_dispatch` fallback.

### Free-tier budget (poller)

Sized to stay well inside the Workers Free plan (limits reset 00:00 UTC):

| Resource | Usage | Free limit |
|---|---|---|
| Cron invocations | 960/day (16 h × 60) | 100,000 requests/day (shared with the web Worker) |
| KV reads | ≈ 31/tick (station list + ≤30 baselines) ≈ 30k/day | 100,000/day |
| KV writes | ≤ ~255/day (≈254 baseline misses on each weekday's first pass + 1 station list) | 1,000/day |
| Subrequests | 1 line status + ≤30 live + baseline misses, capped by `FETCH_BUDGET=50` | 50/invocation |
| R2 | 960 PUTs + 960 GETs/day | 1M Class A, 10M Class B per month |

CPU (10 ms/invocation on Free) levers: all per-tick I/O runs concurrently (waiting
isn't CPU); line status is fetched without `detail=true` (~19 KB vs ~310 KB to
parse); the London-time `Intl.DateTimeFormat`s are built once per isolate. KV
cache writes are best-effort: if the write limit is ever hit, the tick still
writes the snapshot.
