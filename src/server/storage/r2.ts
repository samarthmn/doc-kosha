import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type GetObjectCommandInput,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2Bucket } from "./r2Client";
import { toR2Key, type LogicalBucket } from "./r2Keys";

// Default presigned URL expiration times
const DEFAULT_UPLOAD_EXPIRES_SECONDS = 60 * 60; // 1 hour
const DEFAULT_DOWNLOAD_EXPIRES_SECONDS = 10 * 60; // 10 minutes

type PresignPutOptions = {
  logicalBucket: LogicalBucket;
  path: string;
  contentType: string;
  contentLengthBytes?: number;
  cacheControl?: string;
  expiresInSeconds?: number;
};

type PresignGetOptions = {
  logicalBucket: LogicalBucket;
  path: string;
  expiresInSeconds?: number;
  responseContentDisposition?: string;
  responseContentType?: string;
};

type PutBufferOptions = {
  logicalBucket: LogicalBucket;
  path: string;
  body: Buffer | Uint8Array | Blob | string;
  contentType: string;
  cacheControl?: string;
};

type DownloadOptions = {
  logicalBucket: LogicalBucket;
  path: string;
  range?: string;
};

type HeadOptions = {
  logicalBucket: LogicalBucket;
  path: string;
};

type DeleteOptions = {
  logicalBucket: LogicalBucket;
  path: string;
};

type DeleteManyOptions = {
  keys: Array<{ logicalBucket: LogicalBucket; path: string }>;
};

type DownloadResult =
  | { ok: true; buffer: Buffer; contentType?: string; contentLength?: number }
  | { ok: false; status: number; message: string };

type HeadResult =
  | {
      ok: true;
      contentLength?: number;
      contentType?: string;
      lastModified?: Date;
    }
  | { ok: false; status: number; message: string };

type PutResult =
  { ok: true; etag?: string } | { ok: false; status: number; message: string };

type DeleteResult =
  | { ok: true; deletedCount?: number }
  | { ok: false; status: number; message: string };

/**
 * Generate a presigned PUT URL for uploading a file directly to R2.
 */
export const presignPutObject = async (
  options: PresignPutOptions,
): Promise<string> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: options.contentType,
    ContentLength: options.contentLengthBytes,
    CacheControl: options.cacheControl,
  });

  return getSignedUrl(client, command, {
    expiresIn: options.expiresInSeconds ?? DEFAULT_UPLOAD_EXPIRES_SECONDS,
  });
};

/**
 * Generate a presigned GET URL for downloading a file from R2.
 */
export const presignGetObject = async (
  options: PresignGetOptions,
): Promise<string> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  const commandInput: GetObjectCommandInput = {
    Bucket: bucket,
    Key: key,
  };

  if (options.responseContentDisposition) {
    commandInput.ResponseContentDisposition =
      options.responseContentDisposition;
  }
  if (options.responseContentType) {
    commandInput.ResponseContentType = options.responseContentType;
  }

  const command = new GetObjectCommand(commandInput);

  return getSignedUrl(client, command, {
    expiresIn: options.expiresInSeconds ?? DEFAULT_DOWNLOAD_EXPIRES_SECONDS,
  });
};

/**
 * Download a file from R2 to a Buffer.
 */
export const downloadToBuffer = async (
  options: DownloadOptions,
): Promise<DownloadResult> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  try {
    const commandInput: GetObjectCommandInput = {
      Bucket: bucket,
      Key: key,
    };

    if (options.range) {
      commandInput.Range = options.range;
    }

    const command = new GetObjectCommand(commandInput);
    const response = await client.send(command);

    if (!response.Body) {
      return { ok: false, status: 500, message: "Empty response body" };
    }

    // Convert stream to buffer using SDK utility for cross-environment compatibility.
    const byteArray = await response.Body.transformToByteArray();
    const buffer = Buffer.from(byteArray);

    return {
      ok: true,
      buffer,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (error) {
    const err = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Download failed";

    if (err.name === "NoSuchKey" || status === 404) {
      return { ok: false, status: 404, message: "Object not found" };
    }

    return { ok: false, status, message };
  }
};

/**
 * Upload a buffer/blob to R2.
 */
export const putBuffer = async (
  options: PutBufferOptions,
): Promise<PutResult> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  try {
    const commandInput: PutObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Body: options.body,
      ContentType: options.contentType,
    };

    if (options.cacheControl) {
      commandInput.CacheControl = options.cacheControl;
    }

    const command = new PutObjectCommand(commandInput);
    const response = await client.send(command);

    return { ok: true, etag: response.ETag };
  } catch (error) {
    const err = error as {
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Upload failed";
    return { ok: false, status, message };
  }
};

