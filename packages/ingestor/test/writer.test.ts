import { describe, expect, it, vi } from "vitest";
import { writeSnapshot, makeR2Client } from "../src/writer";
import type { Snapshot } from "@pulse/shared";

const snap = { schemaVersion: 1, generatedAt: "t", freshness: { statusAgeSec: 0, crowdingAgeSec: 0 }, network: { crowdingAnomaly: null, disruptedLineCount: 0, verdict: "typical", headline: "h", worstLines: [] }, lines: [], stations: [] } as unknown as Snapshot;

describe("writeSnapshot", () => {
  it("puts JSON with content-type and a short cache header", async () => {
    const send = vi.fn().mockResolvedValue({});
    await writeSnapshot({ send } as never, "bucket", "snapshot.json", snap);
    const cmd = send.mock.calls[0]![0];
    expect(cmd.input.Bucket).toBe("bucket");
    expect(cmd.input.Key).toBe("snapshot.json");
    expect(cmd.input.ContentType).toBe("application/json");
    expect(cmd.input.CacheControl).toMatch(/max-age=/);
    expect(JSON.parse(cmd.input.Body as string).generatedAt).toBe("t");
  });

  it("makeR2Client builds an S3 client pointed at the R2 endpoint", () => {
    const client = makeR2Client({ accountId: "acct", accessKeyId: "id", secretAccessKey: "s", bucket: "b" });
    expect(client).toBeDefined();
  });
});
