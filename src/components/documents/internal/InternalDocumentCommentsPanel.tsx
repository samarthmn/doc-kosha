"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CaretDown,
  ChatCircle,
  CircleNotch,
  Tag,
  X,
} from "@phosphor-icons/react";
import { useInternalDocumentViewer } from "@/components/documents/internal/InternalDocumentViewerContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CommentAnchor } from "@/hooks/usePublicComments";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { CommentThreadCard } from "@/modules/comments/components/CommentThreadCard";
import {
  useInternalCommentsOverlayContext,
  type InternalCommentsHighlightThread,
} from "@/modules/comments/components/InternalCommentsOverlayContext";

type ThreadRow = {
  id: string;
  workspace_id: string;
  link_id: string;
  document_id: string;
  page_number: number;
  anchor: unknown;
  state: "open" | "resolved";
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  body: string;
  state?: "active" | "deleted";
  author_label: string;
  author_email?: string | null;
  author_color: string;
  created_at: string;
};

type LinkMeta = { id: string; name: string | null };

type ThreadWithMessages = {
  thread: ThreadRow;
  messages: MessageRow[];
  linkName: string;
  quote: string | null;
};

const formatTime = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));

const toCommentAnchor = (value: unknown): CommentAnchor => {
  const parsed =
    value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const rectsRaw =
    parsed && "rects" in parsed
      ? (parsed as Record<string, unknown>).rects
      : null;
  const quoteRaw =
    parsed && "quote" in parsed
      ? (parsed as Record<string, unknown>).quote
      : null;

  const rects = Array.isArray(rectsRaw)
    ? rectsRaw
        .map((rect) => {
          if (!rect || typeof rect !== "object" || Array.isArray(rect))
            return null;
          const row = rect as {
            x?: unknown;
            y?: unknown;
            w?: unknown;
            h?: unknown;
          };
          if (
            typeof row.x !== "number" ||
            typeof row.y !== "number" ||
            typeof row.w !== "number" ||
            typeof row.h !== "number"
          ) {
            return null;
          }
          if (row.w <= 0 || row.h <= 0) return null;
          return { x: row.x, y: row.y, w: row.w, h: row.h };
        })
        .filter(
          (rect): rect is { x: number; y: number; w: number; h: number } =>
            Boolean(rect),
        )
    : [];

  const quote =
    typeof quoteRaw === "string" && quoteRaw.trim() ? quoteRaw : undefined;

  return { rects, ...(quote ? { quote } : {}) };
};

