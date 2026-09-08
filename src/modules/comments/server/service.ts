import { createHmac, createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { verifyCookie, verifyVerifiedEmailCookie } from "@/server/cookieHelper";
import {
  getAccessCookieKey,
  getEmailCookieKey,
  type AccessCookiePayload,
} from "@/server/cookieConstants";
import {
  fetchLinkAllowlistStatus,
  isLinkAllowlistAccessDenied,
  normalizeViewerEmail,
} from "@/server/linkAllowlist";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { getPublicLinkAvailabilityError } from "@/server/publicLinkAvailability";
import { serverEnv } from "@/lib/env";
import type { Json, Tables } from "@/types/generated/supabase";
import type { CommentAnchor } from "./schemas";
import { recordCommentAuditEvent } from "./audit";
import { notifyWorkspaceOwnersOfViewerComment } from "./notifications";

type LinkForComments = Pick<
  Tables<"links">,
  | "id"
  | "workspace_id"
  | "document_id"
  | "data_room_id"
  | "comments_enabled"
  | "open_once"
  | "revoked_at"
  | "expires_at"
>;

type ThreadRow = Tables<"comment_threads">;
type MessageRow = Tables<"comment_messages">;

type AuthorContext = {
  authorType: "verified_email";
  authorKey: string;
  authorEmail: string;
  authorColor: string;
};

type AccessContext = {
  link: LinkForComments;
  documentId: string;
  verifiedEmail: string | null;
};

const COMMENT_COLOR_TOKENS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

export class CommentsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommentsApiError";
  }
}

const toAnchorJson = (anchor: CommentAnchor): Json =>
  ({
    rects: anchor.rects.map((rect) => ({
      x: Number(rect.x.toFixed(6)),
      y: Number(rect.y.toFixed(6)),
      w: Number(rect.w.toFixed(6)),
      h: Number(rect.h.toFixed(6)),
    })),
    ...(anchor.quote ? { quote: anchor.quote } : {}),
  }) as Json;

const toCommentAnchor = (value: Json): CommentAnchor => {
  const parsed =
    value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const rectsRaw = parsed && "rects" in parsed ? parsed.rects : null;

  if (!Array.isArray(rectsRaw)) {
    return { rects: [] };
  }

  const rects = rectsRaw
    .map((rect) => {
      if (!rect || typeof rect !== "object" || Array.isArray(rect)) {
        return null;
      }
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
      return {
        x: row.x,
        y: row.y,
        w: row.w,
        h: row.h,
      };
    })
    .filter((rect): rect is { x: number; y: number; w: number; h: number } =>
      Boolean(rect),
    );

  const quote =
    parsed && "quote" in parsed && typeof parsed.quote === "string"
      ? parsed.quote
      : undefined;

  return { rects, ...(quote ? { quote } : {}) };
};

const readVerifiedEmail = (
  req: NextRequest,
  resourceType: "document" | "data_room",
  resourceId: string,
  linkId: string,
): string | null => {
  const cookieName = getEmailCookieKey(resourceType, resourceId, linkId);
  const cookieValue = req.cookies.get(cookieName)?.value;
  const payload = cookieValue
    ? verifyVerifiedEmailCookie(cookieValue, {
        resourceType,
        resourceId,
        linkId,
      })
    : null;

  if (!payload?.email) {
    return null;
  }

  return normalizeViewerEmail(payload.email);
};

const hasValidAccessCookie = (
  req: NextRequest,
  documentId: string,
  linkId: string,
): boolean => {
  const cookieName = getAccessCookieKey("document", documentId, linkId);
  const cookieValue = req.cookies.get(cookieName)?.value;
  const payload = cookieValue
    ? verifyCookie<AccessCookiePayload>(cookieValue)
    : null;

  if (!payload) return false;
  if (payload.resourceType !== "document") return false;
  if (payload.resourceId !== documentId) return false;
  if (payload.linkId !== linkId) return false;
  if (typeof payload.exp === "number" && payload.exp < Date.now()) return false;
  return true;
};

