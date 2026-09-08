"use client";

import { useCallback, useMemo } from "react";

export type CommentAnchor = {
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  quote?: string;
};

export type CommentThreadSummary = {
  id: string;
  page_number: number;
  anchor: CommentAnchor;
  state: "open" | "resolved";
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview: string | null;
};

export type CommentMessage = {
  id: string;
  body: string;
  state?: "active" | "deleted";
  author_label: string;
  author_color: string;
  created_at: string;
  is_me: boolean;
};

export type CommentThreadDetail = {
  thread: {
    id: string;
    page_number: number;
    anchor: CommentAnchor;
    state: "open" | "resolved";
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
  };
  messages: CommentMessage[];
};

type PublicCommentsError = Error & {
  code?: string;
};

const parseError = async (res: Response): Promise<PublicCommentsError> => {
  const payload = (await res.json().catch(() => null)) as {
    error?: unknown;
    code?: unknown;
  } | null;

  const message =
    payload && typeof payload.error === "string"
      ? payload.error
      : "Comments request failed";
  const error = new Error(message) as PublicCommentsError;
  if (payload && typeof payload.code === "string") {
    error.code = payload.code;
  }
  return error;
};

const withQuery = (path: string, params: Record<string, string>) => {
  const search = new URLSearchParams(params);
  return `${path}?${search.toString()}`;
};

export const usePublicComments = () => {
  const listThreads = useCallback(
    async (args: {
      linkId: string;
      documentId: string;
    }): Promise<{ threads: CommentThreadSummary[] }> => {
      const res = await fetch(
        withQuery("/api/public/comments/threads", {
          linkId: args.linkId,
          documentId: args.documentId,
        }),
        {
          credentials: "include",
        },
      );

      if (!res.ok) {
        throw await parseError(res);
      }

      const payload = (await res.json()) as {
        threads?: CommentThreadSummary[];
      };
      return {
        threads: Array.isArray(payload.threads) ? payload.threads : [],
      };
    },
    [],
  );

  const getThread = useCallback(
    async (args: {
      linkId: string;
      threadId: string;
    }): Promise<CommentThreadDetail> => {
      const res = await fetch(
        withQuery("/api/public/comments/thread", {
          linkId: args.linkId,
          threadId: args.threadId,
        }),
        {
          credentials: "include",
        },
      );

      if (!res.ok) {
        throw await parseError(res);
      }

      return (await res.json()) as CommentThreadDetail;
    },
    [],
  );

  const createThread = useCallback(
    async (args: {
      linkId: string;
      documentId: string;
      pageNumber: number;
      anchor: CommentAnchor;
      body: string;
    }): Promise<CommentThreadDetail> => {
      const res = await fetch("/api/public/comments/thread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(args),
      });

      if (!res.ok) {
        throw await parseError(res);
      }

      return (await res.json()) as CommentThreadDetail;
    },
    [],
  );

  const createReply = useCallback(
    async (args: {
      linkId: string;
      threadId: string;
      body: string;
    }): Promise<{ message: CommentMessage }> => {
      const res = await fetch("/api/public/comments/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(args),
      });

      if (!res.ok) {
        throw await parseError(res);
      }

      return (await res.json()) as { message: CommentMessage };
    },
    [],
  );

  const updateThreadState = useCallback(
    async (args: {
      linkId: string;
      threadId: string;
      action: "resolve" | "unresolve";
    }): Promise<{
      thread: CommentThreadDetail["thread"];
    }> => {
      const res = await fetch("/api/public/comments/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(args),
      });

      if (!res.ok) {
        throw await parseError(res);
      }

      return (await res.json()) as {
        thread: CommentThreadDetail["thread"];
      };
    },
    [],
  );

  const deleteMessage = useCallback(
    async (args: {
      linkId: string;
      messageId: string;
    }): Promise<{ success: true }> => {
      const res = await fetch("/api/public/comments/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(args),
      });

      if (!res.ok) {
        throw await parseError(res);
      }

      return (await res.json()) as { success: true };
    },
    [],
  );

  return useMemo(
    () => ({
      listThreads,
      getThread,
      createThread,
      createReply,
      updateThreadState,
      deleteMessage,
    }),
    [
      createReply,
      createThread,
      deleteMessage,
      getThread,
      listThreads,
      updateThreadState,
    ],
  );
};
