import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Snapshot } from "@pulse/shared";
import type { R2Config } from "./config";

/** Minimal surface we use, so tests can inject a fake (type-safe: derived from S3Client). */
export type S3Like = Pick<S3Client, "send">;

export function makeR2Client(r2: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
  });
}

export async function writeSnapshot(
  client: S3Like,
  bucket: string,
  key: string,
  snapshot: Snapshot,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(snapshot),
      ContentType: "application/json",
      // Short edge cache; the loader (Plan 2) layers its own Caches API TTL.
      CacheControl: "public, max-age=30",
    }),
  );
}
