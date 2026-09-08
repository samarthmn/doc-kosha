import {
  createUploadCleanupDeadline,
  type MultipartCompletionState,
} from "@/components/documents/uploadLifecycleSafety";

type AssetKind = "document" | "data-room-document" | "branding";

export type MultipartUploadProgress = {
  percent: number; // 0..100
  uploadedBytes: number;
  totalBytes: number;
  partNumber: number;
  totalParts: number;
};

export type MultipartUploadState =
  | { status: "idle" }
  | { status: "initializing" }
  | { status: "uploading"; progress: MultipartUploadProgress }
  | { status: "paused"; progress: MultipartUploadProgress | null }
  | { status: "finalizing" }
  | { status: "completed" }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export type MultipartUploadResult = {
  logicalBucket: string;
  storagePath: string;
  uploadId: string;
};

type CreateMultipartUploadControllerOptions = {
  assetKind: AssetKind;
  workspaceId: string;
  file: File;
  folderId?: string | null;
  dataRoomId?: string | null;
  brandingSubpath?: string;
  replaceDocumentId?: string | null;
  onStateChange?: (state: MultipartUploadState) => void;
  onProgress?: (progress: MultipartUploadProgress) => void;
};

export type MultipartUploadController = {
  start: () => Promise<MultipartUploadResult>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  getState: () => MultipartUploadState;
  getTarget: () => {
    logicalBucket: string;
    storagePath: string;
  } | null;
  getCompletionState: () => MultipartCompletionState;
};

type InitiateResponse = {
  uploadId: string;
  logicalBucket: string;
  storagePath: string;
  partSizeBytes: number;
  totalParts: number;
  intentToken: string;
};

const emitState = (
  cb: ((state: MultipartUploadState) => void) | undefined,
  state: MultipartUploadState,
) => {
  cb?.(state);
};

const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, value));

const buildAbortError = (): Error => {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
};

const uploadBlobToPresignedUrl = async (args: {
  uploadUrl: string;
  blob: Blob;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
  setActiveXhr: (xhr: XMLHttpRequest | null) => void;
}): Promise<{ etag: string }> => {
  if (typeof window === "undefined" || typeof XMLHttpRequest === "undefined") {
    throw new Error("Multipart uploads must run in the browser");
  }

  return await new Promise<{ etag: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    args.setActiveXhr(xhr);

    xhr.open("PUT", args.uploadUrl, true);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      args.onProgress?.(event.loaded, event.total);
    };

    xhr.onload = () => {
      args.setActiveXhr(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag") || "";
        if (!etag) {
          reject(new Error("Missing ETag for uploaded part"));
          return;
        }
        resolve({ etag });
        return;
      }
      reject(new Error(`Part upload failed (${xhr.status})`));
    };

    xhr.onerror = () => {
      args.setActiveXhr(null);
      reject(new Error("Part upload failed"));
    };

    xhr.onabort = () => {
      args.setActiveXhr(null);
      reject(buildAbortError());
    };

    // Avoid setting extra headers that might not be part of the signature.
    xhr.send(args.blob);
  });
};

const initiateMultipart = async (params: {
  assetKind: AssetKind;
  workspaceId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  folderId?: string | null;
  dataRoomId?: string | null;
  brandingSubpath?: string;
  replaceDocumentId?: string | null;
  signal: AbortSignal;
}): Promise<InitiateResponse> => {
  const { signal, ...body } = params;
  const res = await fetch("/api/storage/multipart/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Failed to initiate upload (${res.status})`);
  }

  return (await res.json()) as InitiateResponse;
};

