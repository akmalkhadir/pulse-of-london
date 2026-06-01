export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface Config {
  tflAppKey: string;
  r2: R2Config;
  snapshotKey: string;
  historyPrefix: string;
  modes: string[];
}

const DEFAULT_MODES = ["tube", "overground", "elizabeth-line", "dlr", "tram"];

export function loadConfig(env: Record<string, string | undefined>): Config {
  const missing: string[] = [];
  const req = (name: string): string => {
    const v = env[name];
    if (!v) missing.push(name);
    return v ?? "";
  };

  const tflAppKey = req("TFL_APP_KEY");
  const accountId = req("R2_ACCOUNT_ID");
  const accessKeyId = req("R2_ACCESS_KEY_ID");
  const secretAccessKey = req("R2_SECRET_ACCESS_KEY");
  const bucket = req("R2_BUCKET");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    tflAppKey,
    r2: { accountId, accessKeyId, secretAccessKey, bucket },
    snapshotKey: env.SNAPSHOT_KEY ?? "snapshot.json",
    historyPrefix: env.HISTORY_PREFIX ?? "history",
    modes: (env.TFL_MODES ?? DEFAULT_MODES.join(",")).split(",").map((m) => m.trim()),
  };
}
