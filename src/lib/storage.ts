import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const globalForS3 = globalThis as unknown as {
  s3Client?: S3Client | null;
};

function getS3Client(): S3Client | null {
  if (globalForS3.s3Client !== undefined) {
    return globalForS3.s3Client;
  }

  const endpoint = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    globalForS3.s3Client = null;
    return null;
  }

  globalForS3.s3Client = new S3Client({
    region: process.env.S3_REGION?.trim() || "auto",
    endpoint,
    forcePathStyle: false,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return globalForS3.s3Client;
}

/**
 * Uploads the processed 64x64 and 512x512 sprites to Railway's S3-compatible Bucket
 * if configured, returning the public CDN URL; otherwise falls back seamlessly to
 * our immutable `/api/sprites/[tid]` route backed by PostgreSQL.
 */
export async function storeSpriteAssets(
  thingTid: string,
  sprite64Png: Buffer,
  sprite512Png: Buffer
): Promise<string> {
  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET?.trim();
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");

  if (s3 && bucket) {
    try {
      await Promise.all([
        s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `sprites/${thingTid}-64.png`,
            Body: sprite64Png,
            ContentType: "image/png",
            CacheControl: "public, max-age=31536000, immutable",
          })
        ),
        s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `sprites/${thingTid}-512.png`,
            Body: sprite512Png,
            ContentType: "image/png",
            CacheControl: "public, max-age=31536000, immutable",
          })
        ),
      ]);

      if (publicBase) {
        return `${publicBase}/sprites/${thingTid}-512.png`;
      }
    } catch (err) {
      console.warn("[storage] S3 upload warning, falling back to /api/sprites:", err);
    }
  }

  return `/api/sprites/${thingTid}`;
}
