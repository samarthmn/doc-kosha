"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChatCircleDots, CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { PdfViewerOverlay } from "@/components/documents/pdf/engine/MozillaPdfViewer";
import {
  areaToScreenArea,
  getAreaCssProperties,
} from "@/components/documents/pdf/geometry/pageAreas";
import type { TextLayerSelection } from "@/components/documents/pdf/selection/textLayerSelectionGeometry";
import { useTextLayerSelection } from "@/components/documents/pdf/selection/useTextLayerSelection";
import {
  usePublicComments,
  type CommentThreadDetail,
  type CommentThreadSummary,
} from "@/hooks/usePublicComments";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/toast";
import { CommentThreadCard } from "@/modules/comments/components/CommentThreadCard";
import { formatPublicDate } from "@/modules/public-links/i18n";
import type { PublicLanguage } from "@/modules/public-links/types";
import {
  groupCommentSelectionByPage,
  pageAreasToStoredCommentAnchor,
  storedCommentAnchorToPageAreas,
} from "@/modules/comments/commentAnchorGeometry";

const COMMENT_BODY_MIN_CHARS = 1;
const COMMENT_BODY_MAX_CHARS = 1000;

const clampPct = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const getVerticalCalloutTransform = (args: {
  placementX: "left" | "right";
  topPct: number;
}): string => {
  const x = args.placementX === "left" ? "-100%" : "0%";
  // If we're near the top, render below the anchor. Otherwise render above.
  const renderAbove = args.topPct > 35;
  const y = renderAbove ? "calc(-100% - 0.5rem)" : "0.5rem";
  return `translate(${x}, ${y})`;
};

const toHighlightAreas = (thread: CommentThreadSummary) =>
  storedCommentAnchorToPageAreas({
    anchor: thread.anchor,
    pageNumber: thread.page_number,
  });

type UsePublicCommentsOverlayArgs = {
  enabled: boolean;
  linkId: string;
  documentId: string;
  verifiedEmail: string | null;
  onRequireVerification: (retry: () => Promise<void>) => void;
  viewerRootRef?: React.RefObject<HTMLElement | null>;
  language: PublicLanguage;
  messages: {
    commentActionFailed: string;
    commentSelectionFailed: string;
    addComment: string;
    threadTitle: string;
    commentPlaceholder: string;
    replyPlaceholder: string;
    submitComment: string;
    sendReply: string;
    loadingThread: string;
    unableToLoadThread: string;
    closeComments: string;
    resolve: string;
    reopen: string;
    resolved: string;
    viewThread: string;
    hideThread: string;
    deleteComment: string;
    deleted: string;
    resolvedDescription: string;
    openCommentThread: string;
    you: string;
    viewer: string;
    retry: string;
    close: string;
  };
};

type UsePublicCommentsOverlayResult = {
  pdfOverlays: readonly PdfViewerOverlay[];
  panel: React.ReactNode;
  headerActions: {
    showComments: boolean;
    commentsOpen: boolean;
    onToggleComments: () => void;
  };
};

