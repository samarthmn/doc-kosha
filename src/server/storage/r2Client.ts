import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/lib/env";

let cachedClient: S3Client | null = null;

/**
 * Get a singleton S3Client configured for Cloudflare R2 (or MinIO in local dev).
 * Uses forcePathStyle for MinIO compatibility.
 */
export const getR2Client = (): S3Client => {
  if (cachedClient) return cachedClient;

  cachedClient = new S3Client({
    endpoint: serverEnv.R2_ENDPOINT,
    region: serverEnv.R2_REGION,
    credentials: {
      accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
      secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
    },
    // Required for MinIO and recommended for R2
    forcePathStyle: true,
    // Cloudflare R2 rejects the flexible checksum query params the AWS SDK adds
    // by default to presigned PUT URLs (e.g. `x-amz-checksum-crc32`).
    requestChecksumCalculation: "WHEN_REQUIRED",
  });

  return cachedClient;
};

/**
 * Get the configured R2 bucket name.
 */
export const getR2Bucket = (): string => serverEnv.R2_BUCKET;
