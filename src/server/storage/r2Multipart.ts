import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getR2Client, getR2Bucket } from "./r2Client";
import { toR2Key, type LogicalBucket } from "./r2Keys";

type MultipartInitOptions = {
  logicalBucket: LogicalBucket;
  path: string;
  contentType: string;
  cacheControl?: string;
};

type MultipartInitResult =
  | { ok: true; uploadId: string }
  | { ok: false; status: number; message: string };

type PresignPartOptions = {
  logicalBucket: LogicalBucket;
  path: string;
  uploadId: string;
  partNumber: number;
  expiresInSeconds?: number;
};

type PresignPartResult =
  | { ok: true; uploadUrl: string }
  | { ok: false; status: number; message: string };

type CompleteOptions = {
  logicalBucket: LogicalBucket;
  path: string;
  uploadId: string;
  parts: CompletedPart[];
};

type CompleteResult =
  { ok: true; etag?: string } | { ok: false; status: number; message: string };

type AbortOptions = {
  logicalBucket: LogicalBucket;
  path: string;
  uploadId: string;
};

type AbortResult =
  { ok: true } | { ok: false; status: number; message: string };

const DEFAULT_UPLOAD_EXPIRES_SECONDS = 60 * 60; // 1 hour

const normalizeEtag = (etag: string | undefined | null): string | undefined => {
  if (!etag) return undefined;
  const trimmed = etag.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const createMultipartUpload = async (
  options: MultipartInitOptions,
): Promise<MultipartInitResult> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  try {
    const command = new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: options.contentType,
      CacheControl: options.cacheControl,
    });
    const res = await client.send(command);
    const uploadId = res.UploadId;
    if (!uploadId) {
      return { ok: false, status: 500, message: "Multipart uploadId missing" };
    }
    return { ok: true, uploadId };
  } catch (error) {
    const err = error as {
      $metadata?: { httpStatusCode?: number };
      message?: string;
      name?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Failed to initiate multipart upload";
    return { ok: false, status, message };
  }
};

export const presignUploadPart = async (
  options: PresignPartOptions,
): Promise<PresignPartResult> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  try {
    const command = new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: options.uploadId,
      PartNumber: options.partNumber,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: options.expiresInSeconds ?? DEFAULT_UPLOAD_EXPIRES_SECONDS,
    });

    return { ok: true, uploadUrl };
  } catch (error) {
    const err = error as {
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Failed to presign upload part";
    return { ok: false, status, message };
  }
};

export const completeMultipartUpload = async (
  options: CompleteOptions,
): Promise<CompleteResult> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  try {
    const command = new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: options.uploadId,
      MultipartUpload: {
        Parts: options.parts.map((p) => ({
          PartNumber: p.PartNumber,
          ETag: normalizeEtag(p.ETag),
        })),
      },
    });
    const res = await client.send(command);
    return { ok: true, etag: normalizeEtag(res.ETag) };
  } catch (error) {
    const err = error as {
      $metadata?: { httpStatusCode?: number };
      message?: string;
      name?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Failed to complete multipart upload";
    return { ok: false, status, message };
  }
};

export const abortMultipartUpload = async (
  options: AbortOptions,
): Promise<AbortResult> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  try {
    const command = new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: options.uploadId,
    });
    await client.send(command);
    return { ok: true };
  } catch (error) {
    const err = error as {
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Failed to abort multipart upload";
    return { ok: false, status, message };
  }
};
