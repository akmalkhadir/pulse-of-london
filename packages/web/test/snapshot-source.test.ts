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
