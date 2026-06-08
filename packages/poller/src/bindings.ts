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