const toAuthorColor = (authorKey: string): string => {
  const digest = createHash("sha256").update(authorKey).digest("hex");
  const index = parseInt(digest.slice(0, 8), 16) % COMMENT_COLOR_TOKENS.length;
  return COMMENT_COLOR_TOKENS[index];
};

const toVerifiedAuthorKey = (email: string): string => {
  // Prefer a dedicated secret for deterministic comment-author hashing, but
  // fall back to COOKIE_SECRET so local dev / e2e doesn’t break when the
  // dedicated secret isn’t set.
  const secret = serverEnv.COMMENTS_AUTHOR_SECRET ?? serverEnv.COOKIE_SECRET;
  const hash = createHmac("sha256", secret)
    .update(normalizeViewerEmail(email))
    .digest("hex");
  return `email:${hash}`;
};

const ensureCommentsAccess = async (
  req: NextRequest,
  params: { linkId: string; documentId: string },
): Promise<AccessContext> => {
  const supabase = createSupabaseServiceClient();

  const { data: rawLink, error: linkError } = await supabase
    .from("links")
    .select(
      "id, workspace_id, document_id, data_room_id, comments_enabled, open_once, revoked_at, expires_at",
    )
    .eq("id", params.linkId)
    .eq("document_id", params.documentId)
    .maybeSingle();

  if (linkError || !rawLink) {
    throw new CommentsApiError(404, "LINK_NOT_FOUND", "Link not found");
  }

  const link = rawLink as LinkForComments;

  const availabilityError = getPublicLinkAvailabilityError(link);
  if (availabilityError) {
    throw new CommentsApiError(
      availabilityError.status,
      availabilityError.code,
      availabilityError.error,
    );
  }

  const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
  if (!hasEntitlement) {
    throw new CommentsApiError(404, "LINK_NOT_FOUND", "Link not found");
  }

  if (!link.comments_enabled) {
    throw new CommentsApiError(
      403,
      "COMMENTS_DISABLED",
      "Comments are disabled for this link",
    );
  }

  if (!hasValidAccessCookie(req, params.documentId, params.linkId)) {
    throw new CommentsApiError(
      401,
      "ACCESS_CONFIRMATION_REQUIRED",
      "Access confirmation required",
    );
  }

  const documentScopeEmail = readVerifiedEmail(
    req,
    "document",
    params.documentId,
    params.linkId,
  );
  const dataRoomScopeEmail = link.data_room_id
    ? readVerifiedEmail(req, "data_room", link.data_room_id, params.linkId)
    : null;
  const verifiedEmail = documentScopeEmail ?? dataRoomScopeEmail ?? null;
  const allowlistStatus = await fetchLinkAllowlistStatus(
    supabase,
    params.linkId,
    verifiedEmail,
  );
  const normalizedVerifiedEmail =
    allowlistStatus.normalizedEmail ?? verifiedEmail ?? null;

  if (isLinkAllowlistAccessDenied(allowlistStatus)) {
    throw new CommentsApiError(
      403,
      "EMAIL_NOT_ALLOWED",
      "Email not allowed for this link",
    );
  }

  return {
    link,
    documentId: params.documentId,
    verifiedEmail: normalizedVerifiedEmail,
  };
};

const resolveAuthorContext = async (
  req: NextRequest,
  context: AccessContext,
  options: { requireForWrite: boolean },
): Promise<AuthorContext | null> => {
  if (!context.verifiedEmail) {
    if (options.requireForWrite) {
      throw new CommentsApiError(
        401,
        "COMMENT_EMAIL_VERIFICATION_REQUIRED",
        "Email verification required before commenting",
      );
    }
    return null;
  }

  const authorKey = toVerifiedAuthorKey(context.verifiedEmail);
  return {
    authorType: "verified_email",
    authorKey,
    authorEmail: context.verifiedEmail,
    authorColor: toAuthorColor(authorKey),
  };
};

const maskEmailForPublic = (email: string): string => {
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "Viewer";
  const first = local.slice(0, 1);
  return `${first}***@${domain}`;
};

