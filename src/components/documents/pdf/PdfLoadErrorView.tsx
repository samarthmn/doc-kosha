"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Warning } from "@phosphor-icons/react";

type PdfLoadErrorKind = "bandwidth" | "forbidden" | "missing" | "generic";

export type PdfLoadFailure = {
  name?: string;
  message?: string;
  status?: number;
};

type PdfLoadErrorViewProps = {
  error: PdfLoadFailure;
  fileUrl: string | Uint8Array;
  onRetry?: () => void;
};

const PUBLIC_FILE_ROUTE_PREFIX = "/api/public/links/file";
const BANDWIDTH_ERROR_CODE = "BANDWIDTH_LIMIT_REACHED";

const isPublicFileProxyUrl = (
  fileUrl: string | Uint8Array,
): fileUrl is string =>
  typeof fileUrl === "string" && fileUrl.startsWith(PUBLIC_FILE_ROUTE_PREFIX);

export const getInitialPdfLoadErrorKind = (
  error: PdfLoadFailure,
  fileUrl: string | Uint8Array,
): PdfLoadErrorKind => {
  const status = error.status;
  if (status === 404) return "missing";
  if (status === 401 || status === 403) {
    return isPublicFileProxyUrl(fileUrl) ? "forbidden" : "generic";
  }
  return "generic";
};

const getErrorCopy = (
  kind: PdfLoadErrorKind,
): { title: string; description: string } => {
  switch (kind) {
    case "bandwidth":
      return {
        title: "Viewing limit reached",
        description:
          "This shared document is temporarily unavailable because the sender's workspace has reached its public viewing limit. Please contact the sender for help.",
      };
    case "forbidden":
      return {
        title: "Document unavailable",
        description:
          "We could not load this document with the current access session. Please refresh the page or contact the sender if this continues.",
      };
    case "missing":
      return {
        title: "Document unavailable",
        description:
          "This document is no longer available from this link. Please contact the sender for help.",
      };
    case "generic":
    default:
      return {
        title: "Document could not be loaded",
        description:
          "We could not retrieve this document right now. Please try again or contact the sender if this continues.",
      };
  }
};

export const PdfLoadErrorView: React.FC<PdfLoadErrorViewProps> = ({
  error,
  fileUrl,
  onRetry,
}) => {
  const initialKind = useMemo(
    () => getInitialPdfLoadErrorKind(error, fileUrl),
    [error, fileUrl],
  );
  const [kind, setKind] = useState<PdfLoadErrorKind>(initialKind);

  useEffect(() => {
    setKind(initialKind);
  }, [initialKind]);

  useEffect(() => {
    if (!isPublicFileProxyUrl(fileUrl)) return;
    if (error.status !== 403) return;

    let active = true;
    const inspectPublicFileError = async (): Promise<void> => {
      try {
        const response = await fetch(fileUrl, {
          method: "HEAD",
          cache: "no-store",
          redirect: "manual",
        });
        if (!active) return;
        const code = response.headers.get("X-DocKosha-Error-Code");
        if (code === BANDWIDTH_ERROR_CODE) {
          setKind("bandwidth");
        }
      } catch {
        // Keep the safe generic 403 copy if diagnostics fail.
      }
    };

    void inspectPublicFileError();
    return () => {
      active = false;
    };
  }, [error.status, fileUrl]);

  const copy = getErrorCopy(kind);

  return (
    <div className="flex h-full min-h-[320px] items-center justify-center bg-muted/20 px-6 py-10">
      <div
        className="dk-nocturne-surface relative max-w-md overflow-hidden rounded-lg p-6 text-center text-foreground"
        role="alert"
      >
        <div
          className="absolute inset-x-0 top-0 h-px bg-destructive/65"
          aria-hidden="true"
        />
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded border border-destructive/25 bg-destructive/8 text-destructive">
          <Warning className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-base font-semibold">{copy.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {copy.description}
        </p>
        {onRetry ? (
          <button
            type="button"
            className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={onRetry}
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
};