const InternalDocumentCommentsPanel: React.FC = () => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { doc, workspaceId } = useInternalDocumentViewer();

  const {
    setHighlightThreads,
    selectedThreadId,
    setSelectedThreadId,
    composerSelection,
    setComposerSelection,
  } = useInternalCommentsOverlayContext();

  const [threads, setThreads] = useState<ThreadWithMessages[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [links, setLinks] = useState<LinkMeta[]>([]);
  const [linksLoading, setLinksLoading] = useState<boolean>(true);
  const [createLinkId, setCreateLinkId] = useState<string | null>(null);
  const [createBody, setCreateBody] = useState<string>("");
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [filteredLinkIds, setFilteredLinkIds] = useState<string[]>([]);

  const [replyByThreadId, setReplyByThreadId] = useState<
    Record<string, string>
  >({});
  const [submittingThreadId, setSubmittingThreadId] = useState<string | null>(
    null,
  );
  const [resolvedExpandedByThreadId, setResolvedExpandedByThreadId] = useState<
    Record<string, boolean>
  >({});

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    return threads.find((t) => t.thread.id === selectedThreadId) ?? null;
  }, [selectedThreadId, threads]);

  const resolvedExpanded = useMemo(() => {
    if (!selectedThread) return true;
    return (
      resolvedExpandedByThreadId[selectedThread.thread.id] ??
      selectedThread.thread.state === "open"
    );
  }, [resolvedExpandedByThreadId, selectedThread]);

  const loadLinks = useCallback(async (): Promise<void> => {
    if (!doc.id || !workspaceId) return;

    setLinksLoading(true);
    try {
      const { data, error } = await supabase
        .from("links")
        .select("id,name,comments_enabled")
        .eq("document_id", doc.id)
        .eq("workspace_id", workspaceId)
        .eq("comments_enabled", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[InternalComments] loadLinks failed", error);
        setLinks([]);
        return;
      }

      const rows = (data ?? []) as Array<
        LinkMeta & { comments_enabled?: boolean | null }
      >;
      setLinks(rows.map((row) => ({ id: row.id, name: row.name ?? null })));
    } finally {
      setLinksLoading(false);
    }
  }, [doc.id, supabase, workspaceId]);

  const loadThreads = useCallback(async (): Promise<void> => {
    if (!doc.id || !workspaceId) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data: rawThreads, error: threadError } = await supabase
        .from("comment_threads")
        .select(
          "id,workspace_id,link_id,document_id,page_number,anchor,state,resolved_at,created_at,updated_at",
        )
        .eq("document_id", doc.id)
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });

      if (threadError) {
        console.error("[InternalComments] loadThreads failed", threadError);
        setErrorMessage("Unable to load comments");
        setThreads([]);
        setHighlightThreads([]);
        return;
      }

      const threadRows = (rawThreads ?? []) as ThreadRow[];
      const threadIds = threadRows.map((t) => t.id);

      if (threadIds.length === 0) {
        setThreads([]);
        return;
      }

      const uniqueLinkIds = Array.from(
        new Set(threadRows.map((t) => t.link_id)),
      );

      const [messagesRes, linksRes] = await Promise.all([
        supabase
          .from("comment_messages")
          .select(
            "id,thread_id,body,state,author_label,author_email,author_color,created_at",
          )
          .in("thread_id", threadIds)
          .order("created_at", { ascending: true }),
        supabase.from("links").select("id,name").in("id", uniqueLinkIds),
      ]);

      const messageRows = (messagesRes.data ?? []) as MessageRow[];
      const linkRows = (linksRes.data ?? []) as LinkMeta[];

      const linkNameById = new Map<string, string>();
      for (const link of linkRows) {
        linkNameById.set(link.id, link.name ?? "Untitled link");
      }

      const messagesByThreadId = new Map<string, MessageRow[]>();
      for (const message of messageRows) {
        const list = messagesByThreadId.get(message.thread_id) ?? [];
        list.push(message);
        messagesByThreadId.set(message.thread_id, list);
      }

      const merged: ThreadWithMessages[] = threadRows.map((thread) => {
        const anchor = toCommentAnchor(thread.anchor);
        return {
          thread,
          messages: messagesByThreadId.get(thread.id) ?? [],
          linkName: linkNameById.get(thread.link_id) ?? "Link",
          quote: anchor.quote ?? null,
        };
      });

      setThreads(merged);

      if (
        selectedThreadId &&
        !merged.some((t) => t.thread.id === selectedThreadId)
      ) {
        setSelectedThreadId(null);
      }
    } catch (err) {
      console.error("[InternalComments] loadThreads error", err);
      setErrorMessage("Unable to load comments");
      setThreads([]);
      setHighlightThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    doc.id,
    selectedThreadId,
    setHighlightThreads,
    setSelectedThreadId,
    supabase,
    workspaceId,
  ]);

  const submitReply = useCallback(
    async (threadId: string) => {
      if (submittingThreadId) return;
      const body = (replyByThreadId[threadId] ?? "").trim();
      if (!body) return;

      setSubmittingThreadId(threadId);
      try {
        const res = await fetch("/api/comments/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ threadId, body }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message =
            (typeof payload?.error === "string" && payload.error) ||
            "Unable to send reply";
          showError(message);
          return;
        }

        setReplyByThreadId((prev) => ({ ...prev, [threadId]: "" }));
        showSuccess("Reply sent");
        await loadThreads();
      } finally {
        setSubmittingThreadId(null);
      }
    },
    [loadThreads, replyByThreadId, submittingThreadId],
  );

  const toggleResolve = useCallback(
    async (threadId: string, nextAction: "resolve" | "unresolve") => {
      if (submittingThreadId) return;
      setSubmittingThreadId(threadId);
      try {
        const res = await fetch("/api/comments/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ threadId, action: nextAction }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message =
            (typeof payload?.error === "string" && payload.error) ||
            "Unable to update thread";
          showError(message);
          return;
        }

        setResolvedExpandedByThreadId((prev) => ({
          ...prev,
          [threadId]: nextAction === "unresolve",
        }));

        await loadThreads();
      } finally {
        setSubmittingThreadId(null);
      }
    },
    [loadThreads, submittingThreadId],
  );

  const submitNewThread = useCallback(async () => {
    if (!composerSelection) return;
    if (createSubmitting) return;

    const body = createBody.trim();
    if (!body) return;
    if (body.length > 1000) {
      showError("Comment is too long");
      return;
    }

    if (!createLinkId) {
      showError("Select a link to attach this comment");
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await fetch("/api/comments/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          linkId: createLinkId,
          documentId: doc.id,
          pageNumber: composerSelection.pageNumber,
          anchor: composerSelection.anchor,
          body,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message =
          (typeof payload?.error === "string" && payload.error) ||
          "Unable to create comment";
        showError(message);
        return;
      }

      const payload = (await res.json().catch(() => null)) as {
        threadId?: unknown;
      } | null;
      const createdThreadId =
        payload && typeof payload.threadId === "string"
          ? payload.threadId
          : null;

      showSuccess("Comment created");
      setCreateBody("");
      setComposerSelection(null);
      await loadThreads();
      if (createdThreadId) {
        setSelectedThreadId(createdThreadId);
      }
    } finally {
      setCreateSubmitting(false);
    }
  }, [
    composerSelection,
    createBody,
    createLinkId,
    createSubmitting,
    doc.id,
    loadThreads,
    setComposerSelection,
    setSelectedThreadId,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        setCurrentUserEmail(data.user?.email?.trim() ?? null);
      } catch {
        if (cancelled) return;
        setCurrentUserEmail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    setThreads([]);
    setReplyByThreadId({});
    setSelectedThreadId(null);
    setComposerSelection(null);
    setCreateBody("");
    setCreateLinkId(null);
    setFilteredLinkIds([]);
    setHighlightThreads([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    void loadLinks();
    void loadThreads();
  }, [loadLinks, loadThreads]);

  const linkFilterOptions = useMemo((): Array<LinkMeta & { label: string }> => {
    const byId = new Map<string, LinkMeta & { label: string }>();

    for (const link of links) {
      const label = link.name?.trim() || "Untitled link";
      byId.set(link.id, { ...link, label });
    }

    for (const thread of threads) {
      if (!byId.has(thread.thread.link_id)) {
        byId.set(thread.thread.link_id, {
          id: thread.thread.link_id,
          name: thread.linkName,
          label: thread.linkName || "Link",
        });
      }
    }

    return Array.from(byId.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [links, threads]);

  const filteredLinkIdSet = useMemo(
    () => new Set(filteredLinkIds),
    [filteredLinkIds],
  );

  const visibleThreads = useMemo(() => {
    if (filteredLinkIds.length === 0) return threads;
    return threads.filter((t) => filteredLinkIdSet.has(t.thread.link_id));
  }, [filteredLinkIdSet, filteredLinkIds.length, threads]);

  useEffect(() => {
    const filtered = filteredLinkIds.filter((id) =>
      linkFilterOptions.some((link) => link.id === id),
    );
    if (filtered.length !== filteredLinkIds.length) {
      setFilteredLinkIds(filtered);
    }
  }, [filteredLinkIds, linkFilterOptions]);

  useEffect(() => {
    const all: InternalCommentsHighlightThread[] = threads
      .filter((thread) => thread.thread.state === "open")
      .map((thread) => ({
        id: thread.thread.id,
        linkId: thread.thread.link_id,
        pageNumber: thread.thread.page_number,
        anchor: toCommentAnchor(thread.thread.anchor),
        state: thread.thread.state,
      }));

    const next =
      filteredLinkIds.length === 0
        ? all
        : all.filter((thread) => filteredLinkIdSet.has(thread.linkId));
    setHighlightThreads(next);
  }, [filteredLinkIdSet, filteredLinkIds.length, setHighlightThreads, threads]);

  useEffect(() => {
    if (!composerSelection) return;
    if (createLinkId) return;
    if (linksLoading) return;
    if (links.length === 1) {
      setCreateLinkId(links[0].id);
    }
  }, [composerSelection, createLinkId, links, linksLoading]);

  if (isLoading) {
    return (
      <div
        className="m-4 flex items-center gap-2 rounded-lg border border-border/70 bg-card/45 p-4 text-sm text-muted-foreground"
        role="status"
      >
        <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />
        <span>Loading comments…</span>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="dk-nocturne-surface m-4 space-y-2 rounded-lg p-4">
        <p className="text-sm font-medium">Comments</p>
        <p className="text-sm text-destructive">{errorMessage}</p>
        <Button variant="outline" size="sm" onClick={() => void loadThreads()}>
          Retry
        </Button>
      </div>
    );
  }

  const showDetail = Boolean(composerSelection || selectedThread);

  return (
    <div className="h-full min-h-0 p-4 lg:p-5">
      <div className="flex h-full min-h-0 flex-col gap-4">
        {!showDetail && (
          <div className="border-b border-border/60 pb-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Comments</p>
                <p className="text-xs text-muted-foreground">
                  Filter by link to focus the PDF highlights. Replies notify the
                  thread creator.
                </p>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-2"
                    aria-label="Filter comments by link"
                    disabled={linksLoading && linkFilterOptions.length === 0}
                  >
                    <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="max-w-[10rem] truncate text-xs">
                      {filteredLinkIds.length === 0
                        ? "All links"
                        : filteredLinkIds.length === 1
                          ? (linkFilterOptions.find(
                              (l) => l.id === filteredLinkIds[0],
                            )?.label ?? "1 link")
                          : `${filteredLinkIds.length} links`}
                    </span>
                    <CaretDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-72 overflow-hidden rounded-lg p-0"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <p className="text-xs font-semibold">Filter links</p>
                    {filteredLinkIds.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => setFilteredLinkIds([])}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Clear
                      </Button>
                    ) : null}
                  </div>

                  <div className="max-h-72 overflow-y-auto px-1 py-1">
                    {linkFilterOptions.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-muted-foreground">
                        No share links with comments enabled.
                      </div>
                    ) : (
                      linkFilterOptions.map((link) => {
                        const checked =
                          filteredLinkIds.length === 0
                            ? true
                            : filteredLinkIdSet.has(link.id);
                        return (
                          <label
                            key={link.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:outline-none hover:bg-muted",
                              checked ? "bg-muted/40" : "bg-transparent",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                const nextChecked = value === true;

                                if (filteredLinkIds.length === 0) {
                                  if (nextChecked) return;
                                  setFilteredLinkIds(
                                    linkFilterOptions
                                      .map((option) => option.id)
                                      .filter((id) => id !== link.id),
                                  );
                                  return;
                                }

                                setFilteredLinkIds((prev) => {
                                  const next = new Set(prev);
                                  if (nextChecked) next.add(link.id);
                                  else next.delete(link.id);

                                  if (next.size === 0) return [];
                                  if (next.size === linkFilterOptions.length)
                                    return [];
                                  return Array.from(next);
                                });
                              }}
                              aria-label={link.label}
                            />
                            <span className="min-w-0 flex-1 truncate text-xs">
                              {link.label}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>

                  {linkFilterOptions.length > 0 ? (
                    <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                      {filteredLinkIds.length === 0
                        ? "Showing comments from all links."
                        : `Showing ${visibleThreads.length} of ${threads.length} threads.`}
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {showDetail ? (
            <div className="flex h-full flex-col gap-4">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 w-fit px-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setComposerSelection(null);
                  setSelectedThreadId(null);
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                Back to list
              </Button>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-card/35 p-3">
                {composerSelection ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">New comment</p>
                      <Select
                        value={createLinkId ?? undefined}
                        onValueChange={(value) => setCreateLinkId(value)}
                        disabled={linksLoading || links.length === 0}
                      >
                        <SelectTrigger className="w-full" size="sm">
                          <SelectValue
                            placeholder={
                              links.length === 0
                                ? "No share links available"
                                : "Select a link"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {links.map((link) => (
                            <SelectItem key={link.id} value={link.id}>
                              {link.name ?? "Untitled link"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <CommentThreadCard
                      mode="composer"
                      quote={
                        composerSelection.anchor.quote ??
                        composerSelection.selectedText
                      }
                      title={currentUserEmail ?? "You"}
                      subtitle="Add a comment"
                      avatarInitial={(
                        currentUserEmail?.slice(0, 1) || "Y"
                      ).toUpperCase()}
                      onClose={() => {
                        setComposerSelection(null);
                        setCreateBody("");
                      }}
                      body={createBody}
                      onBodyChange={setCreateBody}
                      placeholder="Write a comment…"
                      onSubmit={() => void submitNewThread()}
                      submitLabel="Comment"
                      submitSubmitting={createSubmitting}
                      maxChars={1000}
                      minChars={1}
                      submitDisabled={!createLinkId}
                    />
                  </div>
                ) : selectedThread ? (
                  (() => {
                    const firstMessage = selectedThread.messages[0];
                    const title = firstMessage?.author_label ?? "Viewer";
                    const subtitleParts: string[] = [];
                    subtitleParts.push(selectedThread.linkName);
                    if (firstMessage?.created_at) {
                      subtitleParts.push(formatTime(firstMessage.created_at));
                    }
                    const subtitle = subtitleParts.join(" · ");

                    return (
                      <CommentThreadCard
                        mode="thread"
                        quote={selectedThread.quote}
                        title={title}
                        subtitle={subtitle}
                        avatarInitial={title.slice(0, 1) || "V"}
                        avatarColor={firstMessage?.author_color ?? null}
                        onClose={() => setSelectedThreadId(null)}
                        state={
                          selectedThread.thread.state === "resolved"
                            ? "resolved"
                            : "open"
                        }
                        resolvedExpanded={resolvedExpanded}
                        onResolvedExpandedChange={(expanded) => {
                          setResolvedExpandedByThreadId((prev) => ({
                            ...prev,
                            [selectedThread.thread.id]: expanded,
                          }));
                        }}
                        canToggleResolve
                        resolveSubmitting={
                          submittingThreadId === selectedThread.thread.id
                        }
                        onToggleResolve={() =>
                          void toggleResolve(
                            selectedThread.thread.id,
                            selectedThread.thread.state === "resolved"
                              ? "unresolve"
                              : "resolve",
                          )
                        }
                        messages={selectedThread.messages.map((m) => ({
                          id: m.id,
                          body: m.body,
                          authorLabel: m.author_label,
                          authorColor: m.author_color,
                          createdAt: m.created_at,
                          state: m.state,
                          isMe: false,
                        }))}
                        body={replyByThreadId[selectedThread.thread.id] ?? ""}
                        onBodyChange={(value) =>
                          setReplyByThreadId((prev) => ({
                            ...prev,
                            [selectedThread.thread.id]: value,
                          }))
                        }
                        placeholder="Reply…"
                        onSubmit={() =>
                          void submitReply(selectedThread.thread.id)
                        }
                        submitLabel="Send"
                        submitSubmitting={
                          submittingThreadId === selectedThread.thread.id
                        }
                        submitDisabled={selectedThread.thread.state !== "open"}
                        maxChars={1000}
                        minChars={1}
                      />
                    );
                  })()
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col gap-2">
              <div className="flex-1 overflow-y-auto pr-1">
                {visibleThreads.length === 0 ? (
                  <div className="p-3">
                    <EmptyState
                      title={
                        threads.length === 0
                          ? "No comments yet"
                          : "No comments match"
                      }
                      description={
                        threads.length === 0
                          ? "Select text in the document to add the first comment."
                          : "Try clearing the link filter to see more threads."
                      }
                      icon={
                        <ChatCircle
                          className="h-6 w-6 text-muted-foreground"
                          aria-hidden
                        />
                      }
                      compact
                    />
                  </div>
                ) : (
                  visibleThreads.map((item) => {
                    const active = item.thread.id === selectedThreadId;
                    const label = item.quote ?? item.messages[0]?.body ?? "";
                    return (
                      <button
                        key={item.thread.id}
                        type="button"
                        className={cn(
                          "group w-full space-y-1.5 rounded border px-3 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                          active
                            ? "border-primary/40 bg-primary/[0.055] shadow-[inset_2px_0_0_var(--primary)]"
                            : "border-border/55 bg-card/35 hover:border-primary/25 hover:bg-primary/[0.025]",
                        )}
                        onClick={() => {
                          setComposerSelection(null);
                          setSelectedThreadId(item.thread.id);
                        }}
                      >
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <p
                            className={cn(
                              "min-w-0 truncate text-xs font-medium",
                              active
                                ? "text-foreground"
                                : "text-muted-foreground group-hover:text-foreground",
                            )}
                          >
                            {item.linkName}
                          </p>
                          {item.thread.state === "resolved" ? (
                            <Badge
                              variant="secondary"
                              className="h-5 bg-muted/50 px-1.5 text-[10px] font-medium text-muted-foreground"
                            >
                              Resolved
                            </Badge>
                          ) : (
                            <span className="size-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="line-clamp-2 text-xs font-medium text-pretty break-words">
                          {label}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatTime(item.thread.updated_at)}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InternalDocumentCommentsPanel;
