import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TflClient } from "../../src/tfl/client";
import {
  fetchLineStatus,
  fetchLiveCrowding,
  fetchTypical,
  fetchStations,
} from "../../src/tfl/fetchers";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFile(join(here, "..", "fixtures", name), "utf8");

function clientReturning(body: string): TflClient {
  const fetchFn = vi.fn(async () =>
    new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
  );
  return new TflClient({ appKey: "k", fetchFn });
}

describe("fetchers", () => {
  it("parses line status into domain lines (worst lineStatus wins)", async () => {
    const client = clientReturning(await fixture("status.json"));
    const lines = await fetchLineStatus(client, ["tube"]);
    const central = lines.find((l) => l.id === "central")!;
    expect(central.statusSeverity).toBe(6);
    expect(central.statusDescription).toBe("Severe Delays");
    expect(central.disruptions).toEqual([
      { category: "RealTime", description: "Severe delays due to a signal failure at Liverpool Street." },
    ]);
    const victoria = lines.find((l) => l.id === "victoria")!;
    expect(victoria.disruptions).toEqual([]);
  });

  it("parses live crowding", async () => {
    const client = clientReturning(await fixture("crowding-live.json"));
    const live = await fetchLiveCrowding(client, "940GZZLUVIC");
    expect(live).toEqual({ dataAvailable: true, percentageOfBaseline: 0.62 });
  });

  it("parses unavailable live crowding to null value", async () => {
    const client = clientReturning(await fixture("crowding-live-unavailable.json"));
    const live = await fetchLiveCrowding(client, "940GZZLUVIC");
    expect(live).toEqual({ dataAvailable: false, percentageOfBaseline: null });
  });

  it("parses typical bands keyed by 'HH:MM' (handles percentageOfBaseLine casing)", async () => {
    const client = clientReturning(await fixture("crowding-typical.json"));
    const bands = await fetchTypical(client, "940GZZLUVIC", "Sat");
    expect(bands["18:00"]).toBe(0.48);
    expect(bands["18:15"]).toBe(0.51);
  });

  it("parses stations with coords and line ids", async () => {
    const client = clientReturning(await fixture("stoppoints-tube.json"));
    const stations = await fetchStations(client);
    expect(stations[0]).toEqual({
      naptan: "940GZZLUVIC",
      name: "Victoria",
      lat: 51.496359,
      lon: -0.143686,
      lines: ["circle", "district", "victoria"],
    });
  });
});