/**
 * Delete a single object from R2.
 */
export const deleteObject = async (
  options: DeleteOptions,
): Promise<DeleteResult> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await client.send(command);
    return { ok: true, deletedCount: 1 };
  } catch (error) {
    const err = error as {
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Delete failed";
    return { ok: false, status, message };
  }
};

/**
 * Delete multiple objects from R2 in a single request.
 */
export const deleteMany = async (
  options: DeleteManyOptions,
): Promise<DeleteResult> => {
  if (options.keys.length === 0) {
    return { ok: true, deletedCount: 0 };
  }

  const client = getR2Client();
  const bucket = getR2Bucket();

  const objects = options.keys.map(({ logicalBucket, path }) => ({
    Key: toR2Key(logicalBucket, path),
  }));

  try {
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objects,
        Quiet: true,
      },
    });
    const response = await client.send(command);

    if (response.Errors && response.Errors.length > 0) {
      const failedKeys = response.Errors.map((e) => e.Key ?? "<unknown>").join(
        ", ",
      );
      return {
        ok: false,
        status: 500,
        message: `Failed to delete some objects: ${failedKeys}`,
      };
    }

    return { ok: true, deletedCount: objects.length };
  } catch (error) {
    const err = error as {
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Delete failed";
    return { ok: false, status, message };
  }
};

type DeletePrefixOptions = {
  logicalBucket: LogicalBucket;
  /** Must end with "/" so sibling keys sharing a name prefix never match. */
  pathPrefix: string;
};

/**
 * Delete every object under a logical-bucket path prefix. Superseded
 * conversion attempts are referenced only by this prefix convention, so
 * document deletion depends on it to avoid stranding immutable outputs.
 */
export const deleteObjectsByPrefix = async (
  options: DeletePrefixOptions,
): Promise<DeleteResult> => {
  if (!options.pathPrefix.endsWith("/")) {
    return {
      ok: false,
      status: 500,
      message: "Prefix deletion requires a trailing slash",
    };
  }

  const client = getR2Client();
  const bucket = getR2Bucket();
  const prefix = toR2Key(options.logicalBucket, options.pathPrefix);
  let deletedCount = 0;
  let continuationToken: string | undefined;

  try {
    do {
      const listResponse = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = (listResponse.Contents ?? [])
        .map((object) => object.Key)
        .filter(
          (key): key is string => typeof key === "string" && key.length > 0,
        );

      if (keys.length > 0) {
        const deleteResponse = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: keys.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
        if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
          const failedKeys = deleteResponse.Errors.map(
            (deleteError) => deleteError.Key ?? "<unknown>",
          ).join(", ");
          return {
            ok: false,
            status: 500,
            message: `Failed to delete some objects: ${failedKeys}`,
          };
        }
        deletedCount += keys.length;
      }

      continuationToken = listResponse.IsTruncated
        ? listResponse.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return { ok: true, deletedCount };
  } catch (error) {
    const err = error as {
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Prefix delete failed";
    return { ok: false, status, message };
  }
};

/**
 * Check if an object exists and get its metadata.
 */
export const headObject = async (options: HeadOptions): Promise<HeadResult> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const key = toR2Key(options.logicalBucket, options.path);

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const response = await client.send(command);

    return {
      ok: true,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified,
    };
  } catch (error) {
    const err = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
      message?: string;
    };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const message = err.message ?? "Head request failed";

    if (err.name === "NotFound" || status === 404) {
      return { ok: false, status: 404, message: "Object not found" };
    }

    return { ok: false, status, message };
  }
};
