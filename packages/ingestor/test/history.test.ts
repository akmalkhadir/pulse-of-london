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
