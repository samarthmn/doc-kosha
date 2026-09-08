"use client";

import { useCallback, useMemo } from "react";
import type { Json } from "@/types/generated/supabase";
import {
  PublicSubmissionKind,
  type PublicSubmissionRequest,
} from "@/lib/analytics/publicSubmissions";
import {
  TrackerEvent,
  TrackerResourceType,
} from "@/lib/analytics/publicTracker";

interface PublicEventInput {
  linkId: string;
  resourceId: string;
  resourceType?: TrackerResourceType;
  documentId?: string | null;
  event: TrackerEvent;
  sessionId?: string | null;
  pageNumber?: number | null;
  sectionOffset?: number | null;
  durationMs?: number | null;
  workspaceId?: string;
}

export interface PublicEventResponse {
  success: boolean;
  isUniqueView?: boolean;
  isRevisit?: boolean;
  notificationViewToken?: string;
  skippedReason?:
    "email_verification_required" | "access_confirmation_required" | string;
}

interface StructuredError {
  code: string;
  message: string;
}

type StructuredErrorInstance = Error & Partial<StructuredError>;

function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

export const usePublicSubmissions = () => {
  const callIngest = useCallback(
    async (
      payload: PublicSubmissionRequest,
    ): Promise<Record<string, unknown>> => {
      const res = await fetch("/api/public/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok) {
        const errorObj: StructuredErrorInstance = new Error(
          typeof json.error === "string" ? json.error : "Ingest failed",
        );
        if (typeof json.code === "string") {
          errorObj.code = json.code;
        }
        throw errorObj;
      }
      return json;
    },
    [],
  );

  const insertEvent = useCallback(
    async (payload: PublicEventInput): Promise<PublicEventResponse> => {
      try {
        const json = await callIngest({
          kind: PublicSubmissionKind.Event,
          linkId: payload.linkId,
          resourceId: payload.resourceId,
          resourceType: payload.resourceType ?? TrackerResourceType.Document,
          workspaceId: payload.workspaceId,
          documentId: payload.documentId ?? null,
          event: payload.event,
          sessionId: payload.sessionId ?? null,
          pageNumber: payload.pageNumber ?? null,
          sectionOffset: payload.sectionOffset ?? null,
          durationMs: payload.durationMs ?? null,
        });
        return {
          success: true,
          ...(typeof json.isUniqueView === "boolean"
            ? { isUniqueView: json.isUniqueView }
            : {}),
          ...(typeof json.isRevisit === "boolean"
            ? { isRevisit: json.isRevisit }
            : {}),
          ...(typeof json.notificationViewToken === "string"
            ? { notificationViewToken: json.notificationViewToken }
            : {}),
        };
      } catch (error) {
        if (isStructuredError(error)) {
          if (error.code === "EMAIL_VERIFICATION_REQUIRED") {
            if (process.env.NODE_ENV !== "production") {
              console.debug(
                "[public-submissions] skipped event:",
                error.message,
              );
            }
            return {
              success: false,
              skippedReason: "email_verification_required",
            };
          }
          if (error.code === "ACCESS_CONFIRMATION_REQUIRED") {
            if (process.env.NODE_ENV !== "production") {
              console.debug(
                "[public-submissions] skipped event:",
                error.message,
              );
            }
            return {
              success: false,
              skippedReason: "access_confirmation_required",
            };
          }
        }

        // Fallback for legacy/other errors
        const message =
          error instanceof Error ? error.message : String(error ?? "");
        const normalized = message.toLowerCase();
        if (normalized.includes("email verification required")) {
          return {
            success: false,
            skippedReason: "email_verification_required",
          };
        }
        if (normalized.includes("access confirmation required")) {
          return {
            success: false,
            skippedReason: "access_confirmation_required",
          };
        }

        // Swallow transient network errors (e.g. "Load failed", "Failed to
        // fetch") so they don't surface as unhandled rejections in Sentry.
        // Analytics ingestion is best-effort; the viewer should not break.
        if (
          error instanceof TypeError &&
          /load failed|failed to fetch|network/i.test(error.message)
        ) {
          if (process.env.NODE_ENV !== "production") {
            console.debug(
              "[public-submissions] network error swallowed:",
              error.message,
            );
          }
          return { success: false };
        }

        throw error;
      }
    },
    [callIngest],
  );

  const submitFeedback = useCallback(
    async (args: {
      linkId: string;
      resourceId: string;
      resourceType?: TrackerResourceType;
      submission: Json;
      workspaceId?: string;
    }): Promise<void> => {
      await callIngest({
        kind: PublicSubmissionKind.Feedback,
        linkId: args.linkId,
        resourceId: args.resourceId,
        resourceType: args.resourceType ?? TrackerResourceType.Document,
        workspaceId: args.workspaceId,
        submission: args.submission,
      });
    },
    [callIngest],
  );

  const submitQA = useCallback(
    async (args: {
      linkId: string;
      resourceId: string;
      resourceType?: TrackerResourceType;
      question: string;
      answer?: string | null;
      workspaceId?: string;
    }): Promise<void> => {
      await callIngest({
        kind: PublicSubmissionKind.Qa,
        linkId: args.linkId,
        resourceId: args.resourceId,
        resourceType: args.resourceType ?? TrackerResourceType.Document,
        workspaceId: args.workspaceId,
        question: args.question,
        answer: args.answer ?? null,
      });
    },
    [callIngest],
  );

  return useMemo(
    () => ({ insertEvent, submitFeedback, submitQA }),
    [insertEvent, submitFeedback, submitQA],
  );
};
