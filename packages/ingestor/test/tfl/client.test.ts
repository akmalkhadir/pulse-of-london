import { describe, expect, it, vi } from "vitest";
import { TflClient } from "../../src/tfl/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("TflClient", () => {
  it("appends app_key and base URL, parses JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new TflClient({ appKey: "secret", fetchFn });
    const data = await client.getJson<{ ok: boolean }>("/Line/victoria/Status");
    expect(data.ok).toBe(true);
    const url = fetchFn.mock.calls[0]![0] as string;
    expect(url).toBe("https://api.tfl.gov.uk/Line/victoria/Status?app_key=secret");
  });

  it("retries once on a 5xx then succeeds", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    const client = new TflClient({ appKey: "k", fetchFn, retries: 1, retryDelayMs: 0 });
    await expect(client.getJson("/x")).resolves.toEqual({ ok: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on a 4xx (no retry)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ msg: "bad" }, 404));
    const client = new TflClient({ appKey: "k", fetchFn, retries: 2, retryDelayMs: 0 });
    await expect(client.getJson("/x")).rejects.toThrow(/404/);
    expect(fetchFn).toHaveBeenCalledTimes(1); // 4xx is not retried
  });
});