const mapThreadSummary = (
  thread: Pick<
    ThreadRow,
    | "id"
    | "page_number"
    | "anchor"
    | "state"
    | "resolved_at"
    | "created_at"
    | "updated_at"
  >,
  messageMeta: { messageCount: number; lastMessagePreview: string | null },
) => ({
  id: thread.id,
  page_number: thread.page_number,
  anchor: toCommentAnchor(thread.anchor),
  state: thread.state,
  resolved_at: thread.resolved_at,
  created_at: thread.created_at,
  updated_at: thread.updated_at,
  message_count: messageMeta.messageCount,
  last_message_preview: messageMeta.lastMessagePreview,
});

const mapMessage = (
  message: MessageRow,
  currentAuthorKey: string | null,
  fallbackIsMe = false,
) => ({
  id: message.id,
  body:
    (message as unknown as { state?: string }).state === "deleted"
      ? "[deleted]"
      : message.body,
  state: (message as unknown as { state?: string }).state ?? "active",
  author_label: (() => {
    const isMe =
      fallbackIsMe ||
      (currentAuthorKey ? message.author_key === currentAuthorKey : false);
    const authorEmail = (message as unknown as { author_email?: string | null })
      .author_email;
    if (typeof authorEmail === "string" && authorEmail.trim()) {
      return isMe ? authorEmail : maskEmailForPublic(authorEmail);
    }
    return message.author_label;
  })(),
  author_color: message.author_color,
  created_at: message.created_at,
  is_me:
    fallbackIsMe ||
    (currentAuthorKey ? message.author_key === currentAuthorKey : false),
});

export const listCommentThreads = async (
  req: NextRequest,
  params: { linkId: string; documentId: string },
) => {
  await ensureCommentsAccess(req, params);
  const supabase = createSupabaseServiceClient();

  const { data: threads, error: threadsError } = await supabase
    .from("comment_threads")
    .select(
      "id, page_number, anchor, state, resolved_at, created_at, updated_at",
    )
    .eq("link_id", params.linkId)
    .eq("document_id", params.documentId)
    .order("updated_at", { ascending: false });

  if (threadsError) {
    throw new CommentsApiError(
      500,
      "COMMENTS_THREADS_LIST_FAILED",
      threadsError.message,
    );
  }

  if (!threads || threads.length === 0) {
    return { threads: [] };
  }

  const threadIds = threads.map((thread) => thread.id);
  const { data: messageRows, error: messageError } = await supabase
    .from("comment_messages")
    .select("id, thread_id, body, created_at, state")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });

  if (messageError) {
    throw new CommentsApiError(
      500,
      "COMMENTS_THREADS_LIST_FAILED",
      messageError.message,
    );
  }

  const metaByThread = new Map<
    string,
    {
      messageCount: number;
      lastMessagePreview: string | null;
    }
  >();

  for (const threadId of threadIds) {
    metaByThread.set(threadId, { messageCount: 0, lastMessagePreview: null });
  }

  for (const message of messageRows ?? []) {
    const current = metaByThread.get(message.thread_id);
    if (!current) continue;
    if ((message as unknown as { state?: string }).state === "deleted") {
      continue;
    }
    const nextCount = current.messageCount + 1;
    const preview =
      current.lastMessagePreview ??
      (typeof message.body === "string" ? message.body.slice(0, 180) : null);
    metaByThread.set(message.thread_id, {
      messageCount: nextCount,
      lastMessagePreview: preview,
    });
  }

  return {
    threads: threads.map((thread) =>
      mapThreadSummary(
        thread,
        metaByThread.get(thread.id) ?? {
          messageCount: 0,
          lastMessagePreview: null,
        },
      ),
    ),
  };
};

const getThreadById = async (params: { threadId: string; linkId: string }) => {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("comment_threads")
    .select("*")
    .eq("id", params.threadId)
    .eq("link_id", params.linkId)
    .maybeSingle();

  if (error) {
    throw new CommentsApiError(
      500,
      "COMMENTS_THREAD_LOOKUP_FAILED",
      error.message,
    );
  }

  if (!data) {
    throw new CommentsApiError(
      404,
      "THREAD_NOT_FOUND",
      "Comment thread not found",
    );
  }

  return data;
};

