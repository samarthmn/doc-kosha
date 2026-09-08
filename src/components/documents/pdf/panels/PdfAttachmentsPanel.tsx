"use client";

import React, { useEffect, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

type PdfAttachment = {
  key: string;
  filename: string;
  size: number;
  content: Uint8Array;
};

type PdfAttachmentsPanelProps = {
  document: PDFDocumentProxy | null;
};

const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
};

const toAttachments = (value: unknown): PdfAttachment[] => {
  if (typeof value !== "object" || value === null) return [];
  const attachments: PdfAttachment[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "object" || entry === null) continue;
    const content =
      "content" in entry && entry.content instanceof Uint8Array
        ? entry.content
        : null;
    if (!content) continue;
    const filename =
      "filename" in entry && typeof entry.filename === "string"
        ? entry.filename
        : key;
    attachments.push({
      key,
      filename,
      size: content.byteLength,
      content,
    });
  }
  return attachments;
};

const downloadAttachment = (attachment: PdfAttachment): void => {
  // Copy into a fresh buffer: the proxy's Uint8Array can be a view over a
  // larger transferable, and Blob would otherwise capture the whole thing.
  const bytes = new Uint8Array(attachment.content);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/octet-stream" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = attachment.filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const PdfAttachmentsPanel: React.FC<PdfAttachmentsPanelProps> = ({
  document: pdfDocument,
}) => {
  const [attachments, setAttachments] = useState<PdfAttachment[] | null>(null);

  useEffect(() => {
    setAttachments(null);
    if (!pdfDocument) return;

    let active = true;
    void pdfDocument
      .getAttachments()
      .then((value: unknown) => {
        if (active) setAttachments(toAttachments(value));
      })
      .catch(() => {
        if (active) setAttachments([]);
      });
    return () => {
      active = false;
    };
  }, [pdfDocument]);

  if (attachments === null) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        Loading attachments…
      </p>
    );
  }
  if (attachments.length === 0) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        There is no attachment
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {attachments.map((attachment) => (
        <li key={attachment.key}>
          <button
            type="button"
            onClick={() => downloadAttachment(attachment)}
            className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-left text-xs text-foreground hover:bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <DownloadSimple
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate">
              {attachment.filename}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatSize(attachment.size)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};
