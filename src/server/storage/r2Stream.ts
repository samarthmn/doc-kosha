import {
  GetObjectCommand,
  type GetObjectCommandInput,
} from "@aws-sdk/client-s3";

import { getR2Bucket, getR2Client } from "./r2Client";
import { toR2Key, type LogicalBucket } from "./r2Keys";

export type DownloadObjectStreamOptions = {
  logicalBucket: LogicalBucket;
  path: string;
  range?: string;
  signal?: AbortSignal;
};

export type ObjectStreamResult =
  | {
      ok: true;
      chunks: AsyncIterable<Uint8Array>;
      contentLength?: number;
      contentRange?: string;
      contentType?: string;
      close: () => Promise<void>;
    }
  | { ok: false; status: number; message: string };

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  typeof value === "object" && value !== null && Symbol.asyncIterator in value;

const isDestroyable = (
  value: unknown,
): value is { destroy: (error?: Error) => void } =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "destroy") === "function";

const normalizeStorageError = (
  error: unknown,
): { status: number; message: string } => {
  if (typeof error !== "object" || error === null) {
    return { status: 500, message: String(error) };
  }

  const metadata = Reflect.get(error, "$metadata");
  const status =
    typeof metadata === "object" && metadata !== null
      ? Reflect.get(metadata, "httpStatusCode")
      : undefined;
  const name = Reflect.get(error, "name");
  const message = Reflect.get(error, "message");

  if (name === "NoSuchKey" || status === 404) {
    return { status: 404, message: "Object not found" };
  }

  return {
    status: typeof status === "number" ? status : 500,
    message: typeof message === "string" ? message : "Download failed",
  };
};

/**
 * Open an R2/MinIO object as an async byte stream without buffering it.
 */
export const downloadObjectStream = async (
  options: DownloadObjectStreamOptions,
): Promise<ObjectStreamResult> => {
  const client = getR2Client();
  const internalAbort = new AbortController();
  const propagateAbort = (): void => {
    if (!internalAbort.signal.aborted) {
      internalAbort.abort(options.signal?.reason);
    }
  };
  if (options.signal?.aborted) {
    propagateAbort();
  } else {
    options.signal?.addEventListener("abort", propagateAbort, { once: true });
  }

  try {
    const commandInput: GetObjectCommandInput = {
      Bucket: getR2Bucket(),
      Key: toR2Key(options.logicalBucket, options.path),
      Range: options.range,
    };
    const response = await client.send(new GetObjectCommand(commandInput), {
      abortSignal: internalAbort.signal,
    });
    const body = response.Body;
    if (!body || !isAsyncIterable(body)) {
      options.signal?.removeEventListener("abort", propagateAbort);
      propagateAbort();
      return { ok: false, status: 500, message: "Invalid streaming body" };
    }

    let closed = false;
    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      options.signal?.removeEventListener("abort", propagateAbort);
      if (isDestroyable(body)) body.destroy();
      propagateAbort();
    };

    const chunks = (async function* (): AsyncGenerator<Uint8Array> {
      try {
        for await (const chunk of body) {
          if (!(chunk instanceof Uint8Array)) {
            throw new Error("Storage stream emitted a non-byte chunk");
          }
          yield chunk;
        }
      } finally {
        await close();
      }
    })();

    return {
      ok: true,
      chunks,
      contentLength: response.ContentLength,
      contentRange: response.ContentRange,
      contentType: response.ContentType,
      close,
    };
  } catch (error) {
    options.signal?.removeEventListener("abort", propagateAbort);
    const normalized = normalizeStorageError(error);
    return { ok: false, ...normalized };
  }
};