export const usePublicCommentsOverlay = (
  args: UsePublicCommentsOverlayArgs,
): UsePublicCommentsOverlayResult => {
  const {
    enabled,
    linkId,
    documentId,
    verifiedEmail,
    onRequireVerification,
    viewerRootRef,
    language,
    messages,
  } = args;

  const {
    listThreads,
    getThread,
    createThread,
    createReply,
    updateThreadState,
    deleteMessage,
  } = usePublicComments();

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [threads, setThreads] = useState<CommentThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] =
    useState<CommentThreadDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
  const [creatingComment, setCreatingComment] = useState(false);
  const [resolvedExpanded, setResolvedExpanded] = useState(true);

  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => {
      mql.removeEventListener("change", update);
    };
  }, []);

  const [composer, setComposer] = useState<{
    pageIndex: number;
    areas: TextLayerSelection["areas"];
    selectedText: string;
  } | null>(null);
  const [composerBody, setComposerBody] = useState("");
  const [pendingSelection, setPendingSelection] =
    useState<TextLayerSelection | null>(null);
  const handleTextSelection = useCallback(
    (selection: TextLayerSelection): void => {
      const grouped = groupCommentSelectionByPage(selection.areas);
      if (!grouped) {
        setPendingSelection(null);
        showError(messages.commentSelectionFailed);
        return;
      }
      const selectionRegion = grouped.areas.at(-1);
      if (!selectionRegion) return;
      setPendingSelection({
        ...selection,
        areas: grouped.areas,
        selectionRegion,
      });
    },
    [messages.commentSelectionFailed],
  );
  const {
    clear: clearTextSelection,
    onTextLayerReady,
    setPageRotation,
  } = useTextLayerSelection({
    enabled: enabled && commentsOpen,
    onSelection: handleTextSelection,
    onSelectionStart: () => setPendingSelection(null),
    onError: (error) => {
      console.error("[PublicComments] Failed to capture selection", error);
      showError(messages.commentSelectionFailed);
    },
  });

  const withVerification = useCallback(
    async (action: () => Promise<void>) => {
      if (!verifiedEmail) {
        onRequireVerification(action);
        return;
      }
      await action();
    },
    [onRequireVerification, verifiedEmail],
  );

  const loadThreads = useCallback(async () => {
    if (!enabled) {
      setThreads([]);
      return;
    }
    try {
      const payload = await listThreads({
        linkId,
        documentId,
      });
      setThreads(payload.threads);
    } catch {
      setThreads([]);
    }
  }, [documentId, enabled, linkId, listThreads]);

  const loadThread = useCallback(
    async (threadId: string) => {
      setThreadLoading(true);
      setThreadError(null);
      try {
        const payload = await getThread({ linkId, threadId });
        setSelectedThread(payload);
        setResolvedExpanded(payload.thread.state === "open");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load thread";
        setThreadError(message);
      } finally {
        setThreadLoading(false);
      }
    },
    [getThread, linkId],
  );

  useEffect(() => {
    if (!enabled) {
      setCommentsOpen(false);
      setThreads([]);
      setSelectedThreadId(null);
      setSelectedThread(null);
      setComposer(null);
      setComposerBody("");
      setPendingSelection(null);
      setResolvedExpanded(true);
      return;
    }
    if (!commentsOpen) {
      setComposer(null);
      setComposerBody("");
      setPendingSelection(null);
      setSelectedThreadId(null);
      setSelectedThread(null);
      setReplyBody("");
      setThreadError(null);
      setResolvedExpanded(true);
      return;
    }
    void loadThreads();
  }, [commentsOpen, enabled, loadThreads]);

  useEffect(() => {
    if (!enabled || !commentsOpen || !selectedThreadId) {
      setSelectedThread(null);
      setReplyBody("");
      return;
    }
    void loadThread(selectedThreadId);
  }, [commentsOpen, enabled, loadThread, selectedThreadId]);

  const scrollThreadHighlightIntoView = useCallback(
    (threadId: string) => {
      const root = viewerRootRef?.current;
      if (!root) return;

      const innerPages = root.querySelector(
        ".dk-pdf-scroll",
      ) as HTMLElement | null;
      if (!innerPages) return;

      const el = root.querySelector(
        `[data-dk-comment-thread-id="${threadId}"]`,
      );
      if (!(el instanceof HTMLElement)) return;

      const containerRect = innerPages.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const containerCenterY = containerRect.top + containerRect.height / 2;
      const elCenterY = elRect.top + elRect.height / 2;
      const delta = elCenterY - containerCenterY;

      if (Number.isFinite(delta) && Math.abs(delta) > 2) {
        innerPages.scrollBy({ top: delta, left: 0, behavior: "auto" });
      }
    },
    [viewerRootRef],
  );

  const centerThreadHighlightWithRetries = useCallback(
    (threadId: string) => {
      if (typeof window === "undefined") return;

      const run = () => scrollThreadHighlightIntoView(threadId);
      // PDF.js may render a destination page and its overlay asynchronously.
      window.requestAnimationFrame(run);
      window.setTimeout(run, 50);
      window.setTimeout(run, 250);
    },
    [scrollThreadHighlightIntoView],
  );

  const jumpToThread = useCallback(
    (thread: CommentThreadSummary) => {
      viewerRootRef?.current
        ?.querySelector<HTMLElement>(
          `[data-page-number="${thread.page_number}"]`,
        )
        ?.scrollIntoView({ block: "start", behavior: "auto" });
      centerThreadHighlightWithRetries(thread.id);

      setCommentsOpen(true);
      setPendingSelection(null);
      setComposer(null);
      setComposerBody("");
      setSelectedThreadId(thread.id);
    },
    [centerThreadHighlightWithRetries, viewerRootRef],
  );

  const handleCommentError = useCallback(
    (error: unknown, retry?: () => Promise<void>) => {
      if (
        retry &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code ===
          "COMMENT_EMAIL_VERIFICATION_REQUIRED"
      ) {
        onRequireVerification(retry);
        return;
      }

      const message =
        error instanceof Error ? error.message : messages.commentActionFailed;
      showError(message);
    },
    [messages.commentActionFailed, onRequireVerification],
  );

  const submitReply = useCallback(async () => {
    const thread = selectedThread;
    const body = replyBody.trim();
    if (!thread || !body || replySubmitting) return;

    const action = async () => {
      setReplySubmitting(true);
      try {
        await createReply({
          linkId,
          threadId: thread.thread.id,
          body,
        });
        setReplyBody("");
        await Promise.all([loadThread(thread.thread.id), loadThreads()]);
      } catch (error) {
        handleCommentError(error, action);
      } finally {
        setReplySubmitting(false);
      }
    };

    await withVerification(action);
  }, [
    createReply,
    handleCommentError,
    linkId,
    loadThread,
    loadThreads,
    replyBody,
    replySubmitting,
    selectedThread,
    withVerification,
  ]);

  const submitThreadState = useCallback(
    async (action: "resolve" | "unresolve") => {
      const thread = selectedThread;
      if (!thread || resolveSubmitting) return;

      setResolveSubmitting(true);
      setResolvedExpanded(action === "unresolve");
      try {
        await updateThreadState({
          linkId,
          threadId: thread.thread.id,
          action,
        });
        await Promise.all([loadThread(thread.thread.id), loadThreads()]);
      } catch (error) {
        handleCommentError(error);
      } finally {
        setResolveSubmitting(false);
      }
    },
    [
      handleCommentError,
      linkId,
      loadThread,
      loadThreads,
      resolveSubmitting,
      selectedThread,
      updateThreadState,
    ],
  );

  const submitComposer = useCallback(async () => {
    const composerNow = composer;
    const body = composerBody.trim();
    if (!composerNow || !body || creatingComment) return;

    const anchor = pageAreasToStoredCommentAnchor(
      composerNow.areas,
      composerNow.selectedText,
    );
    if (anchor.rects.length === 0) {
      showError(messages.commentSelectionFailed);
      return;
    }

    const action = async () => {
      setCreatingComment(true);
      try {
        const created = await createThread({
          linkId,
          documentId,
          pageNumber: composerNow.pageIndex + 1,
          anchor,
          body,
        });

        setComposer(null);
        setComposerBody("");
        setCommentsOpen(true);
        setSelectedThreadId(created.thread.id);
        await loadThreads();
        await loadThread(created.thread.id);
      } catch (error) {
        handleCommentError(error, action);
      } finally {
        setCreatingComment(false);
      }
    };

    await withVerification(action);
  }, [
    createThread,
    composer,
    composerBody,
    creatingComment,
    documentId,
    handleCommentError,
    linkId,
    loadThread,
    loadThreads,
    messages.commentSelectionFailed,
    withVerification,
  ]);

  const deleteThreadMessage = useCallback(
    async (messageId: string) => {
      const thread = selectedThread;
      if (!thread) return;

      const action = async () => {
        await deleteMessage({ linkId, messageId });
        await Promise.all([loadThread(thread.thread.id), loadThreads()]);
      };

      try {
        await withVerification(action);
      } catch (error) {
        handleCommentError(error, action);
      }
    },
    [
      deleteMessage,
      handleCommentError,
      linkId,
      loadThread,
      loadThreads,
      selectedThread,
      withVerification,
    ],
  );

  const openSelectionComposer = useCallback((): void => {
    if (!pendingSelection) return;
    const grouped = groupCommentSelectionByPage(pendingSelection.areas);
    if (!grouped) {
      showError(messages.commentSelectionFailed);
      return;
    }

    setComposer({
      pageIndex: grouped.pageIndex,
      areas: grouped.areas,
      selectedText: pendingSelection.selectedText,
    });
    setComposerBody("");
    setPendingSelection(null);
    setSelectedThreadId(null);
    setSelectedThread(null);
    setCommentsOpen(true);
    setResolvedExpanded(true);
    clearTextSelection();
  }, [clearTextSelection, messages.commentSelectionFailed, pendingSelection]);

  const renderCommentsPageOverlay = useCallback(
    ({ pageIndex, rotation }: { pageIndex: number; rotation: number }) => {
      setPageRotation(pageIndex, rotation);
      if (!enabled || !commentsOpen) return null;

      const items = threads.filter(
        (thread) => thread.page_number - 1 === pageIndex,
      );
      const activeThreadId = selectedThreadId;
      const composerNow = composer;
      const desktop = isDesktop;
      const activeThreadSummary = activeThreadId
        ? (threads.find((thread) => thread.id === activeThreadId) ?? null)
        : null;

      const callout = (() => {
        if (!desktop) return null;
        const email = verifiedEmail;

        if (composerNow && composerNow.pageIndex === pageIndex) {
          const primaryArea = composerNow.areas.at(-1);
          if (!primaryArea) return null;
          const screenArea = areaToScreenArea(primaryArea, rotation);
          const topPct = clampPct(screenArea.top, 2, 88);
          const rightEdge = screenArea.left + screenArea.width;
          const placement: "left" | "right" = rightEdge > 65 ? "left" : "right";
          const leftPct =
            placement === "right"
              ? clampPct(rightEdge + 1, 3, 97)
              : clampPct(screenArea.left - 1, 3, 97);
          const transform = getVerticalCalloutTransform({
            placementX: placement,
            topPct,
          });
          return (
            <div
              className="pointer-events-auto absolute z-30"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform,
              }}
            >
              <div className="max-h-[calc(100dvh-8rem)] w-96 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-lg [box-shadow:var(--dk-shadow-dialog)]">
                <CommentThreadCard
                  mode="composer"
                  quote={composerNow.selectedText.trim() || null}
                  title={email ?? messages.you}
                  subtitle={messages.addComment}
                  avatarInitial={(email?.slice(0, 1) || "Y").toUpperCase()}
                  onClose={() => {
                    setComposer(null);
                    setComposerBody("");
                  }}
                  body={composerBody}
                  onBodyChange={setComposerBody}
                  placeholder={messages.commentPlaceholder}
                  onSubmit={() => void submitComposer()}
                  submitLabel={messages.submitComment}
                  submitSubmitting={creatingComment}
                  maxChars={COMMENT_BODY_MAX_CHARS}
                  minChars={COMMENT_BODY_MIN_CHARS}
                  language={language}
                  labels={messages}
                />
              </div>
            </div>
          );
        }

        if (
          activeThreadId &&
          activeThreadSummary &&
          activeThreadSummary.page_number - 1 === pageIndex
        ) {
          const primaryArea = toHighlightAreas(activeThreadSummary)[0];
          if (!primaryArea) return null;

          const screenArea = areaToScreenArea(primaryArea, rotation);
          const rightEdge = screenArea.left + screenArea.width;
          const placement: "left" | "right" = rightEdge > 65 ? "left" : "right";
          const leftPct =
            placement === "right"
              ? clampPct(rightEdge + 1, 3, 97)
              : clampPct(screenArea.left - 1, 3, 97);
          const topPct = clampPct(screenArea.top, 2, 88);
          const transform = getVerticalCalloutTransform({
            placementX: placement,
            topPct,
          });

          if (threadLoading) {
            return (
              <div
                className="pointer-events-auto absolute z-30"
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  transform,
                }}
              >
                <div className="dk-nocturne-overlay w-96 max-w-[calc(100vw-1.5rem)] rounded-lg p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CircleNotch
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                    <span>{messages.loadingThread}</span>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedThreadId(null);
                        setSelectedThread(null);
                        setReplyBody("");
                        setThreadError(null);
                        setResolvedExpanded(true);
                      }}
                    >
                      {messages.close}
                    </Button>
                  </div>
                </div>
              </div>
            );
          }

          if (threadError) {
            return (
              <div
                className="pointer-events-auto absolute z-30"
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  transform,
                }}
              >
                <div className="dk-nocturne-overlay w-96 max-w-[calc(100vw-1.5rem)] rounded-lg p-4">
                  <p className="text-sm text-destructive">{threadError}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadThread(activeThreadId)}
                    >
                      {messages.retry}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedThreadId(null);
                        setSelectedThread(null);
                        setReplyBody("");
                        setThreadError(null);
                        setResolvedExpanded(true);
                      }}
                    >
                      {messages.close}
                    </Button>
                  </div>
                </div>
              </div>
            );
          }

          const detail = selectedThread;
          if (!detail) return null;

          const firstMessage = detail.messages[0];
          const authorIsMe = Boolean(
            detail.messages.length && firstMessage?.is_me,
          );
          const title = firstMessage?.author_label ?? messages.viewer;
          const subtitle = firstMessage?.created_at
            ? formatPublicDate(new Date(firstMessage.created_at), language, {
                hour: "numeric",
                minute: "2-digit",
                month: "short",
                day: "numeric",
              })
            : null;
          const quote = detail.thread.anchor.quote ?? null;

          return (
            <div
              className="pointer-events-auto absolute z-30"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform,
              }}
            >
              <div className="max-h-[calc(100dvh-8rem)] w-96 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-lg [box-shadow:var(--dk-shadow-dialog)]">
                <CommentThreadCard
                  mode="thread"
                  quote={quote}
                  title={title}
                  subtitle={subtitle}
                  avatarInitial={title.slice(0, 1) || "V"}
                  avatarColor={firstMessage?.author_color ?? null}
                  onClose={() => {
                    setSelectedThreadId(null);
                    setSelectedThread(null);
                    setReplyBody("");
                    setThreadError(null);
                    setResolvedExpanded(true);
                  }}
                  state={detail.thread.state}
                  resolvedExpanded={resolvedExpanded}
                  onResolvedExpandedChange={setResolvedExpanded}
                  canToggleResolve={authorIsMe}
                  resolveSubmitting={resolveSubmitting}
                  onToggleResolve={() =>
                    void submitThreadState(
                      detail.thread.state === "open" ? "resolve" : "unresolve",
                    )
                  }
                  messages={detail.messages.map((m) => ({
                    id: m.id,
                    body: m.body,
                    authorLabel: m.author_label,
                    authorColor: m.author_color,
                    createdAt: m.created_at,
                    isMe: m.is_me,
                    state: m.state,
                  }))}
                  onDeleteMessage={(messageId) =>
                    void deleteThreadMessage(messageId)
                  }
                  body={replyBody}
                  onBodyChange={setReplyBody}
                  placeholder={messages.replyPlaceholder}
                  onSubmit={() => void submitReply()}
                  submitLabel={messages.sendReply}
                  submitSubmitting={replySubmitting}
                  submitDisabled={detail.thread.state !== "open"}
                  maxChars={COMMENT_BODY_MAX_CHARS}
                  minChars={COMMENT_BODY_MIN_CHARS}
                  language={language}
                  labels={messages}
                />
              </div>
            </div>
          );
        }

        return null;
      })();
      const firstSelectionArea =
        pendingSelection?.areas.find((area) => area.pageIndex === pageIndex) ??
        null;
      const screenSelectionArea = firstSelectionArea
        ? areaToScreenArea(firstSelectionArea, rotation)
        : null;
      const selectionTargetArea = screenSelectionArea
        ? {
            pageIndex,
            top: Math.max(screenSelectionArea.top - 1, 2),
            left: Math.min(
              screenSelectionArea.left + screenSelectionArea.width + 1,
              96,
            ),
            width: 0,
            height: 0,
          }
        : null;

      return (
        <>
          {items.map((thread) =>
            toHighlightAreas(thread).map((area, idx) => {
              const active = activeThreadId === thread.id;
              return (
                <button
                  key={`${thread.id}-${idx}`}
                  type="button"
                  data-dk-comment-thread-id={thread.id}
                  className={cn(
                    "pointer-events-auto absolute z-10 rounded-sm mix-blend-multiply transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    thread.state === "resolved"
                      ? "bg-muted/45"
                      : active
                        ? "bg-chart-4/70!"
                        : "bg-chart-4/55! hover:bg-chart-4/65!",
                  )}
                  style={getAreaCssProperties(area, rotation)}
                  onClick={() => jumpToThread(thread)}
                  aria-label={messages.openCommentThread}
                />
              );
            }),
          )}

          {selectionTargetArea ? (
            <div
              className="pointer-events-auto absolute z-20"
              style={{
                left: `${selectionTargetArea.left}%`,
                top: `${selectionTargetArea.top}%`,
              }}
            >
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="size-10 rounded-full border-border/60 bg-popover [box-shadow:var(--dk-shadow-dialog)]"
                title={messages.addComment}
                aria-label={messages.addComment}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  try {
                    openSelectionComposer();
                  } catch (error) {
                    console.error(
                      "[PublicComments] Failed to open selection composer",
                      error,
                    );
                    showError(messages.commentSelectionFailed);
                  }
                }}
                onClick={(event) => {
                  if (event.detail !== 0) event.preventDefault();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  try {
                    openSelectionComposer();
                  } catch (error) {
                    console.error(
                      "[PublicComments] Failed to open selection composer",
                      error,
                    );
                    showError(messages.commentSelectionFailed);
                  }
                }}
              >
                <ChatCircleDots className="size-5" aria-hidden="true" />
              </Button>
            </div>
          ) : null}

          {callout}
        </>
      );
    },
    [
      commentsOpen,
      composer,
      composerBody,
      creatingComment,
      deleteThreadMessage,
      enabled,
      isDesktop,
      jumpToThread,
      language,
      loadThread,
      messages,
      openSelectionComposer,
      pendingSelection,
      replyBody,
      replySubmitting,
      resolveSubmitting,
      resolvedExpanded,
      selectedThread,
      selectedThreadId,
      setPageRotation,
      submitComposer,
      submitReply,
      submitThreadState,
      threadError,
      threadLoading,
      threads,
      verifiedEmail,
    ],
  );

  const pdfOverlays = useMemo<readonly PdfViewerOverlay[]>(
    () =>
      enabled
        ? [
            {
              id: "dk-public-comments",
              layer: "over-text",
              onTextLayerReady,
              renderPageOverlay: renderCommentsPageOverlay,
            },
          ]
        : [],
    [enabled, onTextLayerReady, renderCommentsPageOverlay],
  );

  const panel = (
    <Sheet
      open={
        enabled &&
        commentsOpen &&
        !isDesktop &&
        Boolean(composer || selectedThreadId)
      }
      onOpenChange={(open) => {
        if (open) return;
        setComposer(null);
        setComposerBody("");
        setSelectedThreadId(null);
        setSelectedThread(null);
        setReplyBody("");
        setThreadError(null);
        setResolvedExpanded(true);
      }}
    >
      <SheetContent side="bottom" className="p-0">
        <SheetTitle className="sr-only">{messages.threadTitle}</SheetTitle>
        <div className="p-4">
          {composer ? (
            <CommentThreadCard
              mode="composer"
              quote={composer.selectedText.trim() || null}
              title={verifiedEmail ?? messages.you}
              subtitle={messages.addComment}
              avatarInitial={(verifiedEmail?.slice(0, 1) || "Y").toUpperCase()}
              onClose={() => {
                setComposer(null);
                setComposerBody("");
              }}
              body={composerBody}
              onBodyChange={setComposerBody}
              placeholder={messages.commentPlaceholder}
              onSubmit={() => void submitComposer()}
              submitLabel={messages.submitComment}
              submitSubmitting={creatingComment}
              maxChars={COMMENT_BODY_MAX_CHARS}
              minChars={COMMENT_BODY_MIN_CHARS}
              language={language}
              labels={messages}
            />
          ) : selectedThreadId ? (
            threadLoading ? (
              <div className="dk-nocturne-surface flex items-center gap-2 rounded-lg p-4 text-sm text-muted-foreground">
                <CircleNotch
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
                <span>{messages.loadingThread}</span>
              </div>
            ) : threadError ? (
              <div className="dk-nocturne-surface space-y-3 rounded-lg p-4">
                <p className="text-sm text-destructive">{threadError}</p>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadThread(selectedThreadId)}
                  >
                    {messages.retry}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedThreadId(null);
                      setSelectedThread(null);
                      setReplyBody("");
                      setThreadError(null);
                      setResolvedExpanded(true);
                    }}
                  >
                    {messages.close}
                  </Button>
                </div>
              </div>
            ) : selectedThread ? (
              (() => {
                const firstMessage = selectedThread.messages[0];
                const authorIsMe = Boolean(
                  selectedThread.messages.length && firstMessage?.is_me,
                );
                const title = firstMessage?.author_label ?? messages.viewer;
                const subtitle = firstMessage?.created_at
                  ? formatPublicDate(
                      new Date(firstMessage.created_at),
                      language,
                      {
                        hour: "numeric",
                        minute: "2-digit",
                        month: "short",
                        day: "numeric",
                      },
                    )
                  : null;
                const quote = selectedThread.thread.anchor.quote ?? null;
                return (
                  <CommentThreadCard
                    mode="thread"
                    quote={quote}
                    title={title}
                    subtitle={subtitle}
                    avatarInitial={title.slice(0, 1) || "V"}
                    avatarColor={firstMessage?.author_color ?? null}
                    onClose={() => {
                      setSelectedThreadId(null);
                      setSelectedThread(null);
                      setReplyBody("");
                      setThreadError(null);
                      setResolvedExpanded(true);
                    }}
                    state={selectedThread.thread.state}
                    resolvedExpanded={resolvedExpanded}
                    onResolvedExpandedChange={setResolvedExpanded}
                    canToggleResolve={authorIsMe}
                    resolveSubmitting={resolveSubmitting}
                    onToggleResolve={() =>
                      void submitThreadState(
                        selectedThread.thread.state === "open"
                          ? "resolve"
                          : "unresolve",
                      )
                    }
                    messages={selectedThread.messages.map((m) => ({
                      id: m.id,
                      body: m.body,
                      authorLabel: m.author_label,
                      authorColor: m.author_color,
                      createdAt: m.created_at,
                      isMe: m.is_me,
                      state: m.state,
                    }))}
                    onDeleteMessage={(messageId) =>
                      void deleteThreadMessage(messageId)
                    }
                    body={replyBody}
                    onBodyChange={setReplyBody}
                    placeholder={messages.replyPlaceholder}
                    onSubmit={() => void submitReply()}
                    submitLabel={messages.sendReply}
                    submitSubmitting={replySubmitting}
                    submitDisabled={selectedThread.thread.state !== "open"}
                    maxChars={COMMENT_BODY_MAX_CHARS}
                    minChars={COMMENT_BODY_MIN_CHARS}
                    language={language}
                    labels={messages}
                  />
                );
              })()
            ) : null
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );

  return {
    pdfOverlays,
    panel,
    headerActions: {
      showComments: enabled,
      commentsOpen,
      onToggleComments: () => setCommentsOpen((open) => !open),
    },
  };
};
