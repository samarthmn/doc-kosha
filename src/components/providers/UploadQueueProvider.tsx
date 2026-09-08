"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  Pause,
  Play,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { fadeIn } from "@/lib/motion";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { showError } from "@/lib/toast";
import { isActiveConvertibleExtension, isPdfExtension } from "@/lib/fileTypes";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import {
  createMultipartUploadController,
  type MultipartUploadController,
  type MultipartUploadState,
} from "@/components/documents/multipartUploadClient";
import {
  canDeleteCompletedMultipartTarget,
  createUploadCleanupDeadline,
  isProvenInsertNonCommitRejection,
  isProvenReplacePreMutationRejection,
} from "@/components/documents/uploadLifecycleSafety";
import {
  isInterruptibleUploadStage,
  summarizeUploadTasks,
  type UploadStage,
} from "@/components/documents/uploadQueueState";

type TaskState = {
  id: string;
  label: string;
  stage: UploadStage;
  // Upload progress (0..100). When undefined during uploading, show indeterminate.
  progress?: number;
  warning?: boolean;
  message?: string;
  errorMessage?: string;
  documentId?: string;
  workspaceId?: string;
};

type QueueUploadsOptions = {
  files: File[];
  workspaceId: string;
  baseFolderId: string | null;
  dataRoomId?: string | null;
  replaceTargets?: Record<string, string>;
};

type Ctx = {
  tasks: TaskState[];
  queueUploads: (options: QueueUploadsOptions) => Promise<void>;
  pauseTask: (taskId: string) => void;
  resumeTask: (taskId: string) => void;
  cancelTask: (taskId: string) => void;
  clearFinished: () => void;
  dismiss: () => void;
};

const UploadQueueContext = createContext<Ctx | null>(null);

export const useUploadQueue = () => {
  const ctx = useContext(UploadQueueContext);
  if (!ctx)
    throw new Error("useUploadQueue must be used within UploadQueueProvider");
  return ctx;
};