export const getCommentThread = async (
  req: NextRequest,
  params: { linkId: string; threadId: string },
) => {
  const thread = await getThreadById(params);
  const access = await ensureCommentsAccess(req, {
    linkId: params.linkId,
    documentId: thread.document_id,
  });
  const currentAuthor = await resolveAuthorContext(req, access, {
    requireForWrite: false,
  });

  const supabase = createSupabaseServiceClient();
  const { data: messages, error: messagesError } = await supabase
    .from("comment_messages")
    .select("*")
    .eq("thread_id", params.threadId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    throw new CommentsApiError(
      500,
      "COMMENTS_THREAD_FETCH_FAILED",
      messagesError.message,
    );
  }

  return {
    thread: {
      id: thread.id,
      page_number: thread.page_number,
      anchor: toCommentAnchor(thread.anchor),
      state: thread.state,
      resolved_at: thread.resolved_at,
      created_at: thread.created_at,
      updated_at: thread.updated_at,
    },
    messages: (messages ?? []).map((message) =>
      mapMessage(message, currentAuthor?.authorKey ?? null),
    ),
  };
};

export const createCommentThread = async (
  req: NextRequest,
  params: {
    linkId: string;
    documentId: string;
    pageNumber: number;
    anchor: CommentAnchor;
    body: string;
  },
) => {
  const access = await ensureCommentsAccess(req, {
    linkId: params.linkId,
    documentId: params.documentId,
  });
  const author = await resolveAuthorContext(req, access, {
    requireForWrite: true,
  });
  if (!author) {
    throw new CommentsApiError(
      401,
      "COMMENT_EMAIL_VERIFICATION_REQUIRED",
      "Email verification required before commenting",
    );
  }

  const supabase = createSupabaseServiceClient();
  const { data: thread, error: threadError } = await supabase
    .from("comment_threads")
    .insert({
      workspace_id: access.link.workspace_id,
      link_id: params.linkId,
      document_id: params.documentId,
      page_number: params.pageNumber,
      anchor: toAnchorJson(params.anchor),
      state: "open",
      resolved_at: null,
    })
    .select("*")
    .single();

  if (threadError || !thread) {
    throw new CommentsApiError(
      500,
      "COMMENTS_THREAD_CREATE_FAILED",
      threadError?.message ?? "Failed to create comment thread",
    );
  }

  const { data: message, error: messageError } = await supabase
    .from("comment_messages")
    .insert({
      workspace_id: access.link.workspace_id,
      link_id: params.linkId,
      thread_id: thread.id,
      body: params.body.trim(),
      author_type: author.authorType,
      author_key: author.authorKey,
      author_label: author.authorEmail,
      author_email: author.authorEmail,
      author_color: author.authorColor,
    })
    .select("*")
    .single();

  if (messageError || !message) {
    const { error: cleanupError } = await supabase
      .from("comment_threads")
      .delete()
      .eq("id", thread.id);
    if (cleanupError) {
      console.error("[Comments] Failed to cleanup orphan thread", cleanupError);
    }
    throw new CommentsApiError(
      500,
      "COMMENTS_MESSAGE_CREATE_FAILED",
      messageError?.message ?? "Failed to create comment",
    );
  }

  void recordCommentAuditEvent({
    workspaceId: access.link.workspace_id,
    documentId: access.documentId,
    dataRoomId: access.link.data_room_id ?? null,
    linkId: params.linkId,
    threadId: thread.id,
    messageId: message.id,
    pageNumber: thread.page_number,
    quote: params.anchor.quote ?? null,
    bodyPreview: params.body.trim(),
    eventType: "comment_thread_created",
    actor: {
      actorType: "viewer",
      actorEmail: author.authorEmail,
      actorUserId: null,
    },
  });

  void notifyWorkspaceOwnersOfViewerComment({
    workspaceId: access.link.workspace_id,
    documentId: access.documentId,
    dataRoomId: access.link.data_room_id ?? null,
    viewerEmail: author.authorEmail,
    pageNumber: thread.page_number,
    quote: params.anchor.quote ?? null,
    commentBody: params.body.trim(),
  }).catch((err) => {
    console.error("[Comments] Owner notify failed", err);
  });

  return {
    thread: {
      id: thread.id,
      page_number: thread.page_number,
      anchor: toCommentAnchor(thread.anchor),
      state: thread.state,
      resolved_at: thread.resolved_at,
      created_at: thread.created_at,
      updated_at: thread.updated_at,
    },
    messages: [mapMessage(message, author.authorKey, true)],
  };
};

