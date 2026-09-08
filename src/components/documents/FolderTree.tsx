"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretRight, FolderSimple as Folder } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { heightExpand, layoutTween } from "@/lib/motion";
import { cn } from "@/lib/utils";

type FolderTreeItem = {
  id: string;
  name: string | null;
  parent_folder_id: string | null;
};

type FolderTreeDragPayload =
  { kind: "doc"; id: string } | { kind: "folder"; id: string };

type FolderTreeMode = "readonly" | "manage";

export const FOLDER_TREE_DRAG_MIME = "application/x-dockosha-folder-tree";
const MAX_VISIBLE_TREE_DEPTH = 2048;

const parseDragPayload = (dt: DataTransfer): FolderTreeDragPayload | null => {
  try {
    const raw = dt.getData(FOLDER_TREE_DRAG_MIME) || dt.getData("text/plain");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as { kind?: unknown; id?: unknown };
    if (
      (obj.kind !== "doc" && obj.kind !== "folder") ||
      typeof obj.id !== "string"
    ) {
      return null;
    }
    return { kind: obj.kind, id: obj.id };
  } catch {
    return null;
  }
};

const toFolderLabel = (name: string | null | undefined): string =>
  (name || "").trim() || "Untitled folder";

type FolderTreeProps = {
  folders: FolderTreeItem[];
  currentFolderId: string; // "root" or folder UUID
  rootLabel: string;
  docCountByFolderId?: Map<string, number>;
  mode?: FolderTreeMode;
  className?: string;
  onSelectFolder: (folderId: string | null) => void;
  /** Persist expanded folder nodes in sessionStorage (per tab). */
  expandedStorageKey?: string;
  /** Enable drag+drop for folder nodes (docs can be dropped from outside). */
  enableDnD?: boolean;
  /** Called when something is dropped on a folder (or root). */
  onDropPayload?: (
    targetFolderId: string | null,
    payload: FolderTreeDragPayload,
  ) => void;
  /** Optional per-drop validation. Return false to block drops. */
  canDropPayload?: (
    targetFolderId: string | null,
    payload: FolderTreeDragPayload,
  ) => boolean;
};

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  currentFolderId,
  rootLabel,
  docCountByFolderId,
  mode = "readonly",
  className,
  onSelectFolder,
  expandedStorageKey,
  enableDnD = false,
  onDropPayload,
  canDropPayload,
}) => {
  const folderMap = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, FolderTreeItem[]>();
    for (const f of folders) {
      const p = f.parent_folder_id ?? null;
      const arr = map.get(p) ?? [];
      arr.push(f);
      map.set(p, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) =>
        toFolderLabel(a.name).localeCompare(toFolderLabel(b.name), undefined, {
          sensitivity: "base",
        }),
      );
      map.set(k, arr);
    }
    return map;
  }, [folders]);

  const getAncestors = useCallback(
    (id: string): string[] => {
      const res: string[] = [];
      const guard = new Set<string>();
      let cur = folderMap.get(id) ?? null;
      while (cur) {
        const parent = cur.parent_folder_id ?? null;
        if (!parent) break;
        if (guard.has(parent)) break;
        guard.add(parent);
        res.push(parent);
        cur = folderMap.get(parent) ?? null;
      }
      return res;
    },
    [folderMap],
  );

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (!expandedStorageKey) return new Set();
    if (typeof window === "undefined") return new Set();
    try {
      const raw = sessionStorage.getItem(expandedStorageKey);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      const ids = parsed.filter((id): id is string => typeof id === "string");
      return new Set(ids);
    } catch {
      return new Set();
    }
  });

  // Hydrate expanded state after SSR/hydration, and when the storage key changes.
  useEffect(() => {
    if (!expandedStorageKey) return;
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(expandedStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const ids = parsed.filter((id): id is string => typeof id === "string");
      if (ids.length === 0) return;
      setExpanded(new Set(ids));
    } catch {
      // ignore
    }
  }, [expandedStorageKey]);

  // Persist expanded nodes for back/forward navigations.
  useEffect(() => {
    if (!expandedStorageKey) return;
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        expandedStorageKey,
        JSON.stringify(Array.from(expanded)),
      );
    } catch {
      // ignore
    }
  }, [expandedStorageKey, expanded]);

  useEffect(() => {
    if (!currentFolderId || currentFolderId === "root") return;
    const ancestors = getAncestors(currentFolderId);
    setExpanded((prev) => {
      const next = new Set(prev);
      ancestors.forEach((id) => next.add(id));
      // Also expand the current folder itself if it has children.
      if ((childrenByParent.get(currentFolderId) ?? []).length > 0) {
        next.add(currentFolderId);
      }
      return next;
    });
  }, [childrenByParent, currentFolderId, getAncestors]);

  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const handleSelect = useCallback(
    (id: string | null) => {
      onSelectFolder(id);
    },
    [onSelectFolder],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragStartFolder = useCallback(
    (ev: React.DragEvent, folderId: string) => {
      if (!enableDnD || mode !== "manage") return;
      try {
        ev.dataTransfer.setData(
          FOLDER_TREE_DRAG_MIME,
          JSON.stringify({ kind: "folder", id: folderId }),
        );
        ev.dataTransfer.effectAllowed = "move";
      } catch {
        // ignore
      }
    },
    [enableDnD, mode],
  );

  const handleDragOver = useCallback(
    (ev: React.DragEvent, targetId: string | null) => {
      if (!enableDnD || mode !== "manage") return;
      if (!Array.from(ev.dataTransfer.types).includes(FOLDER_TREE_DRAG_MIME)) {
        return;
      }
      const payload = parseDragPayload(ev.dataTransfer);
      if (
        typeof canDropPayload === "function" &&
        payload &&
        !canDropPayload(targetId, payload)
      ) {
        return;
      }
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      setDragOverTarget(targetId ?? "root");
    },
    [canDropPayload, enableDnD, mode],
  );

  const handleDrop = useCallback(
    (ev: React.DragEvent, targetId: string | null) => {
      if (!enableDnD || mode !== "manage") return;
      const payload = parseDragPayload(ev.dataTransfer);
      setDragOverTarget(null);
      if (!payload) return;
      if (
        typeof canDropPayload === "function" &&
        !canDropPayload(targetId, payload)
      ) {
        return;
      }
      ev.preventDefault();
      onDropPayload?.(targetId, payload);
    },
    [canDropPayload, enableDnD, mode, onDropPayload],
  );

  const visibleRows = useMemo(() => {
    type VisibleRow = { folder: FolderTreeItem; depth: number };
    type PendingRow = {
      folder: FolderTreeItem;
      depth: number;
      lineage: Set<string>;
    };

    const rows: VisibleRow[] = [];
    const stack: PendingRow[] = [];
    const rootFolders = childrenByParent.get(null) ?? [];

    for (let index = rootFolders.length - 1; index >= 0; index -= 1) {
      const folder = rootFolders[index]!;
      stack.push({
        folder,
        depth: 0,
        lineage: new Set([folder.id]),
      });
    }

    while (stack.length > 0) {
      const current = stack.pop()!;
      rows.push({ folder: current.folder, depth: current.depth });

      const children = childrenByParent.get(current.folder.id) ?? [];
      if (children.length === 0 || !expanded.has(current.folder.id)) {
        continue;
      }

      if (current.depth >= MAX_VISIBLE_TREE_DEPTH) {
        console.warn(
          "[FolderTree] Stopped rendering an excessively deep folder branch.",
          { folderId: current.folder.id, depth: current.depth },
        );
        continue;
      }

      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]!;
        if (current.lineage.has(child.id)) {
          console.warn(
            "[FolderTree] Skipped cyclic folder branch while rendering.",
            {
              folderId: child.id,
              parentFolderId: current.folder.id,
            },
          );
          continue;
        }

        const nextLineage = new Set(current.lineage);
        nextLineage.add(child.id);
        stack.push({
          folder: child,
          depth: current.depth + 1,
          lineage: nextLineage,
        });
      }
    }

    return rows;
  }, [childrenByParent, expanded]);

  const rootDragOver =
    enableDnD && mode === "manage" && dragOverTarget === "root";
  const rootDocCount = docCountByFolderId?.get("root") ?? 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className={cn(
          "group flex items-center rounded px-2 py-1.5 transition-colors",
          rootDragOver
            ? "bg-primary/10 ring-1 ring-primary/40"
            : currentFolderId === "root"
              ? "bg-primary/[0.08] text-primary shadow-[inset_2px_0_0_var(--primary)]"
              : "text-muted-foreground hover:bg-primary/[0.045] hover:text-foreground",
        )}
        onDragOver={(ev) => handleDragOver(ev, null)}
        onDragLeave={() => setDragOverTarget(null)}
        onDrop={(ev) => handleDrop(ev, null)}
      >
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium outline-none",
            "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
          onClick={() => handleSelect(null)}
          aria-current={currentFolderId === "root" ? "page" : undefined}
        >
          <Folder
            className={cn(
              "size-4 shrink-0 transition-colors",
              currentFolderId === "root"
                ? "text-primary"
                : "text-muted-foreground/70 group-hover:text-foreground",
              rootDragOver && "text-primary",
            )}
            weight={currentFolderId === "root" ? "fill" : "regular"}
            aria-hidden
          />
          <span className="min-w-0 truncate" title={rootLabel}>
            {rootLabel}
          </span>
          {docCountByFolderId && rootDocCount > 0 ? (
            <span
              aria-hidden="true"
              className={cn(
                "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                currentFolderId === "root"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted/60 text-muted-foreground group-hover:bg-background/80",
              )}
            >
              {rootDocCount}
            </span>
          ) : null}
        </button>
      </div>
      <div className="space-y-0.5">
        {/* `initial={false}` is required: the rows present on first paint must
            appear already open. Only rows revealed or hidden by a subsequent
            expand/collapse animate, so the movement always traces a click. */}
        <AnimatePresence initial={false}>
          {visibleRows.map(({ folder, depth }) => {
            const label = toFolderLabel(folder.name);
            const childCount = (childrenByParent.get(folder.id) ?? []).length;
            const hasChildren = childCount > 0;
            const isExpanded = expanded.has(folder.id);
            const isSelected = currentFolderId === folder.id;
            const docCount = docCountByFolderId?.get(folder.id) ?? 0;
            const isDragOver =
              enableDnD && mode === "manage" && dragOverTarget === folder.id;

            return (
              <motion.div key={folder.id} {...heightExpand}>
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded px-2 py-1 transition-colors",
                    isDragOver
                      ? "bg-primary/10 ring-1 ring-primary/40"
                      : isSelected
                        ? "bg-primary/[0.08] text-primary shadow-[inset_2px_0_0_var(--primary)]"
                        : "text-muted-foreground hover:bg-primary/[0.045] hover:text-foreground",
                  )}
                  style={{ paddingLeft: 8 + depth * 16 }}
                  onDragOver={(ev) => handleDragOver(ev, folder.id)}
                  onDragLeave={() => setDragOverTarget(null)}
                  onDrop={(ev) => handleDrop(ev, folder.id)}
                >
                  {hasChildren ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6 shrink-0 hover:bg-transparent",
                        isSelected
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                      aria-label={
                        isExpanded ? `Collapse ${label}` : `Expand ${label}`
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(folder.id);
                      }}
                    >
                      <motion.span
                        className="flex"
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={layoutTween}
                      >
                        <CaretRight className="size-3.5" aria-hidden />
                      </motion.span>
                    </Button>
                  ) : (
                    <div className="h-6 w-6 shrink-0" aria-hidden />
                  )}
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium outline-none",
                      "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    )}
                    onClick={() => handleSelect(folder.id)}
                    draggable={enableDnD && mode === "manage"}
                    onDragStart={(ev) => handleDragStartFolder(ev, folder.id)}
                    aria-current={isSelected ? "page" : undefined}
                  >
                    <Folder
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        isSelected
                          ? "text-primary"
                          : "text-muted-foreground/70 group-hover:text-foreground",
                        isDragOver && "text-primary",
                      )}
                      weight={isSelected ? "fill" : "regular"}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate" title={label}>
                      {label}
                    </span>
                    {docCountByFolderId && docCount > 0 ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                          isSelected
                            ? "bg-primary/10 text-primary"
                            : "bg-muted/60 text-muted-foreground group-hover:bg-background/80",
                        )}
                      >
                        {docCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
