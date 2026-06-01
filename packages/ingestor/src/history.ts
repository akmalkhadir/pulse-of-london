import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { Snapshot } from "@pulse/shared";
import type { S3Like } from "./writer";

function utcKeyParts(d: Date): { date: string; time: string } {
  const iso = d.toISOString(); // 2026-05-30T17:10:00.000Z
  const date = iso.slice(0, 10);
  const time = `${iso.slice(11, 13)}-${iso.slice(14, 16)}`;
  return { date, time };
}

/** Append-free history: one small object per cycle, seeds the future status-anomaly. */
export async function logSnapshot(
  client: S3Like,
  bucket: string,
  prefix: string,
  snapshot: Snapshot,
  now: Date,
): Promise<void> {
  const { date, time } = utcKeyParts(now);
  const body = {
    generatedAt: snapshot.generatedAt,
    crowdingAnomaly: snapshot.network.crowdingAnomaly,
    disruptedLineCount: snapshot.network.disruptedLineCount,
    verdict: snapshot.network.verdict,
    worstLines: snapshot.network.worstLines,
  };
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}/${date}/${time}.json`,
      Body: JSON.stringify(body),
      ContentType: "application/json",
    }),
  );
}