export const createCommentReply = async (
  req: NextRequest,
  params: {
    linkId: string;
    threadId: string;
    body: string;
  },
) => {
  const thread = await getThreadById({
    threadId: params.threadId,
    linkId: params.linkId,
  });

  const access = await ensureCommentsAccess(req, {
    linkId: params.linkId,
    documentId: thread.document_id,
  });

  if (thread.state !== "open") {
    throw new CommentsApiError(
      409,
      "THREAD_RESOLVED",
      "Resolved threads can’t receive replies",
    );
  }

  const author = await resolveAuthorContext(req, access, {
    requireForWrite: true,
  });
  if (!author) {
    throw new CommentsApiError(
      401,
      "COMMENT_EMAIL_VERIFICATION_REQUIRED",
      "Email verification required before commenting",
    );
  }

  const supabase = createSupabaseServiceClient();

  const { data: message, error: messageError } = await supabase
    .from("comment_messages")
    .insert({
      workspace_id: access.link.workspace_id,
      link_id: params.linkId,
      thread_id: thread.id,
      body: params.body.trim(),
      author_type: author.authorType,
      author_key: author.authorKey,
      author_label: author.authorEmail,
      author_email: author.authorEmail,
      author_color: author.authorColor,
    })
    .select("*")
    .single();

  if (messageError || !message) {
    throw new CommentsApiError(
      500,
      "COMMENTS_REPLY_CREATE_FAILED",
      messageError?.message ?? "Failed to add reply",
    );
  }

  const { error: touchThreadError } = await supabase
    .from("comment_threads")
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq("id", thread.id)
    .eq("link_id", params.linkId);

  if (touchThreadError) {
    throw new CommentsApiError(
      500,
      "COMMENTS_REPLY_CREATE_FAILED",
      touchThreadError.message,
    );
  }

  void recordCommentAuditEvent({
    workspaceId: access.link.workspace_id,
    documentId: thread.document_id,
    dataRoomId: access.link.data_room_id ?? null,
    linkId: params.linkId,
    threadId: thread.id,
    messageId: message.id,
    pageNumber: thread.page_number,
    quote: toCommentAnchor(thread.anchor).quote ?? null,
    bodyPreview: params.body.trim(),
    eventType: "comment_reply_sent",
    actor: {
      actorType: "viewer",
      actorEmail: author.authorEmail,
      actorUserId: null,
    },
  });

  void notifyWorkspaceOwnersOfViewerComment({
    workspaceId: access.link.workspace_id,
    documentId: thread.document_id,
    dataRoomId: access.link.data_room_id ?? null,
    viewerEmail: author.authorEmail,
    pageNumber: thread.page_number,
    quote: toCommentAnchor(thread.anchor).quote ?? null,
    commentBody: params.body.trim(),
  }).catch((err) => {
    console.error("[Comments] Owner notify failed", err);
  });

  return {
    message: mapMessage(message, author.authorKey, true),
  };
};

