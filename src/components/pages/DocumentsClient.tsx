"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buttonVariants, Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Dropdown menus not used now
// No folder switcher; list view only
// import { Badge } from "@/components/ui/badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Card, CardContent } from "@/components/ui/card";
import UploadModal from "@/components/documents/UploadModal";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { filterSupportedFiles } from "@/components/documents/uploadHelpers";
import { resolvePermissionWithRetry } from "@/lib/permissionCheck";
import { ALL_SUPPORTED_EXTENSIONS } from "@/lib/constants";
import { describeFileType } from "@/lib/fileTypes";
import type { Tables } from "@/types/generated/supabase";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import {
  ArrowsLeftRight,
  ArrowDown,
  ArrowUp,
  CaretRight,
  DotsThree,
  Eye,
  FileText,
  Folder,
  LinkSimple as LinkIcon,
  PencilSimple,
  SpinnerGap,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";

import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  FolderTree,
  FOLDER_TREE_DRAG_MIME,
} from "@/components/documents/FolderTree";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StorageKeys } from "@/types/storage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const DOCUMENTS_CONTROL_UPLOAD_EVENT = "documents:open-upload";
const DOCUMENTS_CONTROL_NEW_FOLDER_EVENT = "documents:create-folder";
import { showError, showSuccess } from "@/lib/toast";
import { formatStorage } from "@/modules/billing/entitlements";
import {
  getDocumentsClientCacheKey,
  readDocumentsClientCache,
  writeDocumentsClientCache,
} from "@/modules/documents/clientCache";
import {
  parseDeleteDocumentSelectionResponse,
  type DeleteDocumentSelectionSuccess,
} from "@/modules/documents/deleteSelectionClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDocumentsTableRows,
  type DocumentType,
  type FolderType,
  type SortColumn,
  type SortDirection,
} from "@/hooks/useDocumentsTableRows";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { useRecentlyAddedRows } from "@/hooks/useRecentlyAddedRows";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatFileSize } from "@/lib/format";

