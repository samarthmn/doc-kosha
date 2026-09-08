"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  FileText,
  Files,
  FolderOpen,
  FolderSimple,
  UploadSimple,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUploadQueue } from "@/components/providers/UploadQueueProvider";
import { filterSupportedFiles } from "@/components/documents/uploadHelpers";
import { showError, showInfo } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { ALL_SUPPORTED_EXTENSIONS } from "@/lib/constants";
import type { Tables } from "@/types/generated/supabase";

type Folder = Tables<"folders">;
type ConflictAction = "replace" | "keep";

type ConflictRow = {
  clientFileKey: string;
  existingDocumentId: string;
  existingTitle: string;
  destinationFolderId: string | null;
  action: ConflictAction;
};

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: Folder[];
  workspaceId: string | null;
  initialFiles?: File[];
  defaultFolderId?: string | null; // null/root allowed
  onUploaded?: () => void; // refresh callback
  dataRoomId?: string | null;
  rootLabel?: string;
  canUpload: boolean;
  onLimitReached?: () => void;
  storageUsageLabel?: string;
  planName?: string;
  managePlanUrl?: string;
  allowedFileExtensions?: readonly string[];
  allowedFileTypesLabel?: string;
}

const defaultAllowedExtensions = new Set<string>(
  ALL_SUPPORTED_EXTENSIONS as readonly string[],
);

