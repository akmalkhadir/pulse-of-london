import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const base = {
  TFL_APP_KEY: "k",
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "id",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
};

describe("loadConfig", () => {
  it("reads required vars and applies defaults", () => {
    const cfg = loadConfig(base);
    expect(cfg.tflAppKey).toBe("k");
    expect(cfg.r2.bucket).toBe("bucket");
    expect(cfg.snapshotKey).toBe("snapshot.json");
    expect(cfg.modes).toEqual(["tube", "overground", "elizabeth-line", "dlr", "tram"]);
  });

  it("overrides modes and snapshot key from env", () => {
    const cfg = loadConfig({ ...base, TFL_MODES: "tube,dlr", SNAPSHOT_KEY: "pulse/s.json" });
    expect(cfg.modes).toEqual(["tube", "dlr"]);
    expect(cfg.snapshotKey).toBe("pulse/s.json");
  });

  it("throws listing every missing required var", () => {
    expect(() => loadConfig({})).toThrowError(/TFL_APP_KEY.*R2_ACCOUNT_ID/s);
  });
});
