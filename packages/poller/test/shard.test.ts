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
