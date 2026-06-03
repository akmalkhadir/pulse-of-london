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
