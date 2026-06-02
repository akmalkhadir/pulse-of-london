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
