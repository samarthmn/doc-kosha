"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Tables } from "@/types/generated/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { showError } from "@/lib/toast";

export type InternalViewerDoc = {
  id: string;
  title: string;
  file_type: string;
  size_bytes: number;
  num_pages: number | null;
  storage_path: string;
  converted_storage_path: string | null;
  conversion_status?: string | null;
  workspace_id?: string | null;
  data_room_id?: string | null;
};

type InternalDocumentViewerProviderValue = {
  doc: InternalViewerDoc;
  workspaceId: string;
  dataRoom: Tables<"data_rooms"> | null;
};

type InternalDocumentViewerContextValue =
  InternalDocumentViewerProviderValue & {
    processingTimedOut: boolean;
    refreshDoc: () => Promise<void>;
    requestProcessing: () => Promise<void>;
    resolvePageCount: (pageCount: number) => void;
  };

const InternalDocumentViewerContext =
  createContext<InternalDocumentViewerContextValue | null>(null);

export const InternalDocumentViewerProvider: React.FC<
  React.PropsWithChildren<{ value: InternalDocumentViewerProviderValue }>
> = ({ value, children }) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [doc, setDoc] = useState<InternalViewerDoc>(value.doc);
  const [processingTimedOut, setProcessingTimedOut] = useState<boolean>(false);

  // Reset doc state when navigating to a new document.
  useEffect(() => {
    setDoc(value.doc);
    setProcessingTimedOut(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.doc.id]);

  const refreshDoc = useCallback(async (): Promise<void> => {
    if (!doc?.id) return;
    setProcessingTimedOut(false);
    try {
      const { data } = await supabase
        .from("documents")
        .select(
          "conversion_status, converted_storage_path, num_pages, title, storage_path, file_type, size_bytes, data_room_id",
        )
        .eq("id", doc.id)
        .maybeSingle();

      const next = data as {
        conversion_status?: string | null;
        converted_storage_path?: string | null;
        num_pages?: number | null;
        title?: string | null;
        storage_path?: string | null;
        file_type?: string | null;
        size_bytes?: number | null;
        data_room_id?: string | null;
      } | null;

      if (!next) return;

      setDoc((prev) => {
        if (prev.id !== doc.id) return prev;
        const patch: Partial<InternalViewerDoc> = {};
        if (
          typeof next.conversion_status === "string" ||
          next.conversion_status === null
        ) {
          patch.conversion_status = next.conversion_status;
        }
        if ("converted_storage_path" in next) {
          patch.converted_storage_path = next.converted_storage_path ?? null;
        }
        if ("num_pages" in next) {
          patch.num_pages =
            typeof next.num_pages === "number" ? next.num_pages : null;
        }
        if ("title" in next && typeof next.title === "string") {
          patch.title = next.title;
        }
        if ("storage_path" in next && typeof next.storage_path === "string") {
          patch.storage_path = next.storage_path;
        }
        if ("file_type" in next && typeof next.file_type === "string") {
          patch.file_type = next.file_type;
        }
        if ("size_bytes" in next && typeof next.size_bytes === "number") {
          patch.size_bytes = next.size_bytes;
        }
        if ("data_room_id" in next) {
          patch.data_room_id = next.data_room_id ?? null;
        }
        if (Object.keys(patch).length === 0) return prev;
        return { ...prev, ...patch };
      });
    } catch (err) {
      console.warn("[InternalViewer] refreshDoc failed", err);
    }
  }, [doc.id, supabase]);

  const requestProcessing = useCallback(async (): Promise<void> => {
    if (!doc?.id) return;
    if (!value.workspaceId) return;

    setProcessingTimedOut(false);
    setDoc((prev) => {
      if (prev.id !== doc.id) return prev;
      return { ...prev, conversion_status: "in_progress" };
    });

    // Fire-and-forget; viewer polling will reflect success/failure.
    void fetch("/api/convert/document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        documentId: doc.id,
        workspaceId: value.workspaceId,
        force: true,
      }),
    }).catch(() => {
      setDoc((prev) => {
        if (prev.id !== doc.id) return prev;
        return { ...prev, conversion_status: "failed" };
      });
      showError("Failed to start processing. Please try again.");
    });
  }, [doc.id, value.workspaceId]);

  const resolvePageCount = useCallback(
    (pageCount: number): void => {
      if (!Number.isSafeInteger(pageCount) || pageCount <= 0) return;
      setDoc((prev) => {
        if (prev.id !== doc.id || prev.num_pages === pageCount) return prev;
        return { ...prev, num_pages: pageCount };
      });
    },
    [doc.id],
  );

  // Poll conversion status while processing (viewer-only, bounded).
  useEffect(() => {
    const status = doc.conversion_status ?? null;
    const shouldPoll = status === "in_progress";
    if (!shouldPoll) return;
    if (processingTimedOut) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delayMs = 2500;
    const startedAt = Date.now();
    let attempts = 0;
    const MAX_POLL_ATTEMPTS = 60;
    const MAX_POLL_DURATION_MS = 6 * 60 * 1000;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      const elapsed = Date.now() - startedAt;
      if (attempts >= MAX_POLL_ATTEMPTS || elapsed >= MAX_POLL_DURATION_MS) {
        setProcessingTimedOut(true);
        return;
      }
      try {
        const { data } = await supabase
          .from("documents")
          .select("conversion_status, converted_storage_path, num_pages")
          .eq("id", doc.id)
          .maybeSingle();

        const next = data as {
          conversion_status?: string | null;
          converted_storage_path?: string | null;
          num_pages?: number | null;
        } | null;

        const nextStatus = next?.conversion_status ?? null;
        const nextConverted = next?.converted_storage_path ?? null;
        const nextPages =
          typeof next?.num_pages === "number" ? next.num_pages : null;

        setDoc((prev) => {
          if (prev.id !== doc.id) return prev;
          const patch: Partial<InternalViewerDoc> = {};
          // Only advance status while we are already processing.
          // Avoid downgrading local `in_progress` back to `pending` if the DB update is delayed.
          if (
            nextStatus === "in_progress" ||
            nextStatus === "completed" ||
            nextStatus === "failed"
          ) {
            patch.conversion_status = nextStatus;
          }
          if (typeof nextConverted === "string") {
            patch.converted_storage_path = nextConverted;
          }
          if (nextPages !== null) {
            patch.num_pages = nextPages;
          }
          if (Object.keys(patch).length === 0) return prev;
          return { ...prev, ...patch };
        });

        if (nextStatus === "completed" || nextStatus === "failed") return;
      } catch {
        // ignore
      }

      delayMs = Math.min(8000, delayMs + 750);
      timer = setTimeout(() => void poll(), delayMs);
    };

    timer = setTimeout(() => void poll(), delayMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [doc.conversion_status, doc.id, processingTimedOut, supabase]);

  const ctxValue = useMemo<InternalDocumentViewerContextValue>(
    () => ({
      workspaceId: value.workspaceId,
      dataRoom: value.dataRoom,
      doc,
      processingTimedOut,
      refreshDoc,
      requestProcessing,
      resolvePageCount,
    }),
    [
      doc,
      processingTimedOut,
      refreshDoc,
      requestProcessing,
      resolvePageCount,
      value.dataRoom,
      value.workspaceId,
    ],
  );

  return (
    <InternalDocumentViewerContext.Provider value={ctxValue}>
      {children}
    </InternalDocumentViewerContext.Provider>
  );
};

export const useInternalDocumentViewer =
  (): InternalDocumentViewerContextValue => {
    const ctx = useContext(InternalDocumentViewerContext);
    if (!ctx) {
      throw new Error(
        "useInternalDocumentViewer must be used within InternalDocumentViewerProvider",
      );
    }
    return ctx;
  };
