"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChartBar as BarChart3,
  DotsThree as MoreHorizontal,
  FileText,
  LinkSimple as LinkIcon,
  MagnifyingGlass,
  PencilSimple as Pencil,
  Plus,
  SpinnerGap as Loader2,
  Trash,
} from "@phosphor-icons/react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import type { Tables } from "@/types/generated/supabase";
import { showError, showSuccess, showWarning } from "@/lib/toast";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useDataRoomMetrics } from "@/hooks/useDataRoomMetrics";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { useWorkspaceMembership } from "@/hooks/useWorkspaceMembership";
import { formatDuration } from "@/lib/format";

type DataRoomRecord = Tables<"data_rooms">;

const DataRoomsClient: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const globalWorkspaces = useGlobalStore((s) => s.workspaces);
  const setGlobalWorkspaceId = useGlobalStore((s) => s.setCurrentWorkspaceId);

  const [dataRooms, setDataRooms] = useState<DataRoomRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [editableRoomIds, setEditableRoomIds] = useState<Set<string>>(
    () => new Set(),
  );
  const prefetchedPathsRef = useRef<Set<string>>(new Set());

  // Use the shared hook to fetch metrics based on the current data rooms list
  const currentDataRoomIds = useMemo(
    () => dataRooms.map((r) => r.id),
    [dataRooms],
  );
  const { metrics: metricsById, isLoading: isAnalyticsLoading } =
    useDataRoomMetrics(currentWorkspaceId, currentDataRoomIds);

  const [dialogState, setDialogState] = useState<{
    open: boolean;
    room: DataRoomRecord | null;
  }>({ open: false, room: null });
  const [redirectingToRoom, setRedirectingToRoom] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DataRoomRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const searchQuery: string = (() => {
    const q = searchParams.get("q");
    return (q || "").trim();
  })();
  const [searchText, setSearchText] = useState<string>(searchQuery);

  const updateUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      const queryString = params.toString();
      router.replace(
        queryString ? `/data-rooms?${queryString}` : "/data-rooms",
      );
    },
    [router, searchParams],
  );

  useEffect(() => {
    setSearchText(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchText !== searchQuery) {
        updateUrlParams({
          q: searchText || null,
          page: "1",
        });
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery, searchText, updateUrlParams]);

  const pageSize: number = (() => {
    const raw = searchParams.get("limit");
    const n = raw ? Number(raw) : 10;
    return Number.isFinite(n) && n > 0 ? Math.min(Math.max(5, n), 50) : 10;
  })();

  const requestedPage: number = (() => {
    const raw = searchParams.get("page");
    const n = raw ? Number(raw) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();

  const resolvedWorkspaceId = useMemo(() => {
    if (currentWorkspaceId) return currentWorkspaceId;
    const ids = new Set((dataRooms || []).map((room) => room.workspace_id));
    return ids.size === 1 ? Array.from(ids)[0] || null : null;
  }, [currentWorkspaceId, dataRooms]);

  const { refetchUsage } = usePlanLimits(resolvedWorkspaceId);
  const { membership } = useWorkspaceMembership(resolvedWorkspaceId);
  const canCreateDataRooms = membership?.dataRoomsAccessAll === "editor";
  const canEditRoom = useCallback(
    (roomId: string): boolean => editableRoomIds.has(roomId),
    [editableRoomIds],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!resolvedWorkspaceId || dataRooms.length === 0) {
        setEditableRoomIds(new Set());
        return;
      }

      if (canCreateDataRooms) {
        setEditableRoomIds(new Set(dataRooms.map((room) => room.id)));
        return;
      }

      const entries = await Promise.all(
        dataRooms.map(async (room) => {
          const { data, error } = await supabase.rpc("can_edit_data_room", {
            ws: room.workspace_id,
            room_id: room.id,
          });
          return [room.id, !error && Boolean(data)] as const;
        }),
      );

      if (cancelled) return;

      setEditableRoomIds(
        new Set(entries.filter(([, canEdit]) => canEdit).map(([id]) => id)),
      );
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [canCreateDataRooms, dataRooms, resolvedWorkspaceId, supabase]);

  useEffect(() => {
    if (!currentWorkspaceId && resolvedWorkspaceId) {
      setGlobalWorkspaceId(resolvedWorkspaceId);
    }
  }, [resolvedWorkspaceId, currentWorkspaceId, setGlobalWorkspaceId]);

  const fetchDataRooms = useCallback(async () => {
    setIsLoading(true);
    try {
      const query = supabase
        .from("data_rooms")
        .select("*")
        .order("created_at", { ascending: false });
      if (currentWorkspaceId) {
        query.eq("workspace_id", currentWorkspaceId);
      }
      const { data, error } = await query;
      if (error) throw error;
      setDataRooms(data || []);
    } catch (error) {
      console.error("Failed to load data rooms", error);
      showError("Unable to load data rooms");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, currentWorkspaceId]);

  useEffect(() => {
    void fetchDataRooms();
  }, [fetchDataRooms]);

  const filteredRooms = useMemo(() => {
    const term = searchQuery.toLowerCase();
    if (!term) return dataRooms;
    return dataRooms.filter((room) =>
      [room.name, room.description]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(term)),
    );
  }, [dataRooms, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / pageSize));
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRooms.length);
  const paginatedRooms = filteredRooms.slice(startIndex, endIndex);
  const showingStart = paginatedRooms.length ? startIndex + 1 : 0;
  const showingEnd = paginatedRooms.length ? endIndex : 0;

  const buildDocumentsPath = useCallback(
    (roomId: string) => `/data-rooms/${roomId}/documents`,
    [],
  );
  const buildSharePath = useCallback(
    (roomId: string) => `/data-rooms/${roomId}/share`,
    [],
  );
  const buildAnalyticsPath = useCallback(
    (roomId: string) => `/data-rooms/${roomId}/analytics`,
    [],
  );

  const prefetchPath = useCallback(
    (path: string) => {
      if (!path) return;
      if (prefetchedPathsRef.current.has(path)) return;
      prefetchedPathsRef.current.add(path);
      router.prefetch(path);
    },
    [router],
  );

  const prefetchRoomRoutes = useCallback(
    (roomId: string) => {
      prefetchPath(buildDocumentsPath(roomId));
      prefetchPath(buildSharePath(roomId));
      prefetchPath(buildAnalyticsPath(roomId));
    },
    [buildAnalyticsPath, buildDocumentsPath, buildSharePath, prefetchPath],
  );

  useEffect(() => {
    if (!paginatedRooms.length) return;
    let cancelled = false;
    let index = 0;
    const chunkSize = 3;
    const run = () => {
      if (cancelled) return;
      const chunk = paginatedRooms.slice(index, index + chunkSize);
      if (!chunk.length) return;
      chunk.forEach((room) => prefetchRoomRoutes(room.id));
      index += chunkSize;
      if (index < paginatedRooms.length) {
        window.setTimeout(run, 200);
      }
    };
    const timer = window.setTimeout(run, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [paginatedRooms, prefetchRoomRoutes]);

  const handleRequestCreateRoom = (
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (!canCreateDataRooms) {
      event?.preventDefault();
      showWarning("Viewer access: read-only.");
      return;
    }
    setDialogState({ open: true, room: null });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!deleteTarget.workspace_id) {
      showError("Unable to delete data room. Please try again.");
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch("/api/data-rooms/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId: deleteTarget.workspace_id,
          dataRoomId: deleteTarget.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Failed to delete data room", {
          status: res.status,
          error: data?.error ?? null,
        });
        showError("Unable to delete data room");
        return;
      }

      await fetchDataRooms();
      showSuccess("Data room deleted");
      void refetchUsage();
    } catch (error) {
      console.error("Failed to delete data room", error);
      showError("Unable to delete data room");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const resolvedWorkspaceForDialog = useMemo(() => {
    return (
      resolvedWorkspaceId ||
      globalWorkspaces[0]?.id ||
      dataRooms[0]?.workspace_id ||
      null
    );
  }, [resolvedWorkspaceId, globalWorkspaces, dataRooms]);

  return (
    <PageContainer maxWidth="7xl" className="space-y-7 pb-24 md:pb-10">
      <PageHeader
        title="Data Rooms"
        description="Create client-ready spaces with dedicated access controls and analytics."
        actions={
          <>
            <div className="relative w-full sm:w-auto">
              <MagnifyingGlass
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search data rooms…"
                className="h-9 w-full bg-card/35 pl-9 sm:w-64"
                aria-label="Search data rooms"
              />
            </div>
            {canCreateDataRooms ? (
              <Button
                data-guide="data-rooms-new-button"
                onClick={handleRequestCreateRoom}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "w-full md:w-auto",
                )}
              >
                <Plus className="size-4" aria-hidden />
                New Data Room
              </Button>
            ) : null}
          </>
        }
        className="mb-6"
      />
      <div data-guide="data-rooms-table">
        {isLoading ? (
          <div className="dk-nocturne-surface space-y-2 rounded-lg bg-card/35 p-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={`room_skeleton_${idx}`}
                className="h-14 w-full animate-pulse rounded bg-muted/60 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : dataRooms.length === 0 ? (
          <div>
            <EmptyState
              title="No data rooms yet"
              description="Create a data room to organize documents and share a branded experience."
              icon={
                <FileText
                  className="h-6 w-6 text-muted-foreground"
                  aria-hidden
                />
              }
              actions={
                canCreateDataRooms ? (
                  <Button size="sm" onClick={handleRequestCreateRoom}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Create Data Room
                  </Button>
                ) : null
              }
              className="border-primary/20 bg-card/35 py-16"
            />
          </div>
        ) : filteredRooms.length === 0 ? (
          <div>
            <EmptyState
              title={`No data rooms found for "${searchQuery}"`}
              description="Try adjusting your search term."
              compact
              className="border-primary/20 bg-card/35 py-16"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Mobile Card List */}
            <div className="space-y-3 md:hidden">
              {paginatedRooms.map((room) => {
                const metrics = metricsById[room.id];
                const created = format(new Date(room.created_at), "PP");
                const views = metrics?.totalViews ?? 0;
                const timeSpent = metrics?.totalTimeMs ?? 0;
                const canManageRoom = canEditRoom(room.id);
                return (
                  <div
                    key={`mobile_${room.id}`}
                    className="dk-nocturne-surface group relative space-y-3 overflow-hidden rounded-lg bg-card/45 p-4 transition-colors hover:border-primary/30 hover:bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))]"
                  >
                    <div
                      className="absolute inset-y-4 left-0 w-0.5 rounded-r bg-primary/55"
                      aria-hidden
                    />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <h3 className="font-medium wrap-break-word">
                          {room.name}
                        </h3>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {room.description || "No description"}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="-mt-1 -mr-1 h-9 w-9"
                            aria-label={`Actions for ${room.name}`}
                          >
                            <MoreHorizontal
                              className="h-4 w-4"
                              weight="bold"
                              aria-hidden
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(buildSharePath(room.id))}
                            onMouseEnter={() => prefetchRoomRoutes(room.id)}
                            onFocus={() => prefetchRoomRoutes(room.id)}
                          >
                            <LinkIcon
                              className="mr-2 h-3.5 w-3.5"
                              aria-hidden
                            />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(buildAnalyticsPath(room.id))
                            }
                            onMouseEnter={() => prefetchRoomRoutes(room.id)}
                            onFocus={() => prefetchRoomRoutes(room.id)}
                          >
                            <BarChart3
                              className="mr-2 h-3.5 w-3.5"
                              aria-hidden
                            />
                            Analytics
                          </DropdownMenuItem>
                          {canManageRoom ? (
                            <>
                              <DropdownMenuItem
                                onClick={() =>
                                  setDialogState({ open: true, room })
                                }
                              >
                                <Pencil
                                  className="mr-2 h-3.5 w-3.5"
                                  aria-hidden
                                />
                                Edit details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteTarget(room)}
                              >
                                <Trash
                                  className="mr-2 h-3.5 w-3.5"
                                  aria-hidden
                                />
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
                      <div className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" aria-hidden />
                        {isAnalyticsLoading ? "—" : views} views
                      </div>
                      {timeSpent > 0 && !isAnalyticsLoading ? (
                        <div>{formatDuration(timeSpent)}</div>
                      ) : null}
                      <div>{created}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => router.push(buildDocumentsPath(room.id))}
                      onMouseEnter={() => prefetchRoomRoutes(room.id)}
                      onFocus={() => prefetchRoomRoutes(room.id)}
                    >
                      <FileText className="mr-2 h-3.5 w-3.5" aria-hidden />
                      Open Data Room
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="dk-nocturne-surface hidden overflow-hidden rounded-lg bg-card/30 md:block">
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <caption className="sr-only">Data rooms</caption>
                  <thead className="bg-muted/20 [&_tr]:border-b [&_tr]:border-border/60">
                    <tr>
                      <th className="h-10 px-4 text-left align-middle text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Name
                      </th>
                      <th className="h-10 px-4 text-left align-middle text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Created
                      </th>
                      <th className="h-10 px-4 text-left align-middle text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Total Views
                      </th>
                      <th className="h-10 px-4 text-left align-middle text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Time Spent
                      </th>
                      <th className="h-10 px-4 text-right align-middle text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {paginatedRooms.map((room) => {
                      const metrics = metricsById[room.id];
                      const created = format(new Date(room.created_at), "PP");
                      const views = metrics?.totalViews ?? 0;
                      const time = metrics?.totalTimeMs ?? 0;
                      const canManageRoom = canEditRoom(room.id);
                      return (
                        <tr
                          key={room.id}
                          className="border-b border-border/50 transition-colors last:border-0 hover:bg-primary/[0.025]"
                        >
                          <td className="max-w-xs space-y-0 p-4 align-middle [&:has([role=checkbox])]:pr-0">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="link"
                                onClick={() =>
                                  router.push(buildDocumentsPath(room.id))
                                }
                                onMouseEnter={() => prefetchRoomRoutes(room.id)}
                                onFocus={() => prefetchRoomRoutes(room.id)}
                                className={cn(
                                  "text-md! inline-flex flex-col items-start gap-1 p-0 text-left font-medium wrap-break-word text-foreground hover:underline",
                                )}
                              >
                                {room.name}
                              </Button>
                            </div>
                            <div className="line-clamp-1 text-xs text-muted-foreground">
                              {room.description || "No description"}
                            </div>
                          </td>
                          <td className="p-4 align-middle text-sm whitespace-nowrap [&:has([role=checkbox])]:pr-0">
                            {created}
                          </td>
                          <td className="p-4 align-middle text-sm [&:has([role=checkbox])]:pr-0">
                            {isAnalyticsLoading ? "—" : views}
                          </td>
                          <td className="p-4 align-middle text-sm [&:has([role=checkbox])]:pr-0">
                            {isAnalyticsLoading ? "—" : formatDuration(time)}
                          </td>
                          <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                            <div
                              className="inline-flex items-center justify-end gap-2"
                              data-guide="data-rooms-actions"
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  router.push(buildDocumentsPath(room.id))
                                }
                                onMouseEnter={() => prefetchRoomRoutes(room.id)}
                                onFocus={() => prefetchRoomRoutes(room.id)}
                                aria-label={`Open data room ${room.name}`}
                              >
                                <FileText
                                  className="mr-1 h-4 w-4"
                                  aria-hidden
                                />
                                Open
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Open actions"
                                  >
                                    <MoreHorizontal
                                      className="h-4 w-4"
                                      weight="bold"
                                      aria-hidden
                                    />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(buildSharePath(room.id))
                                    }
                                    onMouseEnter={() =>
                                      prefetchRoomRoutes(room.id)
                                    }
                                    onFocus={() => prefetchRoomRoutes(room.id)}
                                  >
                                    <LinkIcon
                                      className="mr-2 h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                    Share
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(buildAnalyticsPath(room.id))
                                    }
                                    onMouseEnter={() =>
                                      prefetchRoomRoutes(room.id)
                                    }
                                    onFocus={() => prefetchRoomRoutes(room.id)}
                                  >
                                    <BarChart3
                                      className="mr-2 h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                    Analytics
                                  </DropdownMenuItem>
                                  {canManageRoom ? (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          setDialogState({ open: true, room })
                                        }
                                      >
                                        <Pencil
                                          className="mr-2 h-3.5 w-3.5"
                                          aria-hidden
                                        />
                                        Edit details
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={() => setDeleteTarget(room)}
                                      >
                                        <Trash
                                          className="mr-2 h-3.5 w-3.5"
                                          aria-hidden
                                        />
                                        Delete
                                      </DropdownMenuItem>
                                    </>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/20 px-3 py-2.5 text-sm md:flex-row md:items-center md:justify-between">
              <p className="text-muted-foreground">
                Showing {showingStart}-{showingEnd} of {filteredRooms.length}{" "}
                data rooms
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() =>
                    updateUrlParams({
                      page: Math.max(1, currentPage - 1).toString(),
                    })
                  }
                >
                  Previous
                </Button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    currentPage === totalPages || filteredRooms.length === 0
                  }
                  onClick={() =>
                    updateUrlParams({
                      page: Math.min(totalPages, currentPage + 1).toString(),
                    })
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <DataRoomDialog
        open={dialogState.open}
        room={dialogState.room}
        onOpenChange={(open) =>
          setDialogState({ open, room: open ? dialogState.room : null })
        }
        supabase={supabase}
        workspaceId={resolvedWorkspaceForDialog}
        onSaved={(savedRoom) => {
          const isCreating = !dialogState.room;
          setDialogState({ open: false, room: null });
          if (isCreating) {
            setRedirectingToRoom({
              id: savedRoom.id,
              name: savedRoom.name || "New data room",
            });
            router.push(`/data-rooms/${savedRoom.id}/documents`);
          } else {
            void fetchDataRooms();
          }
          void refetchUsage();
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete data room?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <span>
                  This will permanently delete{" "}
                  <strong>{deleteTarget.name}</strong> and all nested folders
                  and documents.
                </span>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {redirectingToRoom ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="Opening data room"
        >
          <div className="dk-nocturne-overlay w-full max-w-md rounded-[14px] p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <Loader2
                  className="h-5 w-5 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Opening data room…</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preparing{" "}
                  <span className="font-medium">{redirectingToRoom.name}</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
};

interface DataRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: DataRoomRecord | null;
  supabase: ReturnType<typeof createSupabaseBrowserClient>;
  workspaceId: string | null;
  onSaved: (room: DataRoomRecord) => void;
}

const DataRoomDialog: React.FC<DataRoomDialogProps> = ({
  open,
  onOpenChange,
  room,
  supabase,
  workspaceId,
  onSaved,
}) => {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (room) {
      setName(room.name);
      setDescription(room.description || "");
    } else {
      setName("");
      setDescription("");
    }
  }, [room, open]);

  const handleSubmit = async () => {
    if (!workspaceId) {
      showError("Select a workspace before creating a data room");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      showError("Name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) {
        showError("Not authenticated");
        setIsSubmitting(false);
        return;
      }
      if (room) {
        const { data, error } = await supabase
          .from("data_rooms")
          .update({
            name: trimmedName,
            description: description.trim() || null,
          })
          .eq("id", room.id)
          .select("*")
          .single();
        if (error) throw error;
        showSuccess("Data room updated");
        onSaved(data as DataRoomRecord);
      } else {
        const { data, error } = await supabase
          .from("data_rooms")
          .insert({
            name: trimmedName,
            description: description.trim() || null,
            workspace_id: workspaceId,
            created_by: userId,
          })
          .select("*")
          .single();
        if (error) throw error;
        showSuccess("Data room created");
        trackProductEvent("data_room_created", {
          data_room_id: (data as DataRoomRecord).id,
          workspace_id: workspaceId,
        });
        onSaved(data as DataRoomRecord);
      }
    } catch (error) {
      console.error("Failed to upsert data room", error);
      showError(
        room ? "Unable to update data room" : "Unable to create data room",
      );
    } finally {
      setIsSubmitting(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {room ? "Edit data room" : "Create data room"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label
              className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              htmlFor="data-room-name"
            >
              Name
            </label>
            <Input
              id="data-room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Series B diligence"
              className="bg-card/35"
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              htmlFor="data-room-description"
            >
              Description (optional)
            </label>
            <Textarea
              id="data-room-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-card/35"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            )}
            {room ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DataRoomsClient;
