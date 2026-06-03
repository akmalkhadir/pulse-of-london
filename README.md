# Pulse of London

Real-time London transport crowding and status dashboard.

## Data pipeline

**Live data:** the `@pulse/poller` Cloudflare Cron Worker runs every minute,
polling TfL in ~40-station shards (KV cursor + KV-cached typical baselines) and
merging each shard into `snapshot.json` in R2. The snapshot's `generatedAt` stays
under a minute old; each station refreshes ~every 7 minutes. The legacy
`@pulse/ingestor` Node entrypoint (`pnpm ingest`) remains for local/manual runs,
and `.github/workflows/poll.yml` is a manual `workflow_dispatch` fallback.