export const UploadQueueProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const idSeed = useRef(0);
  const [minimized, setMinimized] = useState<boolean>(false);
  const [isCancellingAll, setIsCancellingAll] = useState<boolean>(false);
  const summary = summarizeUploadTasks(tasks);

  const controllersRef = useRef<Map<string, MultipartUploadController>>(
    new Map(),
  );
  const cancelledRef = useRef<Set<string>>(new Set());
  const indexingResolversRef = useRef<Map<string, () => void>>(new Map());

  type UploadQueueItem = {
    taskId: string;
    file: File;
    clientFileKey: string;
    workspaceId: string;
    baseFolderId: string | null;
    dataRoomId?: string | null;
    replaceDocumentId?: string;
  };

  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const uploadProcessingRef = useRef<boolean>(false);

  const updateTask = useCallback(
    (taskId: string, patch: Partial<TaskState>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const resolveIndexing = useCallback((taskId: string) => {
    const resolve = indexingResolversRef.current.get(taskId);
    if (resolve) {
      indexingResolversRef.current.delete(taskId);
      cancelledRef.current.delete(taskId);
      resolve();
    }
  }, []);

  const clearFinished = useCallback(() => {
    setTasks((prev) => (summarizeUploadTasks(prev).allSettled ? [] : prev));
  }, []);

  const pauseTask = useCallback((taskId: string) => {
    controllersRef.current.get(taskId)?.pause();
  }, []);

  const resumeTask = useCallback((taskId: string) => {
    controllersRef.current.get(taskId)?.resume();
  }, []);

  const requestTaskCancellation = useCallback(
    (taskId: string) => {
      cancelledRef.current.add(taskId);

      const wasQueued = uploadQueueRef.current.some(
        (item) => item.taskId === taskId,
      );
      uploadQueueRef.current = uploadQueueRef.current.filter(
        (q) => q.taskId !== taskId,
      );

      controllersRef.current.get(taskId)?.cancel();
      if (wasQueued) {
        updateTask(taskId, { stage: "cancelled", message: "Cancelled" });
        resolveIndexing(taskId);
      }
    },
    [resolveIndexing, updateTask],
  );

  const cancelTask = useCallback(
    (taskId: string) => requestTaskCancellation(taskId),
    [requestTaskCancellation],
  );

  const dismiss = useCallback(() => {
    if (!summary.hasInterruptibleUploads) {
      cancelledRef.current.clear();
      setMinimized(false);
      setTasks([]);
      return;
    }
    if (isCancellingAll) return;

    const confirmed = window.confirm(
      "Cancel the remaining uploads? Files already uploaded will be kept.",
    );
    if (!confirmed) return;

    setIsCancellingAll(true);
    const activeTaskIds = tasks
      .filter((task) => isInterruptibleUploadStage(task.stage))
      .map((task) => task.id);
    for (const taskId of activeTaskIds) {
      requestTaskCancellation(taskId);
    }
  }, [isCancellingAll, requestTaskCancellation, summary, tasks]);

  useEffect(() => {
    if (!summary.allSettled || summary.hasFailures || isCancellingAll) return;
    const timer = window.setTimeout(() => setTasks([]), 2_000);
    return () => window.clearTimeout(timer);
  }, [isCancellingAll, summary.allSettled, summary.hasFailures]);

  useEffect(() => {
    if (!isCancellingAll || summary.hasInterruptibleUploads) return;
    cancelledRef.current.clear();
    setMinimized(false);
    setTasks([]);
    setIsCancellingAll(false);
  }, [isCancellingAll, summary.hasInterruptibleUploads]);

  useEffect(() => {
    if (!summary.hasInterruptibleUploads) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [summary.hasInterruptibleUploads]);

  const deleteUploadedObject = useCallback(
    async (params: {
      workspaceId: string;
      logicalBucket: string;
      path: string;
    }): Promise<void> => {
      const cleanupDeadline = createUploadCleanupDeadline();
      try {
        const res = await fetch("/api/storage/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: cleanupDeadline.signal,
          body: JSON.stringify({
            workspaceId: params.workspaceId,
            items: [
              {
                logicalBucket: params.logicalBucket,
                path: params.path,
              },
            ],
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error("Failed to delete uploaded object:", {
            status: res.status,
            error: data?.error ?? null,
          });
        }
      } catch (err) {
        console.error("Failed to delete uploaded object:", err);
      } finally {
        cleanupDeadline.clear();
      }
    },
    [],
  );

  const runUploadWorker = useCallback(async (): Promise<void> => {
    if (uploadProcessingRef.current) return;
    uploadProcessingRef.current = true;

    const folderCache = new Map<string, string>();

    const getOrCreateFolder = async (params: {
      workspaceId: string;
      dataRoomId: string | null;
      parentId: string | null;
      name: string;
      userId: string;
    }): Promise<string> => {
      const scopeKey = params.dataRoomId ?? "workspace";
      const key = `${params.workspaceId}|${scopeKey}|${params.parentId ?? "root"}|${params.name}`;
      const cached = folderCache.get(key);
      if (cached) return cached;

      const scopedQuery = () => {
        const base = supabase
          .from("folders")
          .select("id")
          .eq("workspace_id", params.workspaceId)
          .eq("name", params.name);
        return params.dataRoomId
          ? base.eq("data_room_id", params.dataRoomId)
          : base.is("data_room_id", null);
      };

      const fetchExistingFolder = async () =>
        params.parentId === null
          ? await scopedQuery().is("parent_folder_id", null).maybeSingle()
          : await scopedQuery()
              .eq("parent_folder_id", params.parentId)
              .maybeSingle();

      const { data: existing } = await fetchExistingFolder();

      if (existing?.id) {
        folderCache.set(key, existing.id);
        return existing.id;
      }

      const { data: inserted, error } = await supabase
        .from("folders")
        .insert({
          workspace_id: params.workspaceId,
          parent_folder_id: params.parentId,
          name: params.name,
          created_by: params.userId,
          data_room_id: params.dataRoomId,
        })
        .select("id")
        .single();

      if (inserted?.id) {
        folderCache.set(key, inserted.id);
        return inserted.id;
      }

      if (error?.code === "23505") {
        const { data: collided } = await fetchExistingFolder();
        if (collided?.id) {
          folderCache.set(key, collided.id);
          return collided.id;
        }
      }

      throw error ?? new Error("folder create failed");
    };

    const ensureFolderChain = async (params: {
      workspaceId: string;
      dataRoomId: string | null;
      baseFolderId: string | null;
      segments: string[];
      userId: string;
    }): Promise<string | null> => {
      let parentId: string | null = params.baseFolderId;
      for (const seg of params.segments) {
        parentId = await getOrCreateFolder({
          workspaceId: params.workspaceId,
          dataRoomId: params.dataRoomId,
          parentId,
          name: seg,
          userId: params.userId,
        });
      }
      return parentId;
    };

    const failQueuedTasks = (errorMessage: string): void => {
      const queuedItems = uploadQueueRef.current;
      uploadQueueRef.current = [];
      for (const queuedItem of queuedItems) {
        updateTask(queuedItem.taskId, { stage: "failed", errorMessage });
        resolveIndexing(queuedItem.taskId);
      }
    };

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;
      if (!userId) {
        showError("Not authenticated");
        failQueuedTasks("Session expired before upload");
        return;
      }

      while (uploadQueueRef.current.length > 0) {
        const item = uploadQueueRef.current.shift();
        if (!item) break;
        let uploadedTarget: {
          logicalBucket: string;
          storagePath: string;
        } | null = null;
        let documentMutationStarted = false;
        let documentCommitted = false;
        let committedDocumentId: string | null = null;

        try {
          if (cancelledRef.current.has(item.taskId)) {
            updateTask(item.taskId, {
              stage: "cancelled",
              message: "Cancelled",
            });
            resolveIndexing(item.taskId);
            continue;
          }

          const file = item.file;
          const rel = (file as unknown as { webkitRelativePath?: string })
            .webkitRelativePath;
          const folderSegments = rel
            ? rel.split("/").filter(Boolean).slice(0, -1)
            : [];

          let folderId: string | null = null;
          try {
            folderId = await ensureFolderChain({
              workspaceId: item.workspaceId,
              dataRoomId: item.dataRoomId ?? null,
              baseFolderId: item.baseFolderId,
              segments: folderSegments,
              userId,
            });
          } catch {
            updateTask(
              item.taskId,
              cancelledRef.current.has(item.taskId)
                ? { stage: "cancelled", message: "Cancelled" }
                : {
                    stage: "failed",
                    errorMessage: "Failed to create folders",
                  },
            );
            resolveIndexing(item.taskId);
            continue;
          }

          if (cancelledRef.current.has(item.taskId)) {
            updateTask(item.taskId, {
              stage: "cancelled",
              message: "Cancelled",
            });
            resolveIndexing(item.taskId);
            continue;
          }

          const assetKind = item.dataRoomId ? "data-room-document" : "document";

          const onStateChange = (s: MultipartUploadState) => {
            if (cancelledRef.current.has(item.taskId)) return;

            if (s.status === "initializing") {
              updateTask(item.taskId, {
                stage: "uploading",
                progress: undefined,
              });
            } else if (s.status === "uploading") {
              updateTask(item.taskId, {
                stage: "uploading",
                progress: Math.round(s.progress.percent),
                message: "Uploading…",
              });
            } else if (s.status === "paused") {
              updateTask(item.taskId, {
                stage: "paused",
                progress: s.progress
                  ? Math.round(s.progress.percent)
                  : undefined,
                message: "Paused",
              });
            } else if (s.status === "finalizing") {
              updateTask(item.taskId, {
                stage: "finalizing",
                progress: 100,
                message: "Finalizing…",
              });
            } else if (s.status === "completed") {
              updateTask(item.taskId, {
                stage: "indexing",
                progress: 100,
                message: "Indexing…",
              });
            } else if (s.status === "cancelled") {
              updateTask(item.taskId, {
                stage: "cancelled",
                message: "Cancelled",
              });
            } else if (s.status === "failed") {
              updateTask(item.taskId, {
                stage: "failed",
                errorMessage: s.message,
                message: "Upload failed",
              });
            }
          };

          const controller = createMultipartUploadController({
            assetKind,
            workspaceId: item.workspaceId,
            file,
            folderId,
            dataRoomId: item.dataRoomId ?? null,
            replaceDocumentId: item.replaceDocumentId ?? null,
            onStateChange,
            onProgress: (p) => {
              if (cancelledRef.current.has(item.taskId)) return;
              updateTask(item.taskId, {
                stage: "uploading",
                progress: Math.round(p.percent),
              });
            },
          });

          controllersRef.current.set(item.taskId, controller);

          let uploadResult: {
            logicalBucket: string;
            storagePath: string;
          } | null = null;
          try {
            const res = await controller.start();
            uploadResult = {
              logicalBucket: res.logicalBucket,
              storagePath: res.storagePath,
            };
            uploadedTarget = uploadResult;
          } catch (err) {
            controllersRef.current.delete(item.taskId);
            if (cancelledRef.current.has(item.taskId)) {
              if (
                canDeleteCompletedMultipartTarget(
                  controller.getCompletionState(),
                )
              ) {
                const knownTarget = controller.getTarget();
                if (knownTarget) {
                  await deleteUploadedObject({
                    workspaceId: item.workspaceId,
                    logicalBucket: knownTarget.logicalBucket,
                    path: knownTarget.storagePath,
                  });
                }
              }
              updateTask(item.taskId, {
                stage: "cancelled",
                message: "Cancelled",
              });
            } else {
              const msg = err instanceof Error ? err.message : "Upload failed";
              updateTask(item.taskId, { stage: "failed", errorMessage: msg });
            }
            resolveIndexing(item.taskId);
            continue;
          } finally {
            controllersRef.current.delete(item.taskId);
          }

          if (!uploadResult) {
            resolveIndexing(item.taskId);
            continue;
          }

          const name = file.name;
          const ext = (name.split(".").pop() || "").toLowerCase();
          const shouldConvert = isActiveConvertibleExtension(ext);
          const shouldProcess = shouldConvert || isPdfExtension(ext);

          let targetDocumentId: string | null = null;

          if (cancelledRef.current.has(item.taskId)) {
            await deleteUploadedObject({
              workspaceId: item.workspaceId,
              logicalBucket: uploadResult.logicalBucket,
              path: uploadResult.storagePath,
            });
            updateTask(item.taskId, {
              stage: "cancelled",
              message: "Cancelled",
            });
            resolveIndexing(item.taskId);
            continue;
          }

          if (item.replaceDocumentId) {
            documentMutationStarted = true;
            const replaceRes = await fetch(
              "/api/documents/versioning/replace",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  workspaceId: item.workspaceId,
                  documentId: item.replaceDocumentId,
                  uploaded: {
                    storagePath: uploadResult.storagePath,
                    convertedStoragePath: null,
                    conversionStatus: shouldProcess ? "pending" : "completed",
                    sizeBytes: file.size,
                    title: name,
                    fileType: ext,
                    folderId,
                    dataRoomId: item.dataRoomId ?? null,
                  },
                  idempotencyKey: `${item.taskId}:${uploadResult.storagePath}`,
                }),
              },
            );

            if (!replaceRes.ok) {
              const payload = (await replaceRes.json().catch(() => null)) as {
                error?: string;
                code?: string;
              } | null;

              if (isProvenReplacePreMutationRejection(replaceRes.status)) {
                await deleteUploadedObject({
                  workspaceId: item.workspaceId,
                  logicalBucket: uploadResult.logicalBucket,
                  path: uploadResult.storagePath,
                });
              }

              updateTask(item.taskId, {
                stage: "failed",
                errorMessage:
                  payload?.code === "STORAGE_LIMIT_EXCEEDED"
                    ? "Replacement blocked: storage limit would be exceeded"
                    : (payload?.error ?? "Failed to replace document"),
              });
              resolveIndexing(item.taskId);
              continue;
            }

            const payload = (await replaceRes.json().catch(() => null)) as {
              document?: { id?: string };
            } | null;
            targetDocumentId = payload?.document?.id ?? item.replaceDocumentId;
            committedDocumentId = targetDocumentId;
            documentCommitted = true;
          } else {
            documentMutationStarted = true;
            const {
              data: inserted,
              error: insErr,
              status: insertStatus,
            } = await supabase
              .from("documents")
              .insert({
                workspace_id: item.workspaceId,
                folder_id: folderId,
                data_room_id: item.dataRoomId ?? null,
                title: name,
                file_type: ext,
                storage_path: uploadResult.storagePath,
                size_bytes: file.size,
                num_pages: null,
                created_by: userId,
                conversion_status: shouldProcess ? "pending" : "completed",
              })
              .select("id")
              .single();

            if (insErr || !inserted) {
              if (isProvenInsertNonCommitRejection(insertStatus)) {
                await deleteUploadedObject({
                  workspaceId: item.workspaceId,
                  logicalBucket: uploadResult.logicalBucket,
                  path: uploadResult.storagePath,
                });
              }
              updateTask(item.taskId, {
                stage: "failed",
                errorMessage: "Failed to index document",
              });
              resolveIndexing(item.taskId);
              continue;
            }

            targetDocumentId = inserted.id;
            committedDocumentId = inserted.id;
            documentCommitted = true;
          }

          updateTask(item.taskId, {
            stage: "uploaded",
            progress: 100,
            message: item.replaceDocumentId ? "Replaced" : "Uploaded",
            documentId: targetDocumentId ?? undefined,
            workspaceId: item.workspaceId,
          });

          resolveIndexing(item.taskId);

          trackProductEvent("document_uploaded", {
            document_id: targetDocumentId ?? undefined,
            workspace_id: item.workspaceId,
            data_room_id: item.dataRoomId ?? undefined,
            file_type: ext,
            size_bytes: file.size,
            conversion_triggered: shouldConvert,
            replaced_existing: Boolean(item.replaceDocumentId),
          });

          if (shouldProcess && targetDocumentId) {
            // Fire-and-forget conversion kickoff; the viewer handles status UX.
            void fetch("/api/convert/document", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              keepalive: true,
              body: JSON.stringify({
                documentId: targetDocumentId,
                workspaceId: item.workspaceId,
              }),
            }).catch(() => {
              // ignore
            });
          }
        } catch (err) {
          controllersRef.current.delete(item.taskId);

          if (
            cancelledRef.current.has(item.taskId) &&
            !documentMutationStarted &&
            uploadedTarget
          ) {
            await deleteUploadedObject({
              workspaceId: item.workspaceId,
              logicalBucket: uploadedTarget.logicalBucket,
              path: uploadedTarget.storagePath,
            });
          }

          if (documentCommitted) {
            updateTask(item.taskId, {
              stage: "uploaded",
              progress: 100,
              message: item.replaceDocumentId ? "Replaced" : "Uploaded",
              documentId: committedDocumentId ?? undefined,
              workspaceId: item.workspaceId,
            });
          } else if (
            cancelledRef.current.has(item.taskId) &&
            !documentMutationStarted
          ) {
            updateTask(item.taskId, {
              stage: "cancelled",
              message: "Cancelled",
            });
          } else {
            updateTask(item.taskId, {
              stage: "failed",
              errorMessage:
                err instanceof Error ? err.message : "Upload failed",
            });
          }
          resolveIndexing(item.taskId);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Upload queue failed";
      failQueuedTasks(errorMessage);
    } finally {
      uploadProcessingRef.current = false;
    }
  }, [deleteUploadedObject, resolveIndexing, supabase, updateTask]);

  const queueUploads = useCallback(
    async (options: QueueUploadsOptions): Promise<void> => {
      const { files, workspaceId, baseFolderId, dataRoomId, replaceTargets } =
        options;

      if (!files || files.length === 0) return;
      if (!workspaceId) {
        showError("No workspace found for upload");
        return;
      }

      setMinimized(false);

      let effectiveReplaceTargets: Record<string, string> | undefined =
        replaceTargets;

      // Safety net: if an entrypoint bypasses the conflict-review modal,
      // prevent same-name duplicates by auto-detecting conflicts and
      // treating them as replacements.
      if (!effectiveReplaceTargets) {
        try {
          const payloadFiles = files.map((file) => {
            const rel = (file as unknown as { webkitRelativePath?: string })
              .webkitRelativePath;
            const relativePath = rel && rel.length > 0 ? rel : file.name;
            const clientFileKey = relativePath;
            return {
              clientFileKey,
              relativePath,
              filename: file.name,
            };
          });

          const res = await fetch("/api/documents/versioning/conflicts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              workspaceId,
              dataRoomId: dataRoomId ?? null,
              baseFolderId: baseFolderId ?? null,
              files: payloadFiles,
            }),
          });

          if (res.ok) {
            const payload = (await res.json()) as {
              conflicts?: Array<{
                clientFileKey: string;
                existingDocumentId: string;
              }>;
            };

            const mapping = Object.fromEntries(
              (payload.conflicts ?? []).map((conflict) => [
                conflict.clientFileKey,
                conflict.existingDocumentId,
              ]),
            );
            effectiveReplaceTargets = mapping;
          }
        } catch {
          // Best-effort only; upload will fall back to insert.
        }
      }

      const taskPromises: Array<Promise<void>> = [];

      for (const file of files) {
        const rel = (file as unknown as { webkitRelativePath?: string })
          .webkitRelativePath;
        const label = rel && rel.length > 0 ? rel : file.name;
        const clientFileKey = rel && rel.length > 0 ? rel : file.name;
        const id = `t_${Date.now()}_${idSeed.current++}`;

        cancelledRef.current.delete(id);

        setTasks((prev) => [
          ...prev,
          {
            id,
            label,
            stage: "queued",
            progress: 0,
          },
        ]);

        const p = new Promise<void>((resolve) => {
          indexingResolversRef.current.set(id, resolve);
        });
        taskPromises.push(p);

        uploadQueueRef.current.push({
          taskId: id,
          file,
          clientFileKey,
          workspaceId,
          baseFolderId,
          dataRoomId,
          replaceDocumentId: effectiveReplaceTargets?.[clientFileKey],
        });
      }

      void runUploadWorker();

      await Promise.all(taskPromises);
    },
    [runUploadWorker],
  );

  const value = useMemo(
    () => ({
      tasks,
      queueUploads,
      pauseTask,
      resumeTask,
      cancelTask,
      clearFinished,
      dismiss,
    }),
    [
      tasks,
      queueUploads,
      pauseTask,
      resumeTask,
      cancelTask,
      clearFinished,
      dismiss,
    ],
  );

  const visible = tasks.length > 0;

  const activeTask = tasks.find((t) =>
    ["uploading", "paused", "finalizing", "indexing"].includes(t.stage),
  );

  return (
    <UploadQueueContext.Provider value={value}>
      {children}
      {visible ? (
        <div
          className="dk-mobile-floating-chrome ph-no-capture fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-999 w-[min(calc(100vw-1.5rem),408px)] lg:right-4 lg:bottom-4"
          data-ph-no-capture
        >
          <div
            className="dk-nocturne-overlay overflow-hidden rounded-[14px]"
            role="region"
            aria-label="Upload manager"
          >
            <div className="relative flex items-start justify-between gap-3 border-b border-border/70 px-3.5 py-3">
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/75 to-transparent" />
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded border border-primary/25 bg-primary/10 text-primary">
                  <UploadSimple className="size-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">Uploads</div>
                    {summary.allSettled && !summary.hasFailures ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle className="h-3.5 w-3.5" aria-hidden />
                        <span>Done</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {activeTask?.label ? (
                      <span className="block truncate">
                        {activeTask.stage === "paused"
                          ? "Paused:"
                          : "Uploading:"}{" "}
                        <span className="text-foreground">
                          {activeTask.label}
                        </span>
                      </span>
                    ) : (
                      <span>
                        {summary.uploadedFiles} / {summary.totalFiles} files
                        uploaded
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={minimized ? "Expand uploads" : "Minimize uploads"}
                  onClick={() => setMinimized((v) => !v)}
                >
                  {minimized ? (
                    <CaretUp aria-hidden />
                  ) : (
                    <CaretDown aria-hidden />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={
                    summary.hasInterruptibleUploads
                      ? "Cancel all uploads"
                      : "Dismiss uploads"
                  }
                  onClick={dismiss}
                  disabled={isCancellingAll}
                >
                  <X aria-hidden />
                </Button>
              </div>
            </div>

            <div className="px-3.5 py-3">
              <div className="space-y-2">
                <Progress
                  value={summary.overallPercent}
                  aria-label="Overall upload progress"
                />
                <div className="text-center text-xs font-medium text-muted-foreground">
                  {summary.uploadedFiles} / {summary.totalFiles} files uploaded
                </div>
              </div>

              {!minimized ? (
                <div className="mt-3 max-h-[40vh] divide-y divide-border/50 overflow-auto rounded-lg border border-border/70 bg-background/25">
                  {tasks.map((task) => {
                    const percent =
                      typeof task.progress === "number"
                        ? Math.min(100, Math.max(0, Math.round(task.progress)))
                        : undefined;

                    const stageLabel = (() => {
                      switch (task.stage) {
                        case "queued":
                          return "Preparing";
                        case "uploading":
                          return percent != null ? `${percent}%` : "Uploading";
                        case "paused":
                          return "Paused";
                        case "finalizing":
                          return "Finalizing";
                        case "indexing":
                          return "Indexing";
                        case "uploaded":
                          return "Uploaded";
                        case "converting":
                          return "Processing";
                        case "completed":
                          return "Done";
                        case "failed":
                          return "Failed";
                        case "cancelled":
                          return "Cancelled";
                        default:
                          return "Uploading";
                      }
                    })();

                    const canPause =
                      task.stage === "uploading" &&
                      controllersRef.current.has(task.id);
                    const canResume =
                      task.stage === "paused" &&
                      controllersRef.current.has(task.id);
                    const canCancel =
                      (task.stage === "queued" ||
                        task.stage === "uploading" ||
                        task.stage === "paused") &&
                      (controllersRef.current.has(task.id) ||
                        uploadQueueRef.current.some(
                          (q) => q.taskId === task.id,
                        ));
                    const showControls =
                      task.stage === "queued" ||
                      task.stage === "uploading" ||
                      task.stage === "paused";

                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "p-2.5 transition-colors",
                          task.stage === "failed"
                            ? "bg-destructive/[0.035]"
                            : task.warning
                              ? "bg-amber-500/[0.035]"
                              : null,
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-xs font-medium">
                                {task.label}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                {task.warning ? (
                                  <Warning
                                    className="h-3.5 w-3.5 text-amber-500"
                                    aria-hidden
                                  />
                                ) : null}
                                {/* Closes the sequence: the bar fills, then the
                                    tick fades in to mark the task finished
                                    rather than snapping into place. */}
                                {task.stage === "completed" ? (
                                  <motion.span
                                    className="flex text-primary"
                                    {...fadeIn}
                                  >
                                    <CheckCircle
                                      className="h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                  </motion.span>
                                ) : null}
                                <span>{stageLabel}</span>
                              </div>
                            </div>

                            <div className="mt-1">
                              {percent != null ? (
                                <Progress value={percent} />
                              ) : task.stage === "uploading" ||
                                task.stage === "finalizing" ? (
                                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                  <motion.div
                                    className="h-2 w-1/3 rounded-full bg-primary"
                                    initial={{ x: "-100%" }}
                                    animate={{ x: ["-100%", "300%"] }}
                                    transition={{
                                      duration: 1.2,
                                      ease: "easeInOut",
                                      repeat: Infinity,
                                    }}
                                  />
                                </div>
                              ) : null}
                            </div>

                            {task.message ? (
                              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                                {task.message}
                              </div>
                            ) : null}
                            {task.stage === "failed" && task.errorMessage ? (
                              <div className="mt-1 truncate text-[11px] text-destructive">
                                {task.errorMessage}
                              </div>
                            ) : null}
                          </div>

                          {showControls ? (
                            <div className="flex items-center gap-1">
                              {task.stage === "uploading" ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Pause upload"
                                  onClick={() => pauseTask(task.id)}
                                  disabled={!canPause}
                                >
                                  <Pause aria-hidden />
                                </Button>
                              ) : null}

                              {task.stage === "paused" ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Resume upload"
                                  onClick={() => resumeTask(task.id)}
                                  disabled={!canResume}
                                >
                                  <Play aria-hidden />
                                </Button>
                              ) : null}

                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label="Stop upload"
                                onClick={() => cancelTask(task.id)}
                                disabled={!canCancel}
                              >
                                <X aria-hidden />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </UploadQueueContext.Provider>
  );
};
