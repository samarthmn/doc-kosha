import type {
  DownloadObjectStreamOptions,
  ObjectStreamResult,
} from "./r2Stream";
import type { LogicalBucket } from "./r2Keys";

type ObjectLocation = {
  logicalBucket: LogicalBucket;
  path: string;
};

type GetObjectByteLengthResult =
  | { ok: true; byteLength: number }
  | { ok: false; status: number; message: string };

type BoundedBufferResult =
  | {
      ok: true;
      buffer: Buffer;
      contentType?: string;
      contentLength?: number;
    }
  | { ok: false; status: number; message: string };

type ExactObjectStreamResult = ObjectStreamResult;

type HeadObjectDependency = (options: ObjectLocation) => Promise<
  | {
      ok: true;
      contentLength?: number;
      contentType?: string;
      lastModified?: Date;
    }
  | { ok: false; status: number; message: string }
>;
type DownloadToBufferDependency = (
  options: ObjectLocation & { range?: string },
) => Promise<BoundedBufferResult>;
type DownloadObjectStreamDependency = (
  options: DownloadObjectStreamOptions,
) => Promise<ObjectStreamResult>;

type BoundedObjectDependencies = {
  headObject: HeadObjectDependency;
  downloadToBuffer: DownloadToBufferDependency;
  downloadObjectStream: DownloadObjectStreamDependency;
};

type BoundedObjectAccess = {
  getObjectByteLength: (
    options: ObjectLocation,
  ) => Promise<GetObjectByteLengthResult>;
  downloadToBufferBounded: (
    options: ObjectLocation & { maxBytes: number },
  ) => Promise<BoundedBufferResult>;
  openExactObjectStream: (
    options: ObjectLocation & {
      expectedBytes: number;
      signal?: AbortSignal;
    },
  ) => Promise<ExactObjectStreamResult>;
};

const validByteLength = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const parseContentRangeTotal = (
  contentRange: string | undefined,
): number | null => {
  if (!contentRange) return null;
  const match = /^bytes\s+\d+-\d+\/(\d+)$/.exec(contentRange.trim());
  if (!match) return null;
  const total = Number(match[1]);
  return validByteLength(total) ? total : null;
};

const sizeUnavailable = (): GetObjectByteLengthResult => ({
  ok: false,
  status: 502,
  message: "Unable to determine object size",
});

/**
 * Creates bounded object readers. Dependency injection keeps the admission and
 * TOCTOU safeguards independently testable from R2.
 */
export const createBoundedObjectAccess = (
  dependencies: BoundedObjectDependencies,
): BoundedObjectAccess => {
  const getObjectByteLength = async (
    options: ObjectLocation,
  ): Promise<GetObjectByteLengthResult> => {
    const head = await dependencies.headObject(options);
    if (!head.ok) return head;
    if (validByteLength(head.contentLength)) {
      return { ok: true, byteLength: head.contentLength };
    }

    // A one-byte range probe obtains Content-Range without risking an
    // unbounded read when a provider omits Content-Length on HEAD.
    const probe = await dependencies.downloadObjectStream({
      ...options,
      range: "bytes=0-0",
    });
    if (!probe.ok) return probe;
    try {
      const total = parseContentRangeTotal(probe.contentRange);
      if (total !== null) return { ok: true, byteLength: total };
      if (probe.contentLength === 0) return { ok: true, byteLength: 0 };
      return sizeUnavailable();
    } finally {
      await probe.close();
    }
  };

  const downloadToBufferBounded = async (
    options: ObjectLocation & { maxBytes: number },
  ): Promise<BoundedBufferResult> => {
    if (!validByteLength(options.maxBytes)) {
      return { ok: false, status: 500, message: "Invalid object size limit" };
    }

    const admitted = await getObjectByteLength(options);
    if (!admitted.ok) return admitted;
    if (admitted.byteLength > options.maxBytes) {
      return {
        ok: false,
        status: 413,
        message: `Object exceeds the ${options.maxBytes} byte limit`,
      };
    }
    if (admitted.byteLength === 0) {
      return { ok: true, buffer: Buffer.alloc(0), contentLength: 0 };
    }

    // max+1 range bounds a source that changed between HEAD and GET.
    const downloaded = await dependencies.downloadToBuffer({
      logicalBucket: options.logicalBucket,
      path: options.path,
      range: `bytes=0-${options.maxBytes}`,
    });
    if (!downloaded.ok) return downloaded;
    if (downloaded.buffer.byteLength > options.maxBytes) {
      return {
        ok: false,
        status: 413,
        message: `Object exceeds the ${options.maxBytes} byte limit`,
      };
    }
    if (downloaded.buffer.byteLength !== admitted.byteLength) {
      return {
        ok: false,
        status: 409,
        message: "Object changed while it was being downloaded",
      };
    }

    return downloaded;
  };

  const openExactObjectStream = async (
    options: ObjectLocation & {
      expectedBytes: number;
      signal?: AbortSignal;
    },
  ): Promise<ExactObjectStreamResult> => {
    if (!validByteLength(options.expectedBytes)) {
      return {
        ok: false,
        status: 500,
        message: "Invalid expected object size",
      };
    }
    if (options.expectedBytes === 0) {
      return {
        ok: true,
        chunks: (async function* (): AsyncGenerator<Uint8Array> {
          yield new Uint8Array();
        })(),
        contentLength: 0,
        close: async () => undefined,
      };
    }

    const opened = await dependencies.downloadObjectStream({
      logicalBucket: options.logicalBucket,
      path: options.path,
      range: `bytes=0-${options.expectedBytes}`,
      signal: options.signal,
    });
    if (!opened.ok) return opened;

    const exactChunks = (async function* (): AsyncGenerator<Uint8Array> {
      let observedBytes = 0;
      try {
        for await (const chunk of opened.chunks) {
          observedBytes += chunk.byteLength;
          if (observedBytes > options.expectedBytes) {
            throw new Error("Object grew after ZIP preflight");
          }
          yield chunk;
        }
        if (observedBytes !== options.expectedBytes) {
          throw new Error("Object changed after ZIP preflight");
        }
      } finally {
        await opened.close();
      }
    })();

    return {
      ...opened,
      chunks: exactChunks,
      close: opened.close,
    };
  };

  return {
    getObjectByteLength,
    downloadToBufferBounded,
    openExactObjectStream,
  };
};

const defaultAccess = createBoundedObjectAccess({
  headObject: async (options) => {
    const storage = await import("./r2");
    return storage.headObject(options);
  },
  downloadToBuffer: async (options) => {
    const storage = await import("./r2");
    return storage.downloadToBuffer(options);
  },
  downloadObjectStream: async (options) => {
    const storage = await import("./r2Stream");
    return storage.downloadObjectStream(options);
  },
});

export const getObjectByteLength = defaultAccess.getObjectByteLength;
export const downloadToBufferBounded = defaultAccess.downloadToBufferBounded;
export const openExactObjectStream = defaultAccess.openExactObjectStream;