const presignPart = async (params: {
  workspaceId: string;
  logicalBucket: string;
  storagePath: string;
  uploadId: string;
  intentToken: string;
  partNumber: number;
  signal: AbortSignal;
}): Promise<{ uploadUrl: string }> => {
  const { signal, ...body } = params;
  const res = await fetch("/api/storage/multipart/sign-part", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Failed to sign part (${res.status})`);
  }

  return (await res.json()) as { uploadUrl: string };
};

const completeMultipart = async (params: {
  workspaceId: string;
  logicalBucket: string;
  storagePath: string;
  uploadId: string;
  intentToken: string;
  parts: Array<{ partNumber: number; etag: string }>;
  signal: AbortSignal;
}): Promise<void> => {
  const { signal, ...body } = params;
  const res = await fetch("/api/storage/multipart/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Failed to complete upload (${res.status})`);
  }
};

const abortMultipart = async (params: {
  workspaceId: string;
  logicalBucket: string;
  storagePath: string;
  uploadId: string;
  intentToken: string;
}): Promise<void> => {
  const cleanupDeadline = createUploadCleanupDeadline();
  try {
    const res = await fetch("/api/storage/multipart/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: cleanupDeadline.signal,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Failed to abort upload (${res.status})`);
    }
  } finally {
    cleanupDeadline.clear();
  }
};