const UploadModal: React.FC<UploadModalProps> = ({
  open,
  onOpenChange,
  folders,
  workspaceId,
  initialFiles,
  defaultFolderId,
  onUploaded,
  dataRoomId,
  rootLabel = "My Documents",
  canUpload,
  onLimitReached,
  storageUsageLabel,
  planName,
  managePlanUrl,
  allowedFileExtensions,
  allowedFileTypesLabel,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { queueUploads } = useUploadQueue();
  const [selectedFolder, setSelectedFolder] = useState<string>(
    defaultFolderId || "root",
  );
  const [files, setFiles] = useState<File[]>([]);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pickerMode, setPickerMode] = useState<"files" | "folder">("files");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [conflictRows, setConflictRows] = useState<ConflictRow[]>([]);
  const [showConflictReview, setShowConflictReview] = useState(false);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(
    null,
  );
  const [pendingBaseFolderId, setPendingBaseFolderId] = useState<string | null>(
    null,
  );
  const allowedExtensions = useMemo(
    () =>
      allowedFileExtensions?.length
        ? new Set<string>(allowedFileExtensions)
        : defaultAllowedExtensions,
    [allowedFileExtensions],
  );

  type TreeNode = { folders: Map<string, TreeNode>; files: string[] };

  const previewTree = useMemo(() => {
    const root: TreeNode = { folders: new Map(), files: [] };
    files.forEach((f) => {
      const rel = (f as unknown as { webkitRelativePath?: string })
        .webkitRelativePath;
      const parts = rel ? rel.split("/").filter(Boolean) : [];
      const fileName = f.name;
      const dirParts = parts.length ? parts.slice(0, -1) : [];
      let cur = root;
      dirParts.forEach((seg) => {
        let child = cur.folders.get(seg);
        if (!child) {
          child = { folders: new Map(), files: [] };
          cur.folders.set(seg, child);
        }
        cur = child;
      });
      cur.files.push(fileName);
    });
    return root;
  }, [files]);

  const renderPreview = useCallback(
    (
      node: TreeNode,
      name: string,
      depth: number,
      parentPath = "",
    ): React.ReactElement[] => {
      const items: React.ReactElement[] = [];
      // Key by accumulated path so same-named folders under different parents
      // never collide, and keys stay stable across renders.
      const path = parentPath ? `${parentPath}/${name}` : name;
      if (name) {
        items.push(
          <div
            key={`hdr_${path}`}
            className="flex items-center gap-2 text-sm font-medium text-foreground"
            style={{ paddingLeft: depth * 12 }}
          >
            <FolderSimple
              className="size-4 shrink-0 text-primary"
              aria-hidden
            />
            {name}
          </div>,
        );
      }
      if (node.files.length > 0) {
        items.push(
          <ul
            key={`files_${path}`}
            className="space-y-0.5 text-sm text-muted-foreground"
            style={{ paddingLeft: (depth + 1) * 12 }}
          >
            {node.files.map((fn, i) => (
              <li
                key={`f_${path}/${i}_${fn}`}
                className="flex items-center gap-2 leading-6"
              >
                <FileText className="size-3.5 shrink-0" aria-hidden />
                {/* truncate must sit on the text child: on the flex container
                    itself `overflow:hidden` clips hard with no ellipsis. */}
                <span className="truncate">{fn}</span>
              </li>
            ))}
          </ul>,
        );
      }
      node.folders.forEach((child, childName) => {
        items.push(
          ...renderPreview(child, childName, depth + (name ? 1 : 0), path),
        );
      });
      return items;
    },
    [],
  );

  const onFilesPicked = useCallback(
    (picked: File[] | FileList | null) => {
      if (!picked) return;
      const next = filterSupportedFiles(
        picked,
        allowedExtensions,
        allowedFileTypesLabel,
      );
      if (next.length === 0) return;
      setFiles((prev) => [...prev, ...next]);
    },
    [allowedExtensions, allowedFileTypesLabel],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
      if (!canUpload) {
        onLimitReached?.();
        return;
      }
      const dt = e.dataTransfer;
      const collected: File[] = [];
      const items = dt.items;

      const isFileEntry = (
        entry: FileSystemEntry,
      ): entry is FileSystemFileEntry => entry.isFile === true;
      const isDirectoryEntry = (
        entry: FileSystemEntry,
      ): entry is FileSystemDirectoryEntry => entry.isDirectory === true;

      if (items && items.length) {
        const traverse = async (
          entry: FileSystemEntry | null,
          path: string,
        ): Promise<void> => {
          if (!entry) return;
          if (isFileEntry(entry)) {
            await new Promise<void>((resolve) => {
              entry.file((f: File) => {
                try {
                  const rel = path ? `${path}/${f.name}` : f.name;
                  Object.defineProperty(f, "webkitRelativePath", {
                    value: rel,
                  });
                } catch (err) {
                  // Best-effort; some browsers may block redefining this property
                  console.debug("Unable to set relative path on file", err);
                }
                collected.push(f);
                resolve();
              });
            });
          } else if (isDirectoryEntry(entry)) {
            const reader = entry.createReader();
            await new Promise<void>((resolve) => {
              const readBatch = () => {
                reader.readEntries(async (entries: FileSystemEntry[]) => {
                  if (!entries || entries.length === 0) return resolve();
                  for (const ent of entries) {
                    await traverse(
                      ent,
                      path ? `${path}/${entry.name}` : entry.name,
                    );
                  }
                  readBatch();
                });
              };
              readBatch();
            });
          }
        };
        const entries: FileSystemEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i] as DataTransferItem & {
            webkitGetAsEntry?: () => FileSystemEntry | null;
          };
          const entry =
            typeof it.webkitGetAsEntry === "function"
              ? it.webkitGetAsEntry()
              : null;
          if (entry) entries.push(entry);
        }
        for (const entry of entries) {
          await traverse(entry, "");
        }
        onFilesPicked(collected);
      } else {
        onFilesPicked(dt.files);
      }
    },
    [onFilesPicked, canUpload, onLimitReached],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  // Dragging across the zone's children fires `dragleave` on every boundary
  // crossed, which would strobe the highlight. Only the pointer actually
  // leaving the zone's own bounds counts.
  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setIsDraggingOver(false);
  }, []);

  // Reset selected folder to the provided default (current folder) when
  // workspace or defaultFolderId changes or when the modal opens.
  React.useEffect(() => {
    if (!open) return;
    setSelectedFolder(defaultFolderId || "root");
  }, [workspaceId, defaultFolderId, open]);

  React.useEffect(() => {
    if (!open) return;
    if (!initialFiles || initialFiles.length === 0) return;
    setFiles(
      filterSupportedFiles(
        initialFiles,
        allowedExtensions,
        allowedFileTypesLabel,
      ),
    );
  }, [allowedExtensions, allowedFileTypesLabel, open, initialFiles]);

  const startUpload = async () => {
    if (!canUpload) {
      onLimitReached?.();
      return;
    }
    let wsId = workspaceId;
    if (!wsId) {
      const { data: wss } = await supabase
        .from("workspaces")
        .select("id")
        .limit(1);
      wsId = wss?.[0]?.id ?? null;
    }
    if (!wsId) {
      showError("No workspace found for upload");
      return;
    }
    if (files.length === 0) {
      onOpenChange(false);
      return;
    }
    setIsUploading(true);

    try {
      const baseSelectedFolderId =
        selectedFolder && selectedFolder !== "root" ? selectedFolder : null;

      const filePayload = files.map((file) => {
        const relativePath =
          (file as unknown as { webkitRelativePath?: string })
            .webkitRelativePath || file.name;
        return {
          clientFileKey: relativePath,
          relativePath,
          filename: file.name,
        };
      });

      const precheckRes = await fetch("/api/documents/versioning/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId: wsId,
          dataRoomId: dataRoomId ?? null,
          baseFolderId: baseSelectedFolderId,
          files: filePayload,
        }),
      });

      if (!precheckRes.ok) {
        const payload = (await precheckRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        showError(payload?.error ?? "Failed to review duplicate filenames");
        return;
      }

      const precheckPayload = (await precheckRes.json()) as {
        conflicts: Array<{
          clientFileKey: string;
          existingDocumentId: string;
          existingTitle: string;
          destinationFolderId: string | null;
        }>;
      };

      if (precheckPayload.conflicts.length > 0) {
        setConflictRows(
          precheckPayload.conflicts.map((conflict) => ({
            ...conflict,
            action: "replace",
          })),
        );
        setPendingWorkspaceId(wsId);
        setPendingBaseFolderId(baseSelectedFolderId);
        setShowConflictReview(true);
        return;
      }

      const queued = queueUploads({
        files,
        workspaceId: wsId,
        baseFolderId: baseSelectedFolderId,
        dataRoomId,
        // Conflicts were already checked above (none found); an empty mapping
        // tells the provider to skip its redundant safety-net precheck.
        replaceTargets: {},
      });

      onOpenChange(false);
      setFiles([]);

      void queued
        .then(() => onUploaded?.())
        .catch((err) => {
          console.error("[UploadModal] queueUploads failed", err);
          showError("Upload failed to start");
        });
    } catch (err) {
      console.error("[UploadModal] upload precheck failed", err);
      showError(
        "Could not start the upload. Check your connection and try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const applyConflictDecisionToAll = (action: ConflictAction) => {
    setConflictRows((prev) => prev.map((row) => ({ ...row, action })));
  };

  const continueWithConflictDecisions = async () => {
    if (!pendingWorkspaceId) {
      showError("Workspace context missing for conflict resolution");
      return;
    }

    const keepSet = new Set(
      conflictRows
        .filter((row) => row.action === "keep")
        .map((row) => row.clientFileKey),
    );
    const replaceTargets = Object.fromEntries(
      conflictRows
        .filter((row) => row.action === "replace")
        .map((row) => [row.clientFileKey, row.existingDocumentId]),
    ) as Record<string, string>;

    const filesToUpload = files.filter((file) => {
      const key =
        (file as unknown as { webkitRelativePath?: string })
          .webkitRelativePath || file.name;
      return !keepSet.has(key);
    });

    if (filesToUpload.length === 0) {
      showInfo("All conflicting files were kept; nothing to upload.");
      setShowConflictReview(false);
      setConflictRows([]);
      onOpenChange(false);
      setFiles([]);
      return;
    }

    setIsUploading(true);
    try {
      const queued = queueUploads({
        files: filesToUpload,
        workspaceId: pendingWorkspaceId,
        baseFolderId: pendingBaseFolderId,
        dataRoomId,
        replaceTargets,
      });

      setShowConflictReview(false);
      setConflictRows([]);
      onOpenChange(false);
      setFiles([]);

      if (keepSet.size > 0) {
        showInfo(
          `${keepSet.size} conflicting file${keepSet.size === 1 ? " was" : "s were"} skipped`,
        );
      }

      void queued
        .then(() => onUploaded?.())
        .catch((err) => {
          console.error("[UploadModal] queueUploads failed", err);
          showError("Upload failed to start");
        });
    } catch (err) {
      console.error("[UploadModal] conflict continuation failed", err);
      showError(
        "Could not start the upload. Check your connection and try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Build accept attribute
  const accept = Array.from(allowedExtensions)
    .map((e) => `.${e}`)
    .join(",");

  useEffect(() => {
    if (open && !canUpload) {
      onLimitReached?.();
      onOpenChange(false);
    }
  }, [open, canUpload, onLimitReached, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ph-no-capture max-w-xl border-border bg-[var(--dk-surface-overlay)]"
        data-ph-no-capture
        data-guide="documents-upload-modal"
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
        <DialogHeader>
          <div className="mb-2 flex size-9 items-center justify-center rounded border border-primary/25 bg-primary/10 text-primary">
            <UploadSimple className="size-4.5" aria-hidden />
          </div>
          <DialogTitle className="text-[1.1rem]">Upload files</DialogTitle>
          <DialogDescription>
            Files will be uploaded to{" "}
            <span className="font-medium text-foreground">
              {selectedFolder && selectedFolder !== "root"
                ? folders.find((x) => x.id === selectedFolder)?.name ||
                  "Current folder"
                : rootLabel}
            </span>
            . Folder structure is preserved when uploading a folder.
          </DialogDescription>
          {storageUsageLabel ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {planName
                ? `${planName} included storage usage:`
                : "Included storage usage:"}{" "}
              {storageUsageLabel}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Supported uploads:{" "}
            {allowedFileTypesLabel ??
              "PDF, Office, spreadsheet, Markdown, image, video, and audio files"}
          </p>
          {managePlanUrl ? (
            <p className="text-xs text-muted-foreground">
              Need more space?{" "}
              <Link
                href={managePlanUrl}
                className="text-primary underline-offset-4 hover:underline"
              >
                Manage plan
              </Link>
            </p>
          ) : null}
        </DialogHeader>

        <div className="py-1">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            data-dragging={isDraggingOver ? "true" : undefined}
            className={cn(
              "mb-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-primary/40 bg-primary/[0.025] p-6 text-center transition-colors hover:border-primary/65 hover:bg-primary/[0.045] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              // The only sustained loop in the app UI, and the one motion not
              // triggered by a discrete action: it mirrors a drag that is
              // literally still happening, and stops the moment it ends.
              isDraggingOver && "dk-dropzone-pulse bg-primary/[0.06]",
            )}
            data-guide="documents-upload-dropzone"
            onClick={(e) => {
              if (e.target !== e.currentTarget) return;
              if (pickerMode === "files") filesInputRef.current?.click();
              else folderInputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              if (pickerMode === "files") filesInputRef.current?.click();
              else folderInputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            aria-label="Drag and drop files or browse"
          >
            <div className="mb-3 flex size-10 items-center justify-center rounded border border-border/70 bg-card/60 text-primary">
              <UploadSimple className="size-5" aria-hidden />
            </div>
            <div className="text-sm font-medium">Drag and drop files here</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {`or click to browse (${pickerMode === "files" ? "files" : "folder"})`}
            </div>
            <Input
              ref={filesInputRef}
              type="file"
              className="sr-only"
              multiple
              onChange={(e) => onFilesPicked(e.target.files)}
              aria-hidden
              tabIndex={-1}
              accept={accept}
            />
            <Input
              ref={folderInputRef}
              type="file"
              className="sr-only"
              onChange={(e) => onFilesPicked(e.target.files)}
              aria-hidden
              tabIndex={-1}
              accept={accept}
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore non-standard but supported by Chromium/WebKit
              webkitdirectory="true"
              directory="true"
            />
          </div>

          <div
            className="mb-3 flex flex-wrap items-center justify-center gap-2"
            data-guide="documents-upload-source-buttons"
          >
            <Button
              variant="secondary"
              size="sm"
              aria-label="Choose files"
              onClick={() => {
                setPickerMode("files");
                filesInputRef.current?.click();
              }}
              disabled={isUploading}
            >
              <Files aria-hidden />
              Choose files
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Choose folder"
              onClick={() => {
                setPickerMode("folder");
                folderInputRef.current?.click();
              }}
              disabled={isUploading}
            >
              <FolderOpen aria-hidden />
              Choose folder
            </Button>
          </div>

          {files.length > 0 && (
            <div className="mb-3 max-h-56 space-y-1 overflow-auto rounded-lg border border-border/70 bg-background/30 px-3 py-2.5">
              {renderPreview(previewTree, "", 0)}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (isUploading) return;
              setFiles([]);
              onOpenChange(false);
            }}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void startUpload()}
            disabled={isUploading || files.length === 0}
            data-guide="documents-upload-start"
          >
            <UploadSimple aria-hidden />
            Start Upload
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={showConflictReview} onOpenChange={setShowConflictReview}>
        <DialogContent
          className="ph-no-capture max-w-2xl overflow-hidden border-border bg-[var(--dk-surface-overlay)]"
          data-ph-no-capture
        >
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
          <DialogHeader>
            <DialogTitle>Review duplicate filenames</DialogTitle>
            <DialogDescription>
              Matching files in this destination can be replaced or skipped.
              Replace is selected by default.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyConflictDecisionToAll("replace")}
              >
                Apply Replace to all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyConflictDecisionToAll("keep")}
              >
                Apply Keep Existing to all
              </Button>
            </div>

            <div className="max-h-80 divide-y divide-border/50 overflow-auto rounded-lg border border-border/70 bg-background/25">
              {conflictRows.map((row) => (
                <div
                  key={row.clientFileKey}
                  className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.clientFileKey}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Existing: {row.existingTitle}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={row.action === "replace" ? "default" : "outline"}
                      onClick={() =>
                        setConflictRows((prev) =>
                          prev.map((entry) =>
                            entry.clientFileKey === row.clientFileKey
                              ? { ...entry, action: "replace" }
                              : entry,
                          ),
                        )
                      }
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={row.action === "keep" ? "default" : "outline"}
                      onClick={() =>
                        setConflictRows((prev) =>
                          prev.map((entry) =>
                            entry.clientFileKey === row.clientFileKey
                              ? { ...entry, action: "keep" }
                              : entry,
                          ),
                        )
                      }
                    >
                      Keep Existing
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConflictReview(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void continueWithConflictDecisions()}
              disabled={isUploading}
            >
              Continue upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default UploadModal;
