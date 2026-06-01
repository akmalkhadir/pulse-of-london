import { describe, expect, it, vi } from "vitest";
import { runPollCycle, type Deps } from "../src/run";

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    now: () => new Date("2026-05-30T17:10:00Z"),
    fetchLineStatus: vi.fn(async () => [
      { id: "victoria", name: "Victoria", mode: "tube", statusSeverity: 10, statusDescription: "Good Service", disruptions: [] },
    ]),
    fetchStations: vi.fn(async () => [
      { naptan: "VIC", name: "Victoria", lat: 51.49, lon: -0.14, lines: ["victoria"] },
      { naptan: "OXC", name: "Oxford Circus", lat: 51.51, lon: -0.14, lines: ["victoria"] },
    ]),
    fetchLiveCrowding: vi.fn(async (naptan: string) =>
      naptan === "VIC"
        ? { dataAvailable: true, percentageOfBaseline: 0.62 }
        : { dataAvailable: false, percentageOfBaseline: null },
    ),
    typicalFor: vi.fn(async () => 0.48),
    writeSnapshot: vi.fn(async () => {}),
    logSnapshot: vi.fn(async () => {}),
    modes: ["tube"],
    ...overrides,
  };
}

describe("runPollCycle", () => {
  it("fetches, builds, writes, and logs a snapshot", async () => {
    const deps = makeDeps();
    const snap = await runPollCycle(deps);
    expect(deps.writeSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.logSnapshot).toHaveBeenCalledTimes(1);
    expect(snap.stations).toHaveLength(2);
    const vic = snap.stations.find((s) => s.naptan === "VIC")!;
    expect(vic.anomalyBand).toBe("busier");
  });

  it("isolates a single station's crowding failure (marks it unknown, still ships)", async () => {
    const deps = makeDeps({
      fetchLiveCrowding: vi.fn(async (naptan: string) => {
        if (naptan === "OXC") throw new Error("station boom");
        return { dataAvailable: true, percentageOfBaseline: 0.62 };
      }),
    });
    const snap = await runPollCycle(deps);
    const oxc = snap.stations.find((s) => s.naptan === "OXC")!;
    expect(oxc.dataAvailable).toBe(false);
    expect(oxc.anomalyBand).toBe("unknown");
    expect(deps.writeSnapshot).toHaveBeenCalledTimes(1); // cycle still ships
  });

  it("still ships a snapshot (stations only) if status fetch fails", async () => {
    const deps = makeDeps({
      fetchLineStatus: vi.fn(async () => {
        throw new Error("status boom");
      }),
    });
    const snap = await runPollCycle(deps);
    expect(snap.lines).toEqual([]);
    expect(deps.writeSnapshot).toHaveBeenCalledTimes(1);
  });
});