const formatRelativeDate = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  const now = new Date();
  const startOf = (dt: Date) =>
    new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diffDays = Math.floor(
    (startOf(now).getTime() - startOf(d).getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  return d.toLocaleDateString();
};

type DocumentsClientScope =
  | { kind: "workspace" }
  | { kind: "dataRoom"; dataRoomId: string; workspaceId: string };

type EditPermissionState = "checking" | "allowed" | "denied" | "error";

const getDocumentsEmptyStateDescription = (
  editPermissionState: EditPermissionState,
): string => {
  if (editPermissionState === "checking") return "Checking editing access…";
  if (editPermissionState === "error") {
    return "Editing access is unavailable until the permission check succeeds.";
  }
  if (editPermissionState === "allowed") {
    return "Upload your first document to get started.";
  }
  return "Viewer access: read-only.";
};

interface DocumentsClientProps {
  scope?: DocumentsClientScope;
  basePath?: string;
  title?: string;
  subtitle?: string;
  rootBreadcrumbLabel?: string;
  enableRowLinks?: boolean;
  controlId?: string;
  showHeader?: boolean;
  className?: string;
}

const DocumentsClient: React.FC<DocumentsClientProps> = ({
  scope = { kind: "workspace" },
  basePath = "/documents",
  title = "Documents",
  subtitle = "Manage & share your documents securely",
  rootBreadcrumbLabel = "My Documents",
  enableRowLinks = true,
  controlId,
  showHeader = true,
  className,
}) => {
  const scopeKind = scope.kind;
  const dataRoomId = scopeKind === "dataRoom" ? scope.dataRoomId : null;
  const lockedWorkspaceId = scopeKind === "dataRoom" ? scope.workspaceId : null;
  const normalizedBasePath =
    basePath && basePath !== "/"
      ? basePath.replace(/\/+$/, "") || "/documents"
      : basePath || "/documents";
  const viewBasePath = `${normalizedBasePath}/view`;
  const router = useRouter();
  const pathname = usePathname();
  const pathSegs = useMemo(
    () => pathname.split("?")[0].split("/").filter(Boolean),
    [pathname],
  );
  const docIndex = useMemo(() => pathSegs.indexOf("documents"), [pathSegs]);
  const folderSegs = useMemo(
    () => (docIndex >= 0 ? pathSegs.slice(docIndex + 1) : []),
    [docIndex, pathSegs],
  );
  const searchParams = useSearchParams();

  const paramFolder = (folderSegs[folderSegs.length - 1] || "root").toString();

  const [currentFolder, setCurrentFolder] = useState<string>(paramFolder);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const documentsCacheKey = getDocumentsClientCacheKey(dataRoomId);
  const cachedDocumentsState = documentsCacheKey
    ? readDocumentsClientCache(documentsCacheKey)
    : null;
  const hasCachedDocumentsState = Boolean(cachedDocumentsState);

  const [isLoading, setIsLoading] = useState<boolean>(
    () => !hasCachedDocumentsState,
  );
  const [documents, setDocuments] = useState<DocumentType[]>(
    () => cachedDocumentsState?.documents ?? [],
  );
  const [folderList, setFolderList] = useState<FolderType[]>(
    () => cachedDocumentsState?.folders ?? [],
  );
  const [workspaces, setWorkspaces] = useState<Tables<"workspaces">[]>(
    () => cachedDocumentsState?.workspaces ?? [],
  );
  const [docIdToLinkCount, setDocIdToLinkCount] = useState<
    Record<string, number>
  >({});
  const globalWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const setGlobalWorkspaceId = useGlobalStore((s) => s.setCurrentWorkspaceId);
  const [showUpload, setShowUpload] = useState<boolean>(false);
  const [foldersSheetOpen, setFoldersSheetOpen] = useState<boolean>(false);
  const folderPaneId = React.useId();
  // Layout preference only — the persistent folder pane starts open and the
  // collapsed choice survives reloads.
  const [isFolderPaneOpen, setIsFolderPaneOpen] = useState<boolean>(true);
  const [isFolderPanePreferenceLoaded, setIsFolderPanePreferenceLoaded] =
    useState<boolean>(false);
  // The pane is a >=1024px affordance; below that the same control opens a Sheet.
  const [isWideFolderLayout, setIsWideFolderLayout] = useState<boolean>(false);
  const [storageLimitModalOpen, setStorageLimitModalOpen] = useState(false);
  const [pendingOps, setPendingOps] = useState<Set<string>>(() => new Set());
  const [dragOverFolderRowId, setDragOverFolderRowId] = useState<string | null>(
    null,
  );
  const [renameOpen, setRenameOpen] = useState<boolean>(false);
  const [renameTarget, setRenameTarget] = useState<{
    kind: "doc" | "folder";
    id: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [moveOpen, setMoveOpen] = useState<boolean>(false);
  const [moveTarget, setMoveTarget] = useState<{
    kind: "doc" | "folder";
    id: string;
  } | null>(null);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(
    null,
  );
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>("");
  const [stagedUploadFiles, setStagedUploadFiles] = useState<File[]>([]);
  const newFolderInputDesktopRef = React.useRef<HTMLInputElement | null>(null);
  const newFolderInputMobileRef = React.useRef<HTMLInputElement | null>(null);
  const prefetchedPathsRef = React.useRef<Set<string>>(new Set());
  // Read sort parameters directly from URL
  const sortBy: SortColumn | undefined = (() => {
    const sortParam = searchParams.get("sort");
    return ["name", "modified", "size"].includes(sortParam || "")
      ? (sortParam as SortColumn)
      : undefined;
  })();
  const sortDir: SortDirection = (() => {
    const dirParam = searchParams.get("dir");
    return dirParam === "desc" ? "desc" : "asc";
  })();
  const searchQuery: string = (() => {
    const q = searchParams.get("q");
    return (q || "").trim();
  })();
  const searchParamsString = useMemo(
    () => searchParams.toString(),
    [searchParams],
  );
  const lastBrowseHrefStorageKey = useMemo(
    () => `dk-auth-documents-last-browse-href:${normalizedBasePath}`,
    [normalizedBasePath],
  );
  const currentBrowseHref = useMemo(() => {
    if (!pathname) return "";
    return searchParamsString ? `${pathname}?${searchParamsString}` : pathname;
  }, [pathname, searchParamsString]);
  // debounced search
  const [searchText, setSearchText] = useState<string>(searchQuery);
  useEffect(() => {
    setSearchText(searchQuery);
  }, [searchQuery]);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchText !== searchQuery) {
        updateUrlParams({
          q: searchText || null,
          page: "1",
        });
      }
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);
  useEffect(() => {
    if (!currentBrowseHref) return;
    try {
      sessionStorage.setItem(lastBrowseHrefStorageKey, currentBrowseHref);
    } catch {
      // ignore
    }
  }, [currentBrowseHref, lastBrowseHrefStorageKey]);
  const pageSize: number = (() => {
    const raw = searchParams.get("limit");
    const n = raw ? Number(raw) : 20;
    return Number.isFinite(n) && n > 0 ? Math.min(Math.max(5, n), 100) : 20;
  })();
  const pageIndex: number = (() => {
    const raw = searchParams.get("page");
    const n = raw ? Number(raw) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();

  const folderMap = useMemo(
    () => new Map(folderList.map((f) => [f.id, f])),
    [folderList],
  );

  useEffect(() => {
    setCurrentFolder(paramFolder);
  }, [paramFolder]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        StorageKeys.DocumentsFolderPane,
      );
      if (stored === "collapsed") setIsFolderPaneOpen(false);
    } catch {
      // Storage can be unavailable (private mode); keep the default.
    }
    setIsFolderPanePreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!isFolderPanePreferenceLoaded) return;
    try {
      window.localStorage.setItem(
        StorageKeys.DocumentsFolderPane,
        isFolderPaneOpen ? "open" : "collapsed",
      );
    } catch {
      // ignore
    }
  }, [isFolderPaneOpen, isFolderPanePreferenceLoaded]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsWideFolderLayout(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isWideFolderLayout) return;
    setFoldersSheetOpen(false);
  }, [isWideFolderLayout]);

  const handleToggleFolders = useCallback(() => {
    if (isWideFolderLayout) {
      setIsFolderPaneOpen((previous) => !previous);
      return;
    }
    setFoldersSheetOpen(true);
  }, [isWideFolderLayout]);

  // Compute current workspace id from available context
  const resolvedWorkspaceId = useMemo(() => {
    if (lockedWorkspaceId) return lockedWorkspaceId;
    if (globalWorkspaceId) return globalWorkspaceId;
    const byFolder =
      currentFolder !== "root"
        ? (folderMap.get(currentFolder) as FolderType | undefined)?.workspace_id
        : null;
    if (byFolder) return byFolder;
    if (workspaces && workspaces.length > 0) return workspaces[0]!.id;
    const wsFromDocs = new Set((documents || []).map((d) => d.workspace_id));
    const wsFromFolders = new Set(
      (folderList || []).map((f) => f.workspace_id),
    );
    const all = new Set<string>([
      ...Array.from(wsFromDocs),
      ...Array.from(wsFromFolders),
    ] as string[]);
    return all.size === 1 ? Array.from(all)[0]! : null;
  }, [
    lockedWorkspaceId,
    globalWorkspaceId,
    currentFolder,
    folderMap,
    workspaces,
    documents,
    folderList,
  ]);

  const { role: workspaceRole } = useWorkspaceRole(resolvedWorkspaceId);
  const [editPermissionState, setEditPermissionState] =
    useState<EditPermissionState>(resolvedWorkspaceId ? "checking" : "denied");
  const [editPermissionCheckKey, setEditPermissionCheckKey] =
    useState<number>(0);
  const canEditWorkspace = editPermissionState === "allowed";
  const isCheckingEditPermission = editPermissionState === "checking";
  const canManageBilling = workspaceRole === "owner";

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const wsId = resolvedWorkspaceId;
      if (!wsId) {
        if (!cancelled) setEditPermissionState("denied");
        return;
      }

      setEditPermissionState("checking");
      try {
        const resolution = await resolvePermissionWithRetry(
          async () => {
            const {
              data: { user },
              error: authError,
            } = await supabase.auth.getUser();
            if (authError || !user) {
              return {
                data: null,
                error:
                  authError ??
                  new Error("Authentication session is unavailable"),
              };
            }

            if (dataRoomId) {
              return await supabase.rpc("can_edit_data_room", {
                ws: wsId,
                room_id: dataRoomId,
              });
            }

            return await supabase.rpc("can_edit_workspace_documents", {
              ws: wsId,
            });
          },
          { attempts: 3, delayMs: 150 },
        );
        if (cancelled) return;
        setEditPermissionState(resolution.status);
        if (resolution.status === "error") {
          console.error("[DocumentsClient] failed to check edit permission", {
            workspaceId: wsId,
            dataRoomId,
            error: resolution.error,
          });
        }
      } catch (error) {
        console.error("[DocumentsClient] failed to check edit permission", {
          workspaceId: wsId,
          dataRoomId,
          error,
        });
        if (!cancelled) setEditPermissionState("error");
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [dataRoomId, editPermissionCheckKey, resolvedWorkspaceId, supabase]);

  // Keep global current workspace in sync when we can resolve it locally
  useEffect(() => {
    if (resolvedWorkspaceId && resolvedWorkspaceId !== globalWorkspaceId) {
      setGlobalWorkspaceId(resolvedWorkspaceId);
    }
  }, [resolvedWorkspaceId, globalWorkspaceId, setGlobalWorkspaceId]);

  const { plan, limits, usage, refetchUsage } =
    usePlanLimits(resolvedWorkspaceId);
  const maxStorageBytes = limits.maxStorageBytes;
  const storageUsedBytes = usage?.storageUsedBytes ?? 0;
  const isStorageLimited = maxStorageBytes !== null;
  const isStorageAtOrAboveLimit =
    isStorageLimited && maxStorageBytes !== null
      ? storageUsedBytes >= maxStorageBytes
      : false;
  const isStorageOverLimit =
    isStorageLimited && maxStorageBytes !== null
      ? storageUsedBytes > maxStorageBytes
      : false;
  const storageUsageLabel =
    maxStorageBytes === null
      ? `${formatStorage(storageUsedBytes)} used`
      : `${formatStorage(storageUsedBytes)} / ${formatStorage(maxStorageBytes)}`;
  const planManagementUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("tab", "subscription");
    params.set("planPicker", "1");
    params.set("redirect", normalizedBasePath);
    return `/settings?${params.toString()}`;
  }, [normalizedBasePath]);

  const ensureStorageCapacity = useCallback(() => {
    if (isStorageLimited && maxStorageBytes !== null) {
      if (storageUsedBytes >= maxStorageBytes) {
        setStorageLimitModalOpen(true);
        return false;
      }
    }
    return true;
  }, [isStorageLimited, maxStorageBytes, storageUsedBytes]);

  const handleRequestUpload = useCallback(() => {
    if (isCheckingEditPermission) return;
    if (!canEditWorkspace) {
      showError(
        editPermissionState === "error"
          ? "Could not verify editing access. Retry the permission check."
          : "Viewer access: read-only.",
      );
      return;
    }
    if (!ensureStorageCapacity()) return;
    setShowUpload(true);
  }, [
    canEditWorkspace,
    editPermissionState,
    ensureStorageCapacity,
    isCheckingEditPermission,
  ]);

  const refresh = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setIsLoading(true);
      }
      try {
        const documentsQuery = supabase.from("documents").select("*");
        const foldersQuery = supabase.from("folders").select("*");
        if (dataRoomId) {
          documentsQuery.eq("data_room_id", dataRoomId);
          foldersQuery.eq("data_room_id", dataRoomId);
        } else {
          documentsQuery.is("data_room_id", null);
          foldersQuery.is("data_room_id", null);
        }
        const workspacesPromise =
          scopeKind === "workspace"
            ? supabase.from("workspaces").select("*")
            : Promise.resolve<{ data: Tables<"workspaces">[] | null }>({
                data: [],
              });
        const [{ data: docs }, { data: folders }, { data: wss }] =
          await Promise.all([documentsQuery, foldersQuery, workspacesPromise]);
        const normalizeTitle = (value: string): string =>
          (value ?? "").trim().toLowerCase();
        const dedupeDocs = (
          rows: Tables<"documents">[],
        ): Tables<"documents">[] => {
          const byKey = new Map<string, Tables<"documents">>();
          for (const row of rows) {
            const scopeKey = row.data_room_id ?? "workspace";
            const folderKey = row.folder_id ?? "root";
            const titleKey = normalizeTitle(row.title);
            const key = `${scopeKey}|${folderKey}|${titleKey}`;
            const existing = byKey.get(key);
            if (!existing) {
              byKey.set(key, row);
              continue;
            }
            const existingTime = new Date(
              existing.updated_at ?? existing.created_at,
            ).getTime();
            const rowTime = new Date(
              row.updated_at ?? row.created_at,
            ).getTime();
            if (Number.isFinite(rowTime) && rowTime >= existingTime) {
              byKey.set(key, row);
            }
          }
          return Array.from(byKey.values());
        };

        const nextDocs = dedupeDocs((docs || []) as Tables<"documents">[]);
        const nextFolders = folders || [];
        const nextWorkspaces = scopeKind === "workspace" ? wss || [] : [];
        setDocuments(nextDocs);
        setFolderList(nextFolders);
        setWorkspaces(nextWorkspaces);
        if (documentsCacheKey) {
          writeDocumentsClientCache(documentsCacheKey, {
            documents: nextDocs,
            folders: nextFolders,
            workspaces: nextWorkspaces,
          });
        }
        void refetchUsage();
        return nextDocs;
      } finally {
        if (!options.silent) {
          setIsLoading(false);
        }
      }
    },
    [supabase, dataRoomId, scopeKind, refetchUsage, documentsCacheKey],
  );

  const {
    isRecentlyAdded: isRecentlyAddedDoc,
    markRecentlyAdded: markRowsRecentlyAdded,
  } = useRecentlyAddedRows();

  useEffect(() => {
    if (hasCachedDocumentsState) return;
    void refresh();
  }, [hasCachedDocumentsState, refresh]);

  useEffect(() => {
    if (!documentsCacheKey) return;
    if (isLoading) return;
    writeDocumentsClientCache(documentsCacheKey, {
      documents,
      folders: folderList,
      workspaces,
    });
  }, [documents, documentsCacheKey, folderList, isLoading, workspaces]);

  // Central function to update URL parameters
  const updateUrlParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const base = pathname.split("?")[0];
    const qs = params.toString();
    router.replace(`${base}${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  };

  const handleDocumentAction = useCallback(
    (_docId: string, fallbackPath: string) => {
      router.push(fallbackPath);
    },
    [router],
  );

  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent, action: () => void) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action();
      }
    },
    [],
  );

  const stopRowClick = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const prefetchPath = useCallback(
    (path: string) => {
      if (!path) return;
      if (prefetchedPathsRef.current.has(path)) return;
      prefetchedPathsRef.current.add(path);
      router.prefetch(path);
    },
    [router],
  );

  const buildFolderPath = useCallback(
    (id: string): string => {
      if (!id || id === "root") return normalizedBasePath;
      const segs: string[] = [];
      let cur: FolderType | undefined = folderMap.get(id);
      while (cur && cur.id !== "root") {
        segs.unshift(cur.id);
        cur = cur.parent_folder_id
          ? (folderMap.get(cur.parent_folder_id) as FolderType)
          : undefined;
      }
      const suffix = segs.join("/");
      return suffix ? `${normalizedBasePath}/${suffix}` : normalizedBasePath;
    },
    [folderMap, normalizedBasePath],
  );

  const handleSelectFolderFromTree = useCallback(
    (folderId: string | null) => {
      const href = folderId ? buildFolderPath(folderId) : normalizedBasePath;
      setFoldersSheetOpen(false);
      router.push(href);
    },
    [buildFolderPath, normalizedBasePath, router],
  );

  const isDescendantFolder = useCallback(
    (params: { maybeDescendantId: string; ancestorId: string }): boolean => {
      const { maybeDescendantId, ancestorId } = params;
      if (!maybeDescendantId || !ancestorId) return false;
      if (maybeDescendantId === ancestorId) return true;
      const guard = new Set<string>();
      let cursor: string | null = maybeDescendantId;
      while (cursor) {
        if (cursor === ancestorId) return true;
        const parentId: string | null =
          folderMap.get(cursor)?.parent_folder_id ?? null;
        if (!parentId) return false;
        if (guard.has(parentId)) return false;
        guard.add(parentId);
        cursor = parentId;
      }
      return false;
    },
    [folderMap],
  );

  const openRenameDialog = useCallback(
    (target: { kind: "doc" | "folder"; id: string }) => {
      if (!canEditWorkspace) {
        showError("Viewer access: read-only.");
        return;
      }

      if (target.kind === "doc") {
        const doc = documents.find((d) => d.id === target.id);
        if (!doc) return;
        const ext = (doc.file_type || "").trim().toLowerCase();
        const title = (doc.title || "").trim();
        const suffix = ext ? `.${ext}` : "";
        const base =
          ext && title.toLowerCase().endsWith(suffix)
            ? title.slice(0, -suffix.length).trim()
            : title.replace(/\.[^/.]+$/, "").trim();
        setRenameValue(base || title || "");
      } else {
        const folder = folderList.find((f) => f.id === target.id);
        if (!folder) return;
        setRenameValue(folder.name || "");
      }

      setRenameTarget(target);
      setRenameOpen(true);
    },
    [canEditWorkspace, documents, folderList],
  );

  const closeRenameDialog = useCallback(() => {
    setRenameOpen(false);
    setRenameTarget(null);
    setRenameValue("");
  }, []);

  const openMoveDialog = useCallback(
    (target: { kind: "doc" | "folder"; id: string }) => {
      if (!canEditWorkspace) {
        showError("Viewer access: read-only.");
        return;
      }

      if (target.kind === "doc") {
        const doc = documents.find((d) => d.id === target.id);
        if (!doc) return;
        setMoveDestinationId(doc.folder_id ?? null);
      } else {
        const folder = folderList.find((f) => f.id === target.id);
        if (!folder) return;
        setMoveDestinationId(folder.parent_folder_id ?? null);
      }

      setMoveTarget(target);
      setMoveOpen(true);
    },
    [canEditWorkspace, documents, folderList],
  );

  const closeMoveDialog = useCallback(() => {
    setMoveOpen(false);
    setMoveTarget(null);
    setMoveDestinationId(null);
  }, []);

  const markPending = useCallback((key: string) => {
    setPendingOps((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const clearPending = useCallback((key: string) => {
    setPendingOps((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const moveDocument = useCallback(
    async (params: {
      documentId: string;
      destinationFolderId: string | null;
    }) => {
      if (!canEditWorkspace) {
        showError("Viewer access: read-only.");
        return;
      }

      const target = documents.find((d) => d.id === params.documentId);
      if (!target) return;

      const prevFolderId = target.folder_id ?? null;
      const pendingKey = `doc:${params.documentId}`;
      if (pendingOps.has(pendingKey)) return;

      markPending(pendingKey);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(`doc:${params.documentId}`);
        return next;
      });
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === params.documentId
            ? { ...d, folder_id: params.destinationFolderId }
            : d,
        ),
      );

      try {
        const res = await fetch("/api/documents/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            documentId: params.documentId,
            destinationFolderId: params.destinationFolderId,
            ...(dataRoomId ? { dataRoomId } : {}),
          }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (typeof payload?.error === "string" && payload.error) ||
            "Unable to move file right now.";
          throw new Error(message);
        }

        const updated = payload?.document as DocumentType | undefined;
        if (updated?.id) {
          setDocuments((prev) =>
            prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)),
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to move file right now.";
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === params.documentId ? { ...d, folder_id: prevFolderId } : d,
          ),
        );
        showError(message);
      } finally {
        clearPending(pendingKey);
      }
    },
    [
      canEditWorkspace,
      clearPending,
      dataRoomId,
      documents,
      markPending,
      pendingOps,
    ],
  );

  const moveFolder = useCallback(
    async (params: {
      folderId: string;
      destinationParentId: string | null;
    }) => {
      if (!canEditWorkspace) {
        showError("Viewer access: read-only.");
        return;
      }

      const target = folderList.find((f) => f.id === params.folderId);
      if (!target) return;

      const prevParentId = target.parent_folder_id ?? null;
      const pendingKey = `folder:${params.folderId}`;
      if (pendingOps.has(pendingKey)) return;

      // Optimistic cycle guard: disallow moving into itself/descendant.
      if (
        params.destinationParentId &&
        isDescendantFolder({
          maybeDescendantId: params.destinationParentId,
          ancestorId: params.folderId,
        })
      ) {
        showError("Cannot move a folder into itself.");
        return;
      }

      markPending(pendingKey);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(`folder:${params.folderId}`);
        return next;
      });
      setFolderList((prev) =>
        prev.map((f) =>
          f.id === params.folderId
            ? { ...f, parent_folder_id: params.destinationParentId }
            : f,
        ),
      );

      try {
        const res = await fetch("/api/folders/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            folderId: params.folderId,
            destinationParentId: params.destinationParentId,
            ...(dataRoomId ? { dataRoomId } : {}),
          }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (typeof payload?.error === "string" && payload.error) ||
            "Unable to move folder right now.";
          throw new Error(message);
        }

        const updated = payload?.folder as FolderType | undefined;
        if (updated?.id) {
          setFolderList((prev) =>
            prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)),
          );
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to move folder right now.";
        setFolderList((prev) =>
          prev.map((f) =>
            f.id === params.folderId
              ? { ...f, parent_folder_id: prevParentId }
              : f,
          ),
        );
        showError(message);
      } finally {
        clearPending(pendingKey);
      }
    },
    [
      canEditWorkspace,
      clearPending,
      dataRoomId,
      folderList,
      isDescendantFolder,
      markPending,
      pendingOps,
    ],
  );

  const renameFolder = useCallback(
    async (params: { folderId: string; name: string }) => {
      if (!canEditWorkspace) {
        showError("Viewer access: read-only.");
        return;
      }

      const target = folderList.find((f) => f.id === params.folderId);
      if (!target) return;

      const prevName = target.name;
      const pendingKey = `folder:${params.folderId}`;
      if (pendingOps.has(pendingKey)) return;

      markPending(pendingKey);
      setFolderList((prev) =>
        prev.map((f) =>
          f.id === params.folderId ? { ...f, name: params.name } : f,
        ),
      );

      try {
        const res = await fetch("/api/folders/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            folderId: params.folderId,
            name: params.name,
            ...(dataRoomId ? { dataRoomId } : {}),
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (typeof payload?.error === "string" && payload.error) ||
            "Unable to rename folder right now.";
          throw new Error(message);
        }

        const updated = payload?.folder as FolderType | undefined;
        if (updated?.id) {
          setFolderList((prev) =>
            prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)),
          );
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to rename folder right now.";
        setFolderList((prev) =>
          prev.map((f) =>
            f.id === params.folderId ? { ...f, name: prevName } : f,
          ),
        );
        showError(message);
      } finally {
        clearPending(pendingKey);
      }
    },
    [
      canEditWorkspace,
      clearPending,
      dataRoomId,
      folderList,
      markPending,
      pendingOps,
    ],
  );

  const renameDocument = useCallback(
    async (params: { documentId: string; newBaseName: string }) => {
      if (!canEditWorkspace) {
        showError("Viewer access: read-only.");
        return;
      }

      const target = documents.find((d) => d.id === params.documentId);
      if (!target) return;

      const prevTitle = target.title;
      const ext = (target.file_type || "").trim().toLowerCase();
      const base = params.newBaseName.trim();
      const nextTitle = ext ? `${base}.${ext}` : base;

      const pendingKey = `doc:${params.documentId}`;
      if (pendingOps.has(pendingKey)) return;

      markPending(pendingKey);
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === params.documentId ? { ...d, title: nextTitle } : d,
        ),
      );

      try {
        const res = await fetch("/api/documents/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            documentId: params.documentId,
            newBaseName: params.newBaseName,
            ...(dataRoomId ? { dataRoomId } : {}),
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (typeof payload?.error === "string" && payload.error) ||
            "Unable to rename file right now.";
          throw new Error(message);
        }

        const updated = payload?.document as DocumentType | undefined;
        if (updated?.id) {
          setDocuments((prev) =>
            prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)),
          );
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to rename file right now.";
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === params.documentId ? { ...d, title: prevTitle } : d,
          ),
        );
        showError(message);
      } finally {
        clearPending(pendingKey);
      }
    },
    [
      canEditWorkspace,
      clearPending,
      dataRoomId,
      documents,
      markPending,
      pendingOps,
    ],
  );

  const canDropPayload = useCallback(
    (
      targetFolderId: string | null,
      payload: { kind: "doc" | "folder"; id: string },
    ): boolean => {
      if (!canEditWorkspace) return false;
      if (payload.kind === "doc") return true;
      if (payload.kind === "folder") {
        if (!payload.id) return false;
        if (!targetFolderId) return true;
        return !isDescendantFolder({
          maybeDescendantId: targetFolderId,
          ancestorId: payload.id,
        });
      }
      return false;
    },
    [canEditWorkspace, isDescendantFolder],
  );

  const handleTreeDrop = useCallback(
    (
      targetFolderId: string | null,
      payload: { kind: "doc" | "folder"; id: string },
    ) => {
      if (payload.kind === "doc") {
        void moveDocument({
          documentId: payload.id,
          destinationFolderId: targetFolderId,
        });
        return;
      }
      void moveFolder({
        folderId: payload.id,
        destinationParentId: targetFolderId,
      });
    },
    [moveDocument, moveFolder],
  );

  const parseDragPayload = useCallback(
    (dt: DataTransfer): { kind: "doc" | "folder"; id: string } | null => {
      try {
        const raw =
          dt.getData(FOLDER_TREE_DRAG_MIME) || dt.getData("text/plain");
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") return null;
        const obj = parsed as { kind?: unknown; id?: unknown };
        if (obj.kind !== "doc" && obj.kind !== "folder") return null;
        if (typeof obj.id !== "string") return null;
        return { kind: obj.kind, id: obj.id };
      } catch {
        return null;
      }
    },
    [],
  );

  const handleDragStartFolder = useCallback(
    (ev: React.DragEvent, folderId: string) => {
      if (!canEditWorkspace) return;
      const payload = JSON.stringify({ kind: "folder", id: folderId });
      try {
        ev.dataTransfer.setData(FOLDER_TREE_DRAG_MIME, payload);
        ev.dataTransfer.setData("text/plain", payload);
        ev.dataTransfer.effectAllowed = "move";
      } catch {
        // ignore
      }
    },
    [canEditWorkspace],
  );

  const handleDragStartDocument = useCallback(
    (ev: React.DragEvent, documentId: string) => {
      if (!canEditWorkspace) return;
      const payload = JSON.stringify({ kind: "doc", id: documentId });
      try {
        ev.dataTransfer.setData(FOLDER_TREE_DRAG_MIME, payload);
        ev.dataTransfer.setData("text/plain", payload);
        ev.dataTransfer.effectAllowed = "move";
      } catch {
        // ignore
      }
    },
    [canEditWorkspace],
  );

  const handleDragOverFolderRow = useCallback(
    (ev: React.DragEvent, folderId: string) => {
      if (!canEditWorkspace) return;
      // Avoid relying on `getData()` here (some browsers restrict it during dragover).
      // We'll parse payload on drop; during dragover we just need to preventDefault
      // and show highlight.
      const types = Array.from(ev.dataTransfer.types || []);
      const isOurDrag =
        types.includes(FOLDER_TREE_DRAG_MIME) || types.includes("text/plain");

      const payload = parseDragPayload(ev.dataTransfer);
      if (!isOurDrag && !payload) return;
      if (payload && !canDropPayload(folderId, payload)) return;

      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      setDragOverFolderRowId(folderId);
    },
    [canDropPayload, canEditWorkspace, parseDragPayload],
  );

  const handleDragLeaveFolderRow = useCallback((ev: React.DragEvent) => {
    const current = ev.currentTarget as unknown as HTMLElement;
    const related = ev.relatedTarget as unknown as Node | null;
    if (related && current.contains(related)) return;
    setDragOverFolderRowId(null);
  }, []);

  const handleDropOnFolderRow = useCallback(
    (ev: React.DragEvent, folderId: string) => {
      if (!canEditWorkspace) return;
      const payload = parseDragPayload(ev.dataTransfer);
      setDragOverFolderRowId(null);
      if (!payload) return;
      if (!canDropPayload(folderId, payload)) return;
      ev.preventDefault();
      handleTreeDrop(folderId, payload);
    },
    [
      canDropPayload,
      canEditWorkspace,
      handleTreeDrop,
      parseDragPayload,
      setDragOverFolderRowId,
    ],
  );

  const currentFolderInfo =
    folderMap.get(currentFolder) || folderMap.get("root");

  const { rows, isEmpty } = useDocumentsTableRows({
    buildFolderPath,
    currentFolder,
    documents,
    folderList,
    viewBasePath,
    sortBy,
    sortDir,
    includeLinks: enableRowLinks,
  });

  // Client-side search and pagination
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      if (r.kind === "folder") return r.name.toLowerCase().includes(q);
      return r.title.toLowerCase().includes(q);
    });
  }, [rows, searchQuery]);
  const totalCount = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, pageIndex), pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleRows = filteredRows.slice(pageStart, pageStart + pageSize);
  useEffect(() => {
    const allFolderPaths = folderList
      .filter((f) => f.id !== "root")
      .map((f) => buildFolderPath(f.id));

    const allDocPaths = documents.map((doc) => `${viewBasePath}/${doc.id}`);

    const visibleFolderPaths = visibleRows
      .filter((row) => row.kind === "folder")
      .map((row) => buildFolderPath(row.id));

    const visibleDocPaths = visibleRows
      .filter((row) => row.kind === "doc")
      .map((row) => row.resourcePath);

    [...visibleFolderPaths, ...visibleDocPaths].forEach(prefetchPath);

    const remaining = [...allFolderPaths, ...allDocPaths]
      .filter((path) => !prefetchedPathsRef.current.has(path))
      .slice(0, 64);
    if (remaining.length === 0) return;

    let cancelled = false;
    let index = 0;
    const chunkSize = 8;
    const run = () => {
      if (cancelled) return;
      const chunk = remaining.slice(index, index + chunkSize);
      if (chunk.length === 0) return;
      chunk.forEach(prefetchPath);
      index += chunkSize;
      if (index < remaining.length) {
        window.setTimeout(run, 200);
      }
    };

    const timer = window.setTimeout(run, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    buildFolderPath,
    documents,
    folderList,
    prefetchPath,
    viewBasePath,
    visibleRows,
  ]);
  const allVisibleKeys = useMemo(
    () =>
      visibleRows.map((r) =>
        r.kind === "folder" ? `folder:${r.id}` : `doc:${r.id}`,
      ),
    [visibleRows],
  );
  const allVisibleSelected =
    allVisibleKeys.every((k) => selected.has(k)) && allVisibleKeys.length > 0;
  const toggleSelectAllVisible = (next: boolean) => {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (next) {
        allVisibleKeys.forEach((k) => nextSet.add(k));
      } else {
        allVisibleKeys.forEach((k) => nextSet.delete(k));
      }
      return nextSet;
    });
  };
  const toggleOne = (key: string, next: boolean) => {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (next) nextSet.add(key);
      else nextSet.delete(key);
      return nextSet;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const folderDocCountById = useMemo(() => {
    const directCountByFolder = new Map<string, number>();
    for (const d of documents) {
      const key = d.folder_id || "root";
      directCountByFolder.set(key, (directCountByFolder.get(key) || 0) + 1);
    }

    const childrenByParent = new Map<string, string[]>();
    for (const f of folderList) {
      if (f.id === "root") continue;
      const p = f.parent_folder_id || "root";
      const arr = childrenByParent.get(p) || [];
      arr.push(f.id);
      childrenByParent.set(p, arr);
    }

    const totals = new Map<string, number>();
    const compute = (fid: string): number => {
      if (totals.has(fid)) return totals.get(fid)!;
      let sum = directCountByFolder.get(fid) || 0;
      const kids = childrenByParent.get(fid) || [];
      for (const k of kids) sum += compute(k);
      totals.set(fid, sum);
      return sum;
    };

    // Prime totals for all known folders (including "root").
    compute("root");
    for (const f of folderList) {
      compute(f.id === "root" ? "root" : f.id);
    }

    return totals;
  }, [documents, folderList]);

  // Compute recursive folder sizes (sum of all descendant documents)
  const folderSizeById = useMemo(() => {
    const directSizeByFolder = new Map<string, number>();
    for (const d of documents) {
      const key = d.folder_id || "root";
      const size = typeof d.size_bytes === "number" ? d.size_bytes : 0;
      directSizeByFolder.set(key, (directSizeByFolder.get(key) || 0) + size);
    }

    const childrenByParent = new Map<string, string[]>();
    for (const f of folderList) {
      if (f.id === "root") continue;
      const p = f.parent_folder_id || "root";
      const arr = childrenByParent.get(p) || [];
      arr.push(f.id);
      childrenByParent.set(p, arr);
    }

    const totals = new Map<string, number>();
    const compute = (fid: string): number => {
      if (totals.has(fid)) return totals.get(fid)!;
      let sum = directSizeByFolder.get(fid) || 0;
      const kids = childrenByParent.get(fid) || [];
      for (const k of kids) sum += compute(k);
      totals.set(fid, sum);
      return sum;
    };

    // prime totals for all known folders
    for (const f of folderList) {
      compute(f.id === "root" ? "root" : f.id);
    }
    return totals;
  }, [documents, folderList]);

  // (Folder tree viewer UI removed)

  useEffect(() => {
    if (!enableRowLinks) {
      setDocIdToLinkCount({});
      return;
    }
    const ids = rows.filter((r) => r.kind === "doc").map((r) => r.id);
    if (ids.length === 0) {
      setDocIdToLinkCount({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("links")
        .select("document_id")
        .in("document_id", ids);
      if (error || !data) {
        if (!cancelled) setDocIdToLinkCount({});
        return;
      }
      const counts: Record<string, number> = {};
      for (const row of data as Array<{ document_id: string | null }>) {
        const id = row.document_id;
        if (!id) continue;
        counts[id] = (counts[id] || 0) + 1;
      }
      if (!cancelled) setDocIdToLinkCount(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, supabase, enableRowLinks]);

  const baseFolderId = React.useMemo(
    () => (currentFolder && currentFolder !== "root" ? currentFolder : null),
    [currentFolder],
  );

  const accept = React.useMemo(
    () =>
      Array.from(ALL_SUPPORTED_EXTENSIONS)
        .map((e) => `.${e}`)
        .join(","),
    [],
  );

  const stageUploadInModal = React.useCallback(
    async (picked: File[] | FileList | null) => {
      if (!picked) return;
      if (isCheckingEditPermission) return;
      if (!canEditWorkspace) {
        showError("Viewer access: read-only.");
        return;
      }
      if (!ensureStorageCapacity()) return;
      const wsId = resolvedWorkspaceId;
      if (!wsId) return;
      const selected = filterSupportedFiles(picked);
      if (selected.length === 0) return;
      setStagedUploadFiles(selected);
      setShowUpload(true);
    },
    [
      canEditWorkspace,
      resolvedWorkspaceId,
      ensureStorageCapacity,
      isCheckingEditPermission,
    ],
  );

  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const filesInputRef = React.useRef<HTMLInputElement | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);

  const onDropZoneDrop = React.useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (!ensureStorageCapacity()) {
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
        await stageUploadInModal(collected);
      } else {
        await stageUploadInModal(dt.files);
      }
    },
    [stageUploadInModal, ensureStorageCapacity],
  );

  const onDropZoneDragOver = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (isStorageAtOrAboveLimit) {
        setIsDragActive(false);
        return;
      }
      setIsDragActive(true);
    },
    [isStorageAtOrAboveLimit],
  );

  const onDropZoneDragLeave = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
    },
    [],
  );

  const handleStartInlineCreate = useCallback(() => {
    if (!canEditWorkspace) {
      showError(
        editPermissionState === "error"
          ? "Could not verify editing access. Retry the permission check."
          : "Viewer access: read-only.",
      );
      return;
    }
    setFoldersSheetOpen(false);
    setIsCreatingFolder(true);
    setNewFolderName("");
    // focus will be applied in effect below
  }, [canEditWorkspace, editPermissionState]);

  useEffect(() => {
    if (!controlId || typeof window === "undefined") return;
    const uploadEventName = `${DOCUMENTS_CONTROL_UPLOAD_EVENT}:${controlId}`;
    const folderEventName = `${DOCUMENTS_CONTROL_NEW_FOLDER_EVENT}:${controlId}`;
    const handleUploadEvent = () => {
      handleRequestUpload();
    };
    const handleFolderEvent = () => {
      handleStartInlineCreate();
    };
    window.addEventListener(uploadEventName, handleUploadEvent);
    window.addEventListener(folderEventName, handleFolderEvent);
    return () => {
      window.removeEventListener(uploadEventName, handleUploadEvent);
      window.removeEventListener(folderEventName, handleFolderEvent);
    };
  }, [controlId, handleStartInlineCreate, handleRequestUpload]);

  React.useEffect(() => {
    if (!isCreatingFolder) return;
    if (typeof window !== "undefined") {
      const prefersDesktop = window.matchMedia("(min-width: 768px)").matches;
      if (prefersDesktop) {
        newFolderInputDesktopRef.current?.focus();
      } else {
        newFolderInputMobileRef.current?.focus();
      }
    } else {
      newFolderInputDesktopRef.current?.focus();
    }
  }, [isCreatingFolder]);

  const submitInlineCreate = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId || !resolvedWorkspaceId) return;
    // optional client-side duplicate check within current parent
    const dup = folderList.some(
      (f) =>
        (f.parent_folder_id || null) === (baseFolderId || null) &&
        f.name === name,
    );
    if (dup) {
      setIsCreatingFolder(false);
      setNewFolderName("");
      return;
    }
    const { data: inserted } = await supabase
      .from("folders")
      .insert({
        workspace_id: resolvedWorkspaceId,
        parent_folder_id: baseFolderId,
        name,
        created_by: userId,
        data_room_id: dataRoomId ?? null,
      })
      .select(
        "id, workspace_id, parent_folder_id, name, created_by, created_at",
      )
      .single();
    if (inserted) {
      setFolderList((prev) => [inserted as unknown as FolderType, ...prev]);
    }
    setIsCreatingFolder(false);
    setNewFolderName("");
  };

  // Breadcrumbs for Drive-like navigation
  const makeCrumbs = () => {
    const crumbs: { id: string; name: string }[] = [
      { id: "root", name: rootBreadcrumbLabel },
    ];
    if (currentFolder === "root") return crumbs;
    const segs: FolderType[] = [];
    let cur = folderMap.get(currentFolder || "root");
    while (cur && cur.id !== "root") {
      segs.unshift(cur);
      cur = cur.parent_folder_id
        ? (folderMap.get(cur.parent_folder_id) as FolderType)
        : undefined;
    }
    return crumbs.concat(segs.map((f) => ({ id: f.id, name: f.name })));
  };
  const breadcrumbs = makeCrumbs();

  // One tree definition drives both the persistent desktop pane and the Sheet.
  const folderTreeNode = (
    <FolderTree
      folders={folderList}
      currentFolderId={currentFolder || "root"}
      rootLabel={rootBreadcrumbLabel}
      docCountByFolderId={folderDocCountById}
      mode={canEditWorkspace ? "manage" : "readonly"}
      onSelectFolder={handleSelectFolderFromTree}
      enableDnD={canEditWorkspace}
      canDropPayload={canDropPayload}
      onDropPayload={handleTreeDrop}
    />
  );

  // An empty folder replaces the table surface entirely, so the framed empty
  // state stays the only bordered region in the table pane. The inline
  // "create folder" row lives inside the table, so keep the table while it runs.
  const showFolderEmptyState = !isLoading && isEmpty && !isCreatingFolder;

  const folderTreeCreateAction = canEditWorkspace ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 shrink-0 px-2 text-xs"
      onClick={handleStartInlineCreate}
    >
      Create folder
    </Button>
  ) : null;

  // Folder creation UI removed to simplify Drive-like list view
  const renderSortIcon = (col: "name" | "modified" | "size") => {
    if (sortBy === col)
      return sortDir === "asc" ? (
        <ArrowUp className="h-4 w-4" aria-hidden />
      ) : (
        <ArrowDown className="h-4 w-4" aria-hidden />
      );
    return <div className="h-4 w-4" />;
  };
  // Folder creation omitted in this iteration (upload-first flow)

  // Delete dialog state && helpers
  const [deleteTarget, setDeleteTarget] = useState<
    { type: "doc"; id: string } | { type: "folder"; id: string } | null
  >(null);

  const requestDeleteTarget = useCallback(
    (target: { type: "doc"; id: string } | { type: "folder"; id: string }) => {
      if (isDeleting) return;
      if (!canEditWorkspace) {
        showError("Viewer access: read-only.");
        return;
      }
      setDeleteTarget(target);
    },
    [canEditWorkspace, isDeleting],
  );

  const getDescendantFolderIds = (id: string): Set<string> => {
    const res = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      res.add(cur);
      const children = folderList.filter((f) => f.parent_folder_id === cur);
      children.forEach((c) => stack.push(c.id));
    }
    return res;
  };

  const deleteDocumentSelection = useCallback(
    async (input: {
      documentIds: string[];
      folderIds: string[];
    }): Promise<DeleteDocumentSelectionSuccess> => {
      if (!resolvedWorkspaceId) {
        throw new Error("Workspace not found");
      }

      const response = await fetch("/api/documents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId: resolvedWorkspaceId,
          dataRoomId,
          documentIds: input.documentIds,
          folderIds: input.folderIds,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);
      return parseDeleteDocumentSelectionResponse({
        responseOk: response.ok,
        payload,
      });
    },
    [dataRoomId, resolvedWorkspaceId],
  );

  const applyDeletedSelection = useCallback(
    (result: DeleteDocumentSelectionSuccess): void => {
      const deletedDocumentIds = new Set(result.deletedDocumentIds);
      const deletedFolderIds = new Set(result.deletedFolderIds);

      setDocuments((prev) =>
        prev.filter((document) => !deletedDocumentIds.has(document.id)),
      );
      setFolderList((prev) =>
        prev.filter((folder) => !deletedFolderIds.has(folder.id)),
      );
      setSelected(new Set());

      if (deletedFolderIds.has(currentFolder)) {
        router.push(normalizedBasePath);
      }
    },
    [currentFolder, normalizedBasePath, router],
  );

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget || isDeleting) return;
    if (!canEditWorkspace) {
      showError("Viewer access: read-only.");
      setDeleteTarget(null);
      return;
    }

    const target = deleteTarget;
    if (target.type === "folder" && target.id === "root") {
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteDocumentSelection({
        documentIds: target.type === "doc" ? [target.id] : [],
        folderIds: target.type === "folder" ? [target.id] : [],
      });
      applyDeletedSelection(result);
      setDeleteTarget(null);

      if (target.type === "doc") {
        showSuccess("Document deleted");
      } else {
        showSuccess("Folder & all its contents deleted");
      }
      void refetchUsage();
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Unable to delete selected items. Please try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmBulkDelete = async (): Promise<void> => {
    if (isDeleting) return;
    if (!canEditWorkspace) {
      showError("Viewer access: read-only.");
      return;
    }

    const documentIds = Array.from(selected)
      .filter((key) => key.startsWith("doc:"))
      .map((key) => key.slice(4));
    const folderIds = Array.from(selected)
      .filter((key) => key.startsWith("folder:"))
      .map((key) => key.slice(7));
    if (documentIds.length === 0 && folderIds.length === 0) return;

    setIsDeleting(true);
    try {
      const result = await deleteDocumentSelection({ documentIds, folderIds });
      applyDeletedSelection(result);
      setIsBulkDeleteOpen(false);
      showSuccess("Selected items deleted");
      void refetchUsage();
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Unable to delete selected items. Please try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <PageContainer className={className}>
      {isStorageLimited && (isStorageAtOrAboveLimit || isStorageOverLimit) ? (
        <div
          className={cn(
            "relative mb-5 overflow-hidden rounded-lg border p-4 text-sm",
            isStorageOverLimit
              ? "border-destructive/60 bg-destructive/5 text-destructive"
              : "border-destructive/40 bg-destructive/[0.06] text-destructive",
          )}
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-current/60 to-transparent" />
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isStorageOverLimit
                  ? "Storage exceeds your included amount."
                  : "You’ve reached your included storage."}
              </p>
              <p className="text-sm text-muted-foreground">
                {plan.name} includes{" "}
                {maxStorageBytes === null
                  ? "unlimited storage"
                  : formatStorage(maxStorageBytes)}{" "}
                per workspace. You’re using {storageUsageLabel}. Remove files or
                upgrade to add more storage.
              </p>
            </div>
            {canManageBilling ? (
              <Button variant="outline" asChild>
                <Link href={planManagementUrl}>Manage plan</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask your workspace owner to manage billing.
              </p>
            )}
          </div>
        </div>
      ) : null}
      {showHeader ? (
        <PageHeader
          title={title}
          description={subtitle}
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {isCheckingEditPermission ? (
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  <Skeleton className="h-10 w-full sm:w-[160px]" />
                  <Skeleton className="h-10 w-full sm:w-[120px]" />
                </div>
              ) : canEditWorkspace ? (
                <>
                  <Button
                    data-guide="documents-upload-button"
                    onClick={handleRequestUpload}
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "w-full md:w-auto",
                    )}
                  >
                    <UploadSimple aria-hidden />
                    Upload Document
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleStartInlineCreate}
                    className="w-full md:w-auto"
                  >
                    <Folder aria-hidden />
                    New folder
                  </Button>
                </>
              ) : editPermissionState === "denied" ? (
                <p className="text-sm text-muted-foreground">
                  Viewer access: read-only.
                </p>
              ) : null}
            </div>
          }
          className="mb-6"
        />
      ) : null}

      {editPermissionState === "error" ? (
        <div
          role="alert"
          className="mb-5 flex flex-col gap-3 rounded-lg border border-destructive/60 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          data-guide="documents-edit-permission-error"
        >
          <div className="space-y-1">
            <p className="text-sm font-semibold text-destructive">
              Could not verify editing access.
            </p>
            <p className="text-sm text-muted-foreground">
              Retry the permission check before making changes.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setEditPermissionCheckKey((current) => current + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {/* Drive-like UI: no stats && no filters */}

      {/* Mobile folder switcher */}
      {/* Mobile folder switcher removed */}

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="pb-20 lg:flex lg:gap-6 lg:pb-0">
            {/* Persistent folder pane — 1024px and up */}
            <aside
              id={folderPaneId}
              aria-label="Folder tree"
              className={cn(
                "hidden w-[264px] shrink-0",
                isFolderPaneOpen && "lg:block",
              )}
            >
              <div className="dk-nocturne-surface sticky top-4 overflow-hidden rounded-lg">
                <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                  <p className="dk-nocturne-kicker">Folders</p>
                  {folderTreeCreateAction}
                </div>
                <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto px-2 pb-3">
                  {folderTreeNode}
                </div>
              </div>
            </aside>

            {/* Main documents list */}
            <div className="min-w-0 flex-1 space-y-3.5">
              {/* Toolbar: heading + folders + search + selection */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[1.05rem] font-medium">
                    {currentFolder === "root"
                      ? rootBreadcrumbLabel
                      : currentFolderInfo?.name || rootBreadcrumbLabel}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Browse your documents &amp; folders
                  </p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  {selected.size > 0 ? (
                    <div className="flex items-center gap-2 rounded border border-primary/30 bg-primary/5 px-2 py-1">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {selected.size} selected
                      </span>
                      {canEditWorkspace ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setIsBulkDeleteOpen(true)}
                          aria-label="Delete selected items"
                        >
                          <Trash className="mr-1 size-4" aria-hidden />
                          Delete
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={clearSelection}
                      >
                        Clear
                      </Button>
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={handleToggleFolders}
                    aria-expanded={
                      isWideFolderLayout ? isFolderPaneOpen : foldersSheetOpen
                    }
                    aria-controls={
                      isWideFolderLayout ? folderPaneId : undefined
                    }
                  >
                    <Folder aria-hidden />
                    Folders
                  </Button>
                  <Input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search files &amp; folders…"
                    className="h-9 w-full bg-card/35 sm:w-[248px]"
                    aria-label="Search files and folders"
                  />
                </div>
              </div>
              <div
                data-guide="documents-drag-target"
                className={cn(
                  "rounded-lg transition-colors",
                  canEditWorkspace && isDragActive
                    ? "bg-primary/[0.035] ring-2 ring-primary/60"
                    : undefined,
                  isStorageAtOrAboveLimit ? "opacity-60" : undefined,
                )}
                {...(canEditWorkspace
                  ? {
                      onDrop: onDropZoneDrop,
                      onDragOver: onDropZoneDragOver,
                      onDragLeave: onDropZoneDragLeave,
                    }
                  : {})}
              >
                {canEditWorkspace ? (
                  <>
                    <input
                      ref={filesInputRef}
                      type="file"
                      className="sr-only"
                      aria-label="Upload files"
                      multiple
                      accept={accept}
                      onChange={(e) => {
                        void stageUploadInModal(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                    <input
                      ref={folderInputRef}
                      type="file"
                      className="sr-only"
                      aria-label="Upload folder"
                      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                      // @ts-ignore non-standard
                      webkitdirectory="true"
                      directory="true"
                      onChange={(e) => {
                        void stageUploadInModal(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </>
                ) : null}

                {!isLoading && breadcrumbs.length > 1 ? (
                  <nav className="mb-3 px-1 text-xs" aria-label="Breadcrumb">
                    <ol className="flex flex-wrap items-center gap-2">
                      {breadcrumbs.map((c, i) => {
                        const href =
                          c.id === "root"
                            ? normalizedBasePath
                            : buildFolderPath(c.id);
                        const isLast = i === breadcrumbs.length - 1;
                        return (
                          <li
                            key={c.id}
                            className="inline-flex items-center gap-2"
                          >
                            {i > 0 && (
                              <CaretRight
                                className="size-4 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                            {isLast ? (
                              <span
                                aria-current="page"
                                className="font-medium text-foreground"
                              >
                                {c.name}
                              </span>
                            ) : (
                              <Link
                                href={href}
                                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                              >
                                {c.name}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </nav>
                ) : null}

                {showFolderEmptyState ? (
                  <div data-guide="documents-empty-state">
                    <EmptyState
                      variant="framed"
                      title="No documents found"
                      description={getDocumentsEmptyStateDescription(
                        editPermissionState,
                      )}
                      icon={
                        <FileText
                          className="h-6 w-6 text-muted-foreground"
                          aria-hidden
                        />
                      }
                      actions={
                        canEditWorkspace ? (
                          <>
                            <Button onClick={handleRequestUpload}>
                              Upload Document
                            </Button>
                            <Button
                              variant="outline"
                              onClick={handleStartInlineCreate}
                            >
                              Create folder
                            </Button>
                          </>
                        ) : null
                      }
                    />
                  </div>
                ) : (
                  <Card className="overflow-hidden border-border/70 bg-card/40">
                    <CardContent className="p-0">
                      <div className="overflow-auto">
                        {isLoading ? (
                          <div className="space-y-1 p-3">
                            <Skeleton className="h-11 w-full rounded-md" />
                            <Skeleton className="h-11 w-full rounded-md" />
                            <Skeleton className="h-11 w-full rounded-md" />
                            <Skeleton className="h-11 w-2/3 rounded-md" />
                          </div>
                        ) : (
                          <>
                            <div className="space-y-3 p-3 md:hidden">
                              {isCreatingFolder && (
                                <div className="rounded-lg bg-primary/[0.025] p-4">
                                  <div className="flex items-center gap-2 text-sm font-medium">
                                    <Folder
                                      className="h-4 w-4 text-muted-foreground"
                                      aria-hidden
                                    />
                                    New folder
                                  </div>
                                  <Input
                                    ref={newFolderInputMobileRef}
                                    autoFocus
                                    value={newFolderName}
                                    onChange={(e) =>
                                      setNewFolderName(e.target.value)
                                    }
                                    onKeyDown={async (e) => {
                                      if (e.key === "Enter") {
                                        await submitInlineCreate();
                                      } else if (e.key === "Escape") {
                                        setIsCreatingFolder(false);
                                        setNewFolderName("");
                                      }
                                    }}
                                    placeholder="New folder name"
                                    className="mt-3"
                                  />
                                  <div className="mt-3 flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={submitInlineCreate}
                                      disabled={!newFolderName.trim()}
                                    >
                                      Create
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setIsCreatingFolder(false);
                                        setNewFolderName("");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                              {visibleRows.map((row) =>
                                row.kind === "folder" ? (
                                  <div
                                    key={`f_mobile_${row.id}`}
                                    className={cn(
                                      "cursor-pointer rounded-lg border border-border/70 bg-card/40 p-3.5 transition-colors hover:border-primary/30 hover:bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))]",
                                      dragOverFolderRowId === row.id
                                        ? "bg-primary/10 ring-1 ring-primary/30"
                                        : null,
                                    )}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Open ${row.name || "folder"}`}
                                    draggable={canEditWorkspace}
                                    onClick={() => router.push(row.openPath)}
                                    onKeyDown={(event) =>
                                      handleRowKeyDown(event, () =>
                                        router.push(row.openPath),
                                      )
                                    }
                                    onMouseEnter={() =>
                                      prefetchPath(row.openPath)
                                    }
                                    onFocus={() => prefetchPath(row.openPath)}
                                    onDragStart={(ev) =>
                                      handleDragStartFolder(ev, row.id)
                                    }
                                    onDragOver={(ev) =>
                                      handleDragOverFolderRow(ev, row.id)
                                    }
                                    onDragLeave={handleDragLeaveFolderRow}
                                    onDrop={(ev) =>
                                      handleDropOnFolderRow(ev, row.id)
                                    }
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-start gap-2">
                                        <div onClick={stopRowClick}>
                                          <Checkbox
                                            aria-label={`Select ${row.name}`}
                                            checked={selected.has(
                                              `folder:${row.id}`,
                                            )}
                                            onCheckedChange={(v) =>
                                              toggleOne(
                                                `folder:${row.id}`,
                                                Boolean(v),
                                              )
                                            }
                                          />
                                        </div>
                                        <div className="min-w-0">
                                          <div
                                            className="font-medium wrap-break-word whitespace-normal"
                                            title={
                                              row.name || "Untitled folder"
                                            }
                                          >
                                            {row.name || "Untitled folder"}
                                          </div>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            Updated{" "}
                                            {formatRelativeDate(row.createdAt)}
                                          </p>
                                        </div>
                                      </div>
                                      <div
                                        className="flex items-center gap-1"
                                        onClick={stopRowClick}
                                      >
                                        {canEditWorkspace ? (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`Open actions for ${row.name}`}
                                                disabled={pendingOps.has(
                                                  `folder:${row.id}`,
                                                )}
                                              >
                                                <DotsThree
                                                  className="size-4"
                                                  aria-hidden
                                                />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  openRenameDialog({
                                                    kind: "folder",
                                                    id: row.id,
                                                  })
                                                }
                                                disabled={pendingOps.has(
                                                  `folder:${row.id}`,
                                                )}
                                              >
                                                <PencilSimple
                                                  className="mr-2 size-3.5"
                                                  aria-hidden
                                                />
                                                Rename
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  openMoveDialog({
                                                    kind: "folder",
                                                    id: row.id,
                                                  })
                                                }
                                                disabled={pendingOps.has(
                                                  `folder:${row.id}`,
                                                )}
                                              >
                                                <ArrowsLeftRight
                                                  className="mr-2 size-3.5"
                                                  aria-hidden
                                                />
                                                Move to…
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={() =>
                                                  requestDeleteTarget({
                                                    type: "folder",
                                                    id: row.id,
                                                  })
                                                }
                                                disabled={pendingOps.has(
                                                  `folder:${row.id}`,
                                                )}
                                              >
                                                <Trash
                                                  className="mr-2 size-3.5"
                                                  aria-hidden
                                                />
                                                Delete
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        ) : null}
                                      </div>
                                    </div>
                                    {(() => {
                                      const totalSize =
                                        folderSizeById.get(row.id) || 0;
                                      if (!totalSize) return null;
                                      return (
                                        <div className="mt-3 text-xs text-muted-foreground">
                                          Size {formatFileSize(totalSize)}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <div
                                    key={`d_mobile_${row.id}`}
                                    className="cursor-pointer rounded-lg border border-border/70 bg-card/40 p-3.5 transition-colors hover:border-primary/30 hover:bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))]"
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Open ${row.title || "document"}`}
                                    draggable={canEditWorkspace}
                                    onClick={() =>
                                      handleDocumentAction(
                                        row.id,
                                        row.resourcePath,
                                      )
                                    }
                                    onKeyDown={(event) =>
                                      handleRowKeyDown(event, () =>
                                        handleDocumentAction(
                                          row.id,
                                          row.resourcePath,
                                        ),
                                      )
                                    }
                                    onMouseEnter={() =>
                                      prefetchPath(row.resourcePath)
                                    }
                                    onFocus={() =>
                                      prefetchPath(row.resourcePath)
                                    }
                                    onDragStart={(ev) =>
                                      handleDragStartDocument(ev, row.id)
                                    }
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex min-w-0 items-start gap-2">
                                        <div onClick={stopRowClick}>
                                          <Checkbox
                                            aria-label={`Select ${row.title}`}
                                            checked={selected.has(
                                              `doc:${row.id}`,
                                            )}
                                            onCheckedChange={(v) =>
                                              toggleOne(
                                                `doc:${row.id}`,
                                                Boolean(v),
                                              )
                                            }
                                          />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p
                                            className="text-left font-medium wrap-break-word whitespace-normal"
                                            title={
                                              row.title || "Untitled document"
                                            }
                                          >
                                            {row.title}
                                          </p>
                                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                            <span>
                                              Updated{" "}
                                              {formatRelativeDate(
                                                row.updatedAt,
                                              )}
                                            </span>
                                            <span>
                                              {formatFileSize(row.sizeBytes)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      {(() => {
                                        const actionLabel = "View";
                                        const ariaLabel = `${actionLabel} ${row.title || "document"}`;
                                        return (
                                          <div
                                            className="flex items-center gap-1"
                                            onClick={stopRowClick}
                                          >
                                            <Button
                                              size="icon"
                                              variant="outline"
                                              onClick={() =>
                                                handleDocumentAction(
                                                  row.id,
                                                  row.resourcePath,
                                                )
                                              }
                                              aria-label={ariaLabel}
                                            >
                                              <Eye
                                                className="h-4 w-4"
                                                aria-hidden
                                              />
                                            </Button>
                                            {canEditWorkspace ? (
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Open actions for ${row.title}`}
                                                    disabled={pendingOps.has(
                                                      `doc:${row.id}`,
                                                    )}
                                                  >
                                                    <DotsThree
                                                      className="size-4"
                                                      aria-hidden
                                                    />
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                  <DropdownMenuItem
                                                    onClick={() =>
                                                      openRenameDialog({
                                                        kind: "doc",
                                                        id: row.id,
                                                      })
                                                    }
                                                    disabled={pendingOps.has(
                                                      `doc:${row.id}`,
                                                    )}
                                                  >
                                                    <PencilSimple
                                                      className="mr-2 size-3.5"
                                                      aria-hidden
                                                    />
                                                    Rename
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    onClick={() =>
                                                      openMoveDialog({
                                                        kind: "doc",
                                                        id: row.id,
                                                      })
                                                    }
                                                    disabled={pendingOps.has(
                                                      `doc:${row.id}`,
                                                    )}
                                                  >
                                                    <ArrowsLeftRight
                                                      className="mr-2 size-3.5"
                                                      aria-hidden
                                                    />
                                                    Move to…
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() =>
                                                      requestDeleteTarget({
                                                        type: "doc",
                                                        id: row.id,
                                                      })
                                                    }
                                                    disabled={pendingOps.has(
                                                      `doc:${row.id}`,
                                                    )}
                                                  >
                                                    <Trash
                                                      className="mr-2 size-3.5"
                                                      aria-hidden
                                                    />
                                                    Delete
                                                  </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            ) : null}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    {enableRowLinks
                                      ? (() => {
                                          const n =
                                            docIdToLinkCount[row.id] || 0;
                                          return n > 0 ? (
                                            <div className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                              <LinkIcon
                                                className="h-3.5 w-3.5"
                                                aria-hidden
                                              />
                                              {n} active link
                                              {n === 1 ? "" : "s"}
                                            </div>
                                          ) : null;
                                        })()
                                      : null}
                                  </div>
                                ),
                              )}
                            </div>
                            {/* Mobile pagination */}
                            {totalCount > 0 && (
                              <div className="mt-2 flex items-center justify-between gap-2 px-1 py-2 md:hidden">
                                <div className="text-xs text-muted-foreground">
                                  {`${pageStart + 1}–${Math.min(
                                    pageStart + pageSize,
                                    totalCount,
                                  )} of ${totalCount}`}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      updateUrlParams({
                                        page: String(
                                          Math.max(1, currentPage - 1),
                                        ),
                                      })
                                    }
                                    disabled={currentPage <= 1}
                                  >
                                    Prev
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      updateUrlParams({
                                        page: String(
                                          Math.min(pageCount, currentPage + 1),
                                        ),
                                      })
                                    }
                                    disabled={currentPage >= pageCount}
                                  >
                                    Next
                                  </Button>
                                </div>
                              </div>
                            )}
                            <div className="hidden overflow-x-auto md:block">
                              <table className="w-full caption-bottom text-sm">
                                <caption className="sr-only">
                                  Documents and folders
                                </caption>
                                <thead className="sticky top-0 z-10 bg-muted/30 backdrop-blur supports-backdrop-filter:bg-muted/20 [&_tr]:border-b [&_tr]:border-border/60">
                                  <tr className="border-b transition-colors hover:bg-muted/25">
                                    <th className="h-10 w-10 px-3 align-middle">
                                      <Checkbox
                                        aria-label="Select all"
                                        checked={allVisibleSelected}
                                        onCheckedChange={(v) =>
                                          toggleSelectAllVisible(Boolean(v))
                                        }
                                      />
                                    </th>
                                    <th
                                      scope="col"
                                      aria-sort={
                                        sortBy === "name"
                                          ? sortDir === "asc"
                                            ? "ascending"
                                            : "descending"
                                          : "none"
                                      }
                                      className="h-10 min-w-[240px] px-3 text-left align-middle text-xs font-medium text-muted-foreground"
                                    >
                                      <Button
                                        variant="link"
                                        className={cn(
                                          "inline-flex items-center gap-1 p-0! hover:underline",
                                          sortBy === "name"
                                            ? "font-semibold text-foreground"
                                            : "text-muted-foreground",
                                        )}
                                        onClick={() => {
                                          if (sortBy !== "name") {
                                            updateUrlParams({
                                              sort: "name",
                                              dir: "asc",
                                            });
                                          } else if (sortDir === "asc") {
                                            updateUrlParams({ dir: "desc" });
                                          } else {
                                            updateUrlParams({
                                              sort: null,
                                              dir: null,
                                            });
                                          }
                                        }}
                                        aria-label="Sort by name"
                                      >
                                        Name {renderSortIcon("name")}
                                      </Button>
                                    </th>
                                    <th
                                      scope="col"
                                      aria-sort={
                                        sortBy === "modified"
                                          ? sortDir === "asc"
                                            ? "ascending"
                                            : "descending"
                                          : "none"
                                      }
                                      className="h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground"
                                    >
                                      <Button
                                        variant="link"
                                        className={cn(
                                          "inline-flex items-center gap-1 p-0! hover:underline",
                                          sortBy === "modified"
                                            ? "font-semibold text-foreground"
                                            : "text-muted-foreground",
                                        )}
                                        onClick={() => {
                                          if (sortBy !== "modified") {
                                            updateUrlParams({
                                              sort: "modified",
                                              dir: "asc",
                                            });
                                          } else if (sortDir === "asc") {
                                            updateUrlParams({ dir: "desc" });
                                          } else {
                                            updateUrlParams({
                                              sort: null,
                                              dir: null,
                                            });
                                          }
                                        }}
                                        aria-label="Sort by last modified"
                                      >
                                        Last modified{" "}
                                        {renderSortIcon("modified")}
                                      </Button>
                                    </th>
                                    <th
                                      scope="col"
                                      aria-sort={
                                        sortBy === "size"
                                          ? sortDir === "asc"
                                            ? "ascending"
                                            : "descending"
                                          : "none"
                                      }
                                      className="h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground"
                                    >
                                      <Button
                                        variant="link"
                                        className={cn(
                                          "inline-flex items-center gap-1 p-0! hover:underline",
                                          sortBy === "size"
                                            ? "font-semibold text-foreground"
                                            : "text-muted-foreground",
                                        )}
                                        onClick={() => {
                                          if (sortBy !== "size") {
                                            updateUrlParams({
                                              sort: "size",
                                              dir: "asc",
                                            });
                                          } else if (sortDir === "asc") {
                                            updateUrlParams({ dir: "desc" });
                                          } else {
                                            updateUrlParams({
                                              sort: null,
                                              dir: null,
                                            });
                                          }
                                        }}
                                        aria-label="Sort by file size"
                                      >
                                        File size {renderSortIcon("size")}
                                      </Button>
                                    </th>
                                    <th
                                      className="h-10 px-3 text-right align-middle font-medium"
                                      aria-hidden
                                    ></th>
                                  </tr>
                                </thead>
                                <tbody className="[&_tr:last-child]:border-0">
                                  {isCreatingFolder && (
                                    <tr className="bg-primary/[0.025]">
                                      <td className="p-3 align-middle">
                                        <Checkbox aria-hidden disabled />
                                      </td>
                                      <th
                                        scope="row"
                                        className="p-3 align-middle font-medium"
                                      >
                                        <div className="flex items-center gap-3">
                                          <Folder
                                            className="h-4 w-4 text-muted-foreground"
                                            aria-hidden
                                          />
                                          <Input
                                            ref={newFolderInputDesktopRef}
                                            autoFocus
                                            value={newFolderName}
                                            onChange={(e) =>
                                              setNewFolderName(e.target.value)
                                            }
                                            onKeyDown={async (e) => {
                                              if (e.key === "Enter") {
                                                await submitInlineCreate();
                                              } else if (e.key === "Escape") {
                                                setIsCreatingFolder(false);
                                                setNewFolderName("");
                                              }
                                            }}
                                            placeholder="New folder name"
                                            className="h-8 max-w-[320px]"
                                          />
                                        </div>
                                      </th>
                                      <td className="p-3 align-middle">—</td>
                                      <td className="p-3 align-middle">—</td>
                                      <td className="p-3 text-right align-middle">
                                        <div className="flex items-center justify-end gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={submitInlineCreate}
                                            disabled={!newFolderName.trim()}
                                          >
                                            Create
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                              setIsCreatingFolder(false);
                                              setNewFolderName("");
                                            }}
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  {visibleRows.map((row) =>
                                    row.kind === "folder" ? (
                                      <tr
                                        key={`f_${row.id}`}
                                        className={cn(
                                          "cursor-pointer border-b border-border/60 transition-colors hover:bg-primary/[0.035]",
                                          dragOverFolderRowId === row.id
                                            ? "bg-primary/10 ring-1 ring-primary/30"
                                            : null,
                                        )}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Open ${row.name || "folder"}`}
                                        draggable={canEditWorkspace}
                                        onClick={() =>
                                          router.push(row.openPath)
                                        }
                                        onKeyDown={(event) =>
                                          handleRowKeyDown(event, () =>
                                            router.push(row.openPath),
                                          )
                                        }
                                        onMouseEnter={() =>
                                          prefetchPath(row.openPath)
                                        }
                                        onFocus={() =>
                                          prefetchPath(row.openPath)
                                        }
                                        onDragStart={(ev) =>
                                          handleDragStartFolder(ev, row.id)
                                        }
                                        onDragOver={(ev) =>
                                          handleDragOverFolderRow(ev, row.id)
                                        }
                                        onDragLeave={handleDragLeaveFolderRow}
                                        onDrop={(ev) =>
                                          handleDropOnFolderRow(ev, row.id)
                                        }
                                      >
                                        <td
                                          className={cn(
                                            "p-3 align-middle",
                                            dragOverFolderRowId === row.id
                                              ? "bg-primary/10"
                                              : null,
                                          )}
                                          onClick={stopRowClick}
                                        >
                                          <Checkbox
                                            aria-label={`Select ${row.name}`}
                                            checked={selected.has(
                                              `folder:${row.id}`,
                                            )}
                                            onCheckedChange={(v) =>
                                              toggleOne(
                                                `folder:${row.id}`,
                                                Boolean(v),
                                              )
                                            }
                                          />
                                        </td>
                                        <th
                                          scope="row"
                                          className={cn(
                                            "p-3 text-left align-middle font-medium",
                                            dragOverFolderRowId === row.id
                                              ? "bg-primary/10"
                                              : null,
                                          )}
                                        >
                                          <div className="flex items-start gap-3">
                                            <Folder
                                              className="mt-0.5 size-4 text-muted-foreground"
                                              aria-hidden
                                            />
                                            <div className="min-w-0">
                                              <div className="flex min-w-0 items-start gap-2">
                                                <span
                                                  className="min-w-0 flex-1 font-medium wrap-break-word whitespace-normal"
                                                  title={
                                                    row.name ||
                                                    "Untitled folder"
                                                  }
                                                >
                                                  {row.name}
                                                </span>
                                                {pendingOps.has(
                                                  `folder:${row.id}`,
                                                ) ? (
                                                  <SpinnerGap
                                                    className="size-3.5 animate-spin text-muted-foreground"
                                                    aria-label="Syncing"
                                                  />
                                                ) : null}
                                              </div>
                                            </div>
                                          </div>
                                        </th>
                                        <td
                                          className={cn(
                                            "p-3 align-middle",
                                            dragOverFolderRowId === row.id
                                              ? "bg-primary/10"
                                              : null,
                                          )}
                                        >
                                          {formatRelativeDate(row.createdAt)}
                                        </td>
                                        <td
                                          className={cn(
                                            "p-3 align-middle",
                                            dragOverFolderRowId === row.id
                                              ? "bg-primary/10"
                                              : null,
                                          )}
                                        >
                                          {(() => {
                                            const total =
                                              folderSizeById.get(row.id) || 0;
                                            return total > 0
                                              ? formatFileSize(total)
                                              : "—";
                                          })()}
                                        </td>
                                        <td
                                          className={cn(
                                            "p-3 text-right align-middle",
                                            dragOverFolderRowId === row.id
                                              ? "bg-primary/10"
                                              : null,
                                          )}
                                          onClick={stopRowClick}
                                        >
                                          <div className="relative flex items-center justify-end gap-2">
                                            {canEditWorkspace ? (
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Open actions for ${row.name}`}
                                                    disabled={pendingOps.has(
                                                      `folder:${row.id}`,
                                                    )}
                                                  >
                                                    <DotsThree
                                                      className="size-4"
                                                      aria-hidden
                                                    />
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                  <DropdownMenuItem
                                                    onClick={() =>
                                                      openRenameDialog({
                                                        kind: "folder",
                                                        id: row.id,
                                                      })
                                                    }
                                                    disabled={pendingOps.has(
                                                      `folder:${row.id}`,
                                                    )}
                                                  >
                                                    <PencilSimple
                                                      className="mr-2 size-3.5"
                                                      aria-hidden
                                                    />
                                                    Rename
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    onClick={() =>
                                                      openMoveDialog({
                                                        kind: "folder",
                                                        id: row.id,
                                                      })
                                                    }
                                                    disabled={pendingOps.has(
                                                      `folder:${row.id}`,
                                                    )}
                                                  >
                                                    <ArrowsLeftRight
                                                      className="mr-2 size-3.5"
                                                      aria-hidden
                                                    />
                                                    Move to…
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() =>
                                                      requestDeleteTarget({
                                                        type: "folder",
                                                        id: row.id,
                                                      })
                                                    }
                                                    disabled={pendingOps.has(
                                                      `folder:${row.id}`,
                                                    )}
                                                  >
                                                    <Trash
                                                      className="mr-2 size-3.5"
                                                      aria-hidden
                                                    />
                                                    Delete
                                                  </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            ) : null}
                                          </div>
                                        </td>
                                      </tr>
                                    ) : (
                                      <tr
                                        key={`d_${row.id}`}
                                        className={cn(
                                          "cursor-pointer border-b border-border/60 transition-colors hover:bg-primary/[0.035]",
                                          isRecentlyAddedDoc(row.id)
                                            ? "dk-row-flash"
                                            : null,
                                        )}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Open ${row.title || "document"}`}
                                        draggable={canEditWorkspace}
                                        onClick={() =>
                                          handleDocumentAction(
                                            row.id,
                                            row.resourcePath,
                                          )
                                        }
                                        onKeyDown={(event) =>
                                          handleRowKeyDown(event, () =>
                                            handleDocumentAction(
                                              row.id,
                                              row.resourcePath,
                                            ),
                                          )
                                        }
                                        onMouseEnter={() =>
                                          prefetchPath(row.resourcePath)
                                        }
                                        onFocus={() =>
                                          prefetchPath(row.resourcePath)
                                        }
                                        onDragStart={(ev) =>
                                          handleDragStartDocument(ev, row.id)
                                        }
                                      >
                                        <td
                                          className="p-3 align-middle"
                                          onClick={stopRowClick}
                                        >
                                          <Checkbox
                                            aria-label={`Select ${row.title}`}
                                            checked={selected.has(
                                              `doc:${row.id}`,
                                            )}
                                            onCheckedChange={(v) =>
                                              toggleOne(
                                                `doc:${row.id}`,
                                                Boolean(v),
                                              )
                                            }
                                          />
                                        </td>
                                        <th
                                          scope="row"
                                          className="p-3 text-left align-middle font-medium"
                                        >
                                          <div className="flex items-start gap-3">
                                            <FileText
                                              className="h-4 w-4 text-muted-foreground"
                                              aria-hidden
                                            />
                                            <button
                                              type="button"
                                              className="min-w-0 text-left text-sm font-medium wrap-break-word whitespace-normal text-foreground hover:transform-none hover:text-foreground"
                                              title={
                                                row.title || "Untitled document"
                                              }
                                              onClick={(event) => {
                                                stopRowClick(event);
                                                handleDocumentAction(
                                                  row.id,
                                                  row.resourcePath,
                                                );
                                              }}
                                            >
                                              {row.title}
                                            </button>
                                            {pendingOps.has(`doc:${row.id}`) ? (
                                              <SpinnerGap
                                                className="size-3.5 animate-spin text-muted-foreground"
                                                aria-label="Syncing"
                                              />
                                            ) : null}
                                          </div>
                                        </th>
                                        <td className="p-3 align-middle">
                                          {formatRelativeDate(row.updatedAt)}
                                        </td>
                                        <td className="p-3 align-middle">
                                          {formatFileSize(row.sizeBytes)}
                                        </td>
                                        <td
                                          className="p-3 text-right align-middle"
                                          onClick={stopRowClick}
                                        >
                                          <div className="relative flex items-center justify-end gap-3">
                                            {enableRowLinks
                                              ? (() => {
                                                  const n =
                                                    docIdToLinkCount[row.id] ||
                                                    0;
                                                  return n > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                      <LinkIcon
                                                        className="h-3.5 w-3.5"
                                                        aria-hidden
                                                      />
                                                      {n}
                                                    </span>
                                                  ) : null;
                                                })()
                                              : null}
                                            {(() => {
                                              const actionLabel = "View";
                                              const ariaLabel = `${actionLabel} ${row.title || "document"}`;
                                              return (
                                                <Button
                                                  size="icon"
                                                  variant="outline"
                                                  onClick={() =>
                                                    handleDocumentAction(
                                                      row.id,
                                                      row.resourcePath,
                                                    )
                                                  }
                                                  aria-label={ariaLabel}
                                                >
                                                  <Eye
                                                    className="h-4 w-4"
                                                    aria-hidden
                                                  />
                                                </Button>
                                              );
                                            })()}
                                            {canEditWorkspace ? (
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Open actions for ${row.title}`}
                                                    disabled={pendingOps.has(
                                                      `doc:${row.id}`,
                                                    )}
                                                  >
                                                    <DotsThree
                                                      className="size-4"
                                                      aria-hidden
                                                    />
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                  <DropdownMenuItem
                                                    onClick={() =>
                                                      openRenameDialog({
                                                        kind: "doc",
                                                        id: row.id,
                                                      })
                                                    }
                                                    disabled={pendingOps.has(
                                                      `doc:${row.id}`,
                                                    )}
                                                  >
                                                    <PencilSimple
                                                      className="mr-2 size-3.5"
                                                      aria-hidden
                                                    />
                                                    Rename
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    onClick={() =>
                                                      openMoveDialog({
                                                        kind: "doc",
                                                        id: row.id,
                                                      })
                                                    }
                                                    disabled={pendingOps.has(
                                                      `doc:${row.id}`,
                                                    )}
                                                  >
                                                    <ArrowsLeftRight
                                                      className="mr-2 size-3.5"
                                                      aria-hidden
                                                    />
                                                    Move to…
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() =>
                                                      requestDeleteTarget({
                                                        type: "doc",
                                                        id: row.id,
                                                      })
                                                    }
                                                    disabled={pendingOps.has(
                                                      `doc:${row.id}`,
                                                    )}
                                                  >
                                                    <Trash
                                                      className="mr-2 size-3.5"
                                                      aria-hidden
                                                    />
                                                    Delete
                                                  </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            ) : null}
                                          </div>
                                        </td>
                                      </tr>
                                    ),
                                  )}
                                </tbody>
                              </table>
                              {totalCount > 0 && (
                                <div className="flex items-center justify-between gap-2 px-2 py-3">
                                  <div className="text-xs text-muted-foreground">
                                    Showing{" "}
                                    <span className="font-medium">
                                      {pageStart + 1}
                                    </span>{" "}
                                    –{" "}
                                    <span className="font-medium">
                                      {Math.min(
                                        pageStart + pageSize,
                                        totalCount,
                                      )}
                                    </span>{" "}
                                    of{" "}
                                    <span className="font-medium">
                                      {totalCount}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={String(pageSize)}
                                      onValueChange={(v) =>
                                        updateUrlParams({
                                          limit: v,
                                          page: "1",
                                        })
                                      }
                                    >
                                      <SelectTrigger
                                        size="sm"
                                        className="w-[110px]"
                                      >
                                        <SelectValue placeholder="Rows/page" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="10">
                                          10 / page
                                        </SelectItem>
                                        <SelectItem value="20">
                                          20 / page
                                        </SelectItem>
                                        <SelectItem value="50">
                                          50 / page
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          updateUrlParams({
                                            page: String(
                                              Math.max(1, currentPage - 1),
                                            ),
                                          })
                                        }
                                        disabled={currentPage <= 1}
                                      >
                                        Prev
                                      </Button>
                                      <span className="text-xs">
                                        Page {currentPage} / {pageCount}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          updateUrlParams({
                                            page: String(
                                              Math.min(
                                                pageCount,
                                                currentPage + 1,
                                              ),
                                            ),
                                          })
                                        }
                                        disabled={currentPage >= pageCount}
                                      >
                                        Next
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={handleStartInlineCreate}
            disabled={!canEditWorkspace}
          >
            Create folder
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              if (!canEditWorkspace) {
                showError("Viewer access: read-only.");
                return;
              }
              if (!ensureStorageCapacity()) return;
              filesInputRef.current?.click();
            }}
            disabled={!canEditWorkspace}
          >
            Upload files
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              if (!canEditWorkspace) {
                showError("Viewer access: read-only.");
                return;
              }
              if (!ensureStorageCapacity()) return;
              folderInputRef.current?.click();
            }}
            disabled={!canEditWorkspace}
          >
            Upload folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Folder tree below 1024px — same tree, opened from the Folders button */}
      <Sheet open={foldersSheetOpen} onOpenChange={setFoldersSheetOpen}>
        <SheetContent
          side="left"
          showCloseButton
          className="flex w-[320px] flex-col border-border bg-[var(--dk-surface-overlay)]"
        >
          <SheetHeader className="flex flex-row items-center gap-2 space-y-0 pr-8">
            <SheetTitle>Folders</SheetTitle>
            <span className="ml-auto">{folderTreeCreateAction}</span>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-1 pb-4">
            {folderTreeNode}
          </div>
        </SheetContent>
      </Sheet>

      {/* Link Settings removed on Documents page */}
      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm delete</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!deleteTarget) return null;
                if (deleteTarget.type === "doc") {
                  const doc = documents.find((x) => x.id === deleteTarget.id);
                  const docDisplayName =
                    doc?.title ||
                    `this ${describeFileType(doc?.file_type).nounLower}`;
                  return (
                    <span>
                      This will permanently delete{" "}
                      <strong>{docDisplayName}</strong>. This action cannot be
                      undone.
                    </span>
                  );
                }
                const f = folderList.find((x) => x.id === deleteTarget.id);
                const ids = deleteTarget
                  ? getDescendantFolderIds(deleteTarget.id)
                  : new Set<string>();
                const docCount = documents.filter(
                  (d) => d.folder_id && ids.has(d.folder_id as string),
                ).length;
                const folderCount = Array.from(ids).length - 1;
                return (
                  <span>
                    Deleting <strong>{f?.name || "this folder"}</strong> will
                    delete {docCount} document{docCount === 1 ? "" : "s"} and{" "}
                    {folderCount} subfolder{folderCount === 1 ? "" : "s"}. This
                    cannot be recovered.
                  </span>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete dialog */}
      <AlertDialog
        open={isBulkDeleteOpen}
        onOpenChange={(o) => {
          if (!o && !isDeleting) setIsBulkDeleteOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected items?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected documents and folders
              (including all documents within selected folders). This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmBulkDelete();
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={renameOpen && Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) closeRenameDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rename {renameTarget?.kind === "folder" ? "folder" : "file"}
            </DialogTitle>
            <DialogDescription>
              {renameTarget?.kind === "folder"
                ? "Choose a new folder name."
                : "Choose a new file name. The extension is locked."}
            </DialogDescription>
          </DialogHeader>
          {renameTarget
            ? renameTarget.kind === "doc"
              ? (() => {
                  const doc = documents.find((d) => d.id === renameTarget.id);
                  const ext = (doc?.file_type || "").trim().toLowerCase();
                  const isPending = pendingOps.has(`doc:${renameTarget.id}`);
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          placeholder="File name"
                          className="flex-1"
                          aria-label="File name"
                          disabled={isPending}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            const v = renameValue.trim();
                            if (!v || !renameTarget) return;
                            void renameDocument({
                              documentId: renameTarget.id,
                              newBaseName: v,
                            });
                            closeRenameDialog();
                          }}
                        />
                        {ext ? (
                          <span className="text-sm text-muted-foreground">
                            .{ext}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Only the base name can be changed.
                      </p>
                    </div>
                  );
                })()
              : (() => {
                  const isPending = pendingOps.has(`folder:${renameTarget.id}`);
                  return (
                    <div className="space-y-2">
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder="Folder name"
                        aria-label="Folder name"
                        disabled={isPending}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          const v = renameValue.trim();
                          if (!v || !renameTarget) return;
                          void renameFolder({
                            folderId: renameTarget.id,
                            name: v,
                          });
                          closeRenameDialog();
                        }}
                      />
                    </div>
                  );
                })()
            : null}
          <DialogFooter>
            <Button variant="outline" onClick={closeRenameDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const v = renameValue.trim();
                if (!renameTarget || !v) return;
                if (renameTarget.kind === "doc") {
                  void renameDocument({
                    documentId: renameTarget.id,
                    newBaseName: v,
                  });
                } else {
                  void renameFolder({ folderId: renameTarget.id, name: v });
                }
                closeRenameDialog();
              }}
              disabled={
                !renameTarget ||
                !renameValue.trim() ||
                pendingOps.has(
                  renameTarget.kind === "doc"
                    ? `doc:${renameTarget.id}`
                    : `folder:${renameTarget.id}`,
                )
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={moveOpen && Boolean(moveTarget)}
        onOpenChange={(open) => {
          if (!open) closeMoveDialog();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Move to…</DialogTitle>
            <DialogDescription>Select a destination folder.</DialogDescription>
          </DialogHeader>
          {moveTarget
            ? (() => {
                const isInvalidFolderMove =
                  moveTarget.kind === "folder" &&
                  Boolean(moveDestinationId) &&
                  isDescendantFolder({
                    maybeDescendantId: moveDestinationId!,
                    ancestorId: moveTarget.id,
                  });
                const destinationLabel =
                  moveDestinationId === null
                    ? rootBreadcrumbLabel
                    : folderMap.get(moveDestinationId)?.name ||
                      "Untitled folder";
                return (
                  <div className="grid gap-4 md:grid-cols-[320px_1fr]">
                    <div className="max-h-[50vh] overflow-y-auto pr-1">
                      <FolderTree
                        folders={folderList}
                        currentFolderId={moveDestinationId ?? "root"}
                        rootLabel={rootBreadcrumbLabel}
                        docCountByFolderId={folderDocCountById}
                        mode="readonly"
                        onSelectFolder={(id) => setMoveDestinationId(id)}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Destination</p>
                      <p className="text-sm text-muted-foreground">
                        {destinationLabel}
                      </p>
                      {isInvalidFolderMove ? (
                        <p className="text-xs text-destructive">
                          Cannot move a folder into itself.
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Tip: You can also drag-and-drop onto the folder tree.
                      </p>
                    </div>
                  </div>
                );
              })()
            : null}
          <DialogFooter>
            <Button variant="outline" onClick={closeMoveDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!moveTarget) return;
                if (moveTarget.kind === "doc") {
                  void moveDocument({
                    documentId: moveTarget.id,
                    destinationFolderId: moveDestinationId ?? null,
                  });
                } else {
                  void moveFolder({
                    folderId: moveTarget.id,
                    destinationParentId: moveDestinationId ?? null,
                  });
                }
                closeMoveDialog();
              }}
              disabled={
                !moveTarget ||
                pendingOps.has(
                  moveTarget.kind === "doc"
                    ? `doc:${moveTarget.id}`
                    : `folder:${moveTarget.id}`,
                ) ||
                (moveTarget.kind === "folder" &&
                  Boolean(moveDestinationId) &&
                  isDescendantFolder({
                    maybeDescendantId: moveDestinationId!,
                    ancestorId: moveTarget.id,
                  }))
              }
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UploadModal
        open={showUpload}
        onOpenChange={(nextOpen) => {
          setShowUpload(nextOpen);
          if (!nextOpen) {
            setStagedUploadFiles([]);
          }
        }}
        folders={folderList as unknown as Tables<"folders">[]}
        workspaceId={resolvedWorkspaceId}
        initialFiles={stagedUploadFiles}
        defaultFolderId={currentFolder === "root" ? null : currentFolder}
        onUploaded={() => {
          const prevIds = new Set(documents.map((doc) => doc.id));
          void refresh({ silent: true }).then((nextDocs) => {
            const added = nextDocs
              .filter((doc) => !prevIds.has(doc.id))
              .map((doc) => doc.id);
            markRowsRecentlyAdded(added);
          });
        }}
        dataRoomId={dataRoomId}
        rootLabel={rootBreadcrumbLabel}
        canUpload={!isStorageAtOrAboveLimit}
        onLimitReached={() => setStorageLimitModalOpen(true)}
        storageUsageLabel={storageUsageLabel}
        planName={plan.name}
        managePlanUrl={planManagementUrl}
        allowedFileExtensions={limits.allowedDocumentExtensions ?? undefined}
        allowedFileTypesLabel={
          limits.allowedDocumentExtensions
            ? `${plan.name} supports PDF uploads only`
            : undefined
        }
      />

      <Dialog
        open={storageLimitModalOpen}
        onOpenChange={setStorageLimitModalOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Storage limit reached</DialogTitle>
            <DialogDescription>
              {plan.name} includes{" "}
              {maxStorageBytes === null
                ? "unlimited storage"
                : formatStorage(maxStorageBytes)}{" "}
              per workspace. You’re currently using {storageUsageLabel}.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete unused files or upgrade your plan to continue uploading.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStorageLimitModalOpen(false)}
            >
              Close
            </Button>
            {canManageBilling ? (
              <Button asChild>
                <Link href={planManagementUrl}>Manage plan</Link>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default DocumentsClient;