export const createMultipartUploadController = (
  options: CreateMultipartUploadControllerOptions,
): MultipartUploadController => {
  const requestController = new AbortController();
  let target: { logicalBucket: string; storagePath: string } | null = null;
  let initiatedUpload: InitiateResponse | null = null;
  let completionState: MultipartCompletionState = "incomplete";
  let state: MultipartUploadState = { status: "idle" };
  let paused = false;
  let cancelled = false;
  let started = false;

  let activeXhr: XMLHttpRequest | null = null;
  let abortReason: "pause" | "cancel" | null = null;

  let resumeResolver: (() => void) | null = null;
  const waitForResume = async (): Promise<void> => {
    if (!paused) return;
    await new Promise<void>((resolve) => {
      resumeResolver = resolve;
    });
    resumeResolver = null;
  };

  const setState = (next: MultipartUploadState) => {
    state = next;
    emitState(options.onStateChange, next);
  };

  const setActiveXhr = (xhr: XMLHttpRequest | null) => {
    activeXhr = xhr;
  };

  const pause = () => {
    if (!started) return;
    if (cancelled) return;
    if (paused) return;
    paused = true;
    abortReason = "pause";
    activeXhr?.abort();
  };

  const resume = () => {
    if (!started) return;
    if (cancelled) return;
    if (!paused) return;
    paused = false;
    abortReason = null;
    resumeResolver?.();
  };

  const cancel = () => {
    if (!started || cancelled) return;
    cancelled = true;
    abortReason = "cancel";
    requestController.abort();
    activeXhr?.abort();
    resumeResolver?.();
  };

  const start = async (): Promise<MultipartUploadResult> => {
    if (started) {
      throw new Error("Upload already started");
    }
    started = true;

    try {
      setState({ status: "initializing" });

      const file = options.file;
      const filename = file.name;
      const contentType = file.type || "application/octet-stream";
      const init = await initiateMultipart({
        assetKind: options.assetKind,
        workspaceId: options.workspaceId,
        filename,
        contentType,
        sizeBytes: Math.max(0, file.size),
        folderId: options.folderId ?? null,
        dataRoomId: options.dataRoomId ?? null,
        brandingSubpath: options.brandingSubpath,
        replaceDocumentId: options.replaceDocumentId ?? null,
        signal: requestController.signal,
      });
      initiatedUpload = init;
      target = {
        logicalBucket: init.logicalBucket,
        storagePath: init.storagePath,
      };

      const partSizeBytes = Math.max(1, init.partSizeBytes);
      const totalParts = Math.max(1, init.totalParts);

      const parts: Array<{ partNumber: number; etag: string }> = [];
      let completedBytes = 0;

      for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
        if (cancelled) {
          throw buildAbortError();
        }

        if (paused) {
          setState({
            status: "paused",
            progress: state.status === "uploading" ? state.progress : null,
          });
          await waitForResume();
          if (cancelled) {
            throw buildAbortError();
          }
        }

        const startByte = (partNumber - 1) * partSizeBytes;
        const endByte = Math.min(startByte + partSizeBytes, file.size);
        const blob = file.slice(startByte, endByte);

        const { uploadUrl } = await presignPart({
          workspaceId: options.workspaceId,
          logicalBucket: init.logicalBucket,
          storagePath: init.storagePath,
          uploadId: init.uploadId,
          intentToken: init.intentToken,
          partNumber,
          signal: requestController.signal,
        });

        try {
          const res = await uploadBlobToPresignedUrl({
            uploadUrl,
            blob,
            setActiveXhr,
            onProgress: (loaded, _total) => {
              const overallLoaded = completedBytes + loaded;
              const percent =
                file.size > 0 ? (overallLoaded / file.size) * 100 : 0;
              const progress: MultipartUploadProgress = {
                percent: clampPercent(percent),
                uploadedBytes: Math.min(overallLoaded, file.size),
                totalBytes: file.size,
                partNumber,
                totalParts,
              };
              setState({ status: paused ? "paused" : "uploading", progress });
              options.onProgress?.(progress);
            },
          });

          parts.push({ partNumber, etag: res.etag });
          completedBytes += blob.size;
        } catch (err) {
          const isAbort = err instanceof Error && err.name === "AbortError";
          if (isAbort && abortReason === "pause") {
            // Stay paused; we'll retry the current part on resume.
            setState({
              status: "paused",
              progress: state.status === "uploading" ? state.progress : null,
            });
            await waitForResume();
            if (cancelled) {
              throw buildAbortError();
            }
            partNumber -= 1;
            continue;
          }

          if (isAbort && abortReason === "cancel") {
            throw buildAbortError();
          }

          setState({
            status: "failed",
            message: err instanceof Error ? err.message : "Upload failed",
          });
          // Best-effort abort to avoid orphaned multipart uploads.
          try {
            await abortMultipart({
              workspaceId: options.workspaceId,
              logicalBucket: init.logicalBucket,
              storagePath: init.storagePath,
              uploadId: init.uploadId,
              intentToken: init.intentToken,
            });
          } catch {
            // ignore abort failures
          }
          throw err instanceof Error ? err : new Error("Upload failed");
        }
      }

      setState({ status: "finalizing" });
      completionState = "finalizing";
      await completeMultipart({
        workspaceId: options.workspaceId,
        logicalBucket: init.logicalBucket,
        storagePath: init.storagePath,
        uploadId: init.uploadId,
        intentToken: init.intentToken,
        parts: parts.sort((a, b) => a.partNumber - b.partNumber),
        signal: requestController.signal,
      });

      completionState = "completed";
      setState({ status: "completed" });
      return {
        logicalBucket: init.logicalBucket,
        storagePath: init.storagePath,
        uploadId: init.uploadId,
      };
    } catch (err) {
      if (completionState === "finalizing") {
        completionState = "ambiguous";
      }
      if (cancelled) {
        if (initiatedUpload) {
          try {
            await abortMultipart({
              workspaceId: options.workspaceId,
              logicalBucket: initiatedUpload.logicalBucket,
              storagePath: initiatedUpload.storagePath,
              uploadId: initiatedUpload.uploadId,
              intentToken: initiatedUpload.intentToken,
            });
          } catch {
            // Best-effort cleanup must not replace cancellation.
          }
        }
        setState({ status: "cancelled" });
        throw buildAbortError();
      }
      if (state.status !== "failed" && state.status !== "cancelled") {
        setState({
          status: "failed",
          message: err instanceof Error ? err.message : "Upload failed",
        });
      }
      throw err instanceof Error ? err : new Error("Upload failed");
    } finally {
      setActiveXhr(null);
    }
  };

  return {
    start,
    pause,
    resume,
    cancel,
    getState: () => state,
    getTarget: () => target,
    getCompletionState: () => completionState,
  };
};