export const updateCommentThreadState = async (
  req: NextRequest,
  params: {
    linkId: string;
    threadId: string;
    action: "resolve" | "unresolve";
  },
) => {
  const thread = await getThreadById({
    threadId: params.threadId,
    linkId: params.linkId,
  });

  const access = await ensureCommentsAccess(req, {
    linkId: params.linkId,
    documentId: thread.document_id,
  });

  const author = await resolveAuthorContext(req, access, {
    requireForWrite: true,
  });
  if (!author) {
    throw new CommentsApiError(
      401,
      "COMMENT_EMAIL_VERIFICATION_REQUIRED",
      "Email verification required before commenting",
    );
  }

  const supabase = createSupabaseServiceClient();
  const { data: firstMessage, error: firstMessageError } = await supabase
    .from("comment_messages")
    .select("id, author_key")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstMessageError) {
    throw new CommentsApiError(
      500,
      "COMMENTS_RESOLVE_FAILED",
      firstMessageError.message,
    );
  }

  if (!firstMessage || firstMessage.author_key !== author.authorKey) {
    throw new CommentsApiError(
      403,
      "THREAD_RESOLVE_FORBIDDEN",
      "Only the thread creator can change resolve state",
    );
  }

  const nextState = params.action === "resolve" ? "resolved" : "open";
  const resolvedAt =
    params.action === "resolve" ? new Date().toISOString() : null;

  const { data: updatedThread, error: updateError } = await supabase
    .from("comment_threads")
    .update({
      state: nextState,
      resolved_at: resolvedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", thread.id)
    .eq("link_id", params.linkId)
    .select("*")
    .single();

  if (updateError || !updatedThread) {
    throw new CommentsApiError(
      500,
      "COMMENTS_RESOLVE_FAILED",
      updateError?.message ?? "Failed to update thread state",
    );
  }

  void recordCommentAuditEvent({
    workspaceId: access.link.workspace_id,
    documentId: thread.document_id,
    dataRoomId: access.link.data_room_id ?? null,
    linkId: params.linkId,
    threadId: thread.id,
    messageId: null,
    pageNumber: updatedThread.page_number,
    quote: toCommentAnchor(updatedThread.anchor).quote ?? null,
    eventType:
      params.action === "resolve"
        ? "comment_thread_resolved"
        : "comment_thread_unresolved",
    actor: {
      actorType: "viewer",
      actorEmail: author.authorEmail,
      actorUserId: null,
    },
  });

  return {
    thread: {
      id: updatedThread.id,
      page_number: updatedThread.page_number,
      anchor: toCommentAnchor(updatedThread.anchor),
      state: updatedThread.state,
      resolved_at: updatedThread.resolved_at,
      created_at: updatedThread.created_at,
      updated_at: updatedThread.updated_at,
    },
  };
};

export const deleteCommentMessage = async (
  req: NextRequest,
  params: {
    linkId: string;
    messageId: string;
  },
) => {
  const supabase = createSupabaseServiceClient();

  const { data: message, error: messageError } = await supabase
    .from("comment_messages")
    .select("id, thread_id, author_key, link_id")
    .eq("id", params.messageId)
    .eq("link_id", params.linkId)
    .maybeSingle();

  if (messageError) {
    throw new CommentsApiError(
      500,
      "COMMENTS_DELETE_FAILED",
      messageError.message,
    );
  }

  if (!message) {
    throw new CommentsApiError(404, "MESSAGE_NOT_FOUND", "Comment not found");
  }

  const thread = await getThreadById({
    threadId: message.thread_id,
    linkId: params.linkId,
  });

  const access = await ensureCommentsAccess(req, {
    linkId: params.linkId,
    documentId: thread.document_id,
  });

  const author = await resolveAuthorContext(req, access, {
    requireForWrite: true,
  });

  if (!author || message.author_key !== author.authorKey) {
    throw new CommentsApiError(
      403,
      "COMMENT_DELETE_FORBIDDEN",
      "You can only delete your own comments",
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("comment_messages")
    .update({
      state: "deleted",
      deleted_at: now,
      body: "[deleted]",
    })
    .eq("id", params.messageId)
    .eq("link_id", params.linkId);

  if (updateError) {
    throw new CommentsApiError(
      500,
      "COMMENTS_DELETE_FAILED",
      updateError.message,
    );
  }

  await supabase
    .from("comment_threads")
    .update({ updated_at: now })
    .eq("id", thread.id)
    .eq("link_id", params.linkId);

  return { success: true };
};
