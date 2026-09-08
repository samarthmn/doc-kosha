"use client";

import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CaretDown,
  CircleNotch,
  Eraser,
  FloppyDisk,
  Scissors,
} from "@phosphor-icons/react";
import Viewer from "@/components/documents/Viewer";
import type {
  PdfTextLayerReadyEvent,
  PdfViewerOverlay,
} from "@/components/documents/pdf/engine/MozillaPdfViewer";
import type { DocumentRow } from "@/components/documents/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { Separator } from "@/components/ui/separator";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { cn } from "@/lib/utils";
import {
  isCompletedConversionEligibleExtension,
  isPdfExtension,
} from "@/lib/fileTypes";
import { showError, showInfo, showSuccess } from "@/lib/toast";
import {
  REDACTION_WARNING_CODES,
  REDACTION_WARNINGS_HEADER,
  type RedactionWarningCode,
} from "@/lib/redactionWarnings";
import {
  getDocumentsClientCacheKey,
  invalidateDocumentsClientCache,
} from "@/modules/documents/clientCache";
import {
  areaToScreenArea,
  clampPercent,
  getAreaCssProperties,
  rectsToAreas,
  transformCapturedAreas,
  type PageArea,
} from "@/components/documents/pdf/geometry/pageAreas";
import {
  buildNextRedactedFilename,
  ensurePdfFileName,
  makeRedactedBaseName,
  normalizeNameForConflict,
} from "@/modules/documents/redactionNaming";

type RedactionMode = "replace" | "new";

type GeneratedRedactedPdf = {
  bytes: Uint8Array<ArrayBuffer>;
  pageCount: number | null;
  saveMode: RedactionMode;
  uploadName: string;
  warningCodes: RedactionWarningCode[];
};

type CommittedRedactedPdf = {
  documentId: string;
  mode: RedactionMode;
};

type RedactionArea = {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type RedactionSelection = {
  id: string;
  areas: RedactionArea[];
  excerpt: string;
};

type SelectionArea = PageArea;

type ActiveSelection = {
  areas: SelectionArea[];
  selectedText: string;
};

type RedactionStudioDoc = DocumentRow & {
  folder_id: string | null;
  workspace_id: string;
  data_room_id: string | null;
};

type DocumentRedactionStudioProps = {
  doc: RedactionStudioDoc;
  workspaceId: string;
  backHref: string;
  documentViewHref: string;
  dataRoomName?: string | null;
};

const MAX_REDACTION_AREAS = 800;

const isRedactionWarningCode = (value: string): value is RedactionWarningCode =>
  REDACTION_WARNING_CODES.some((warningCode) => warningCode === value);

const makeRandomId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const formatSelectionPageLabel = (areas: RedactionArea[]): string => {
  const pages = [...new Set(areas.map((area) => area.pageIndex + 1))].sort(
    (left, right) => left - right,
  );
  return pages.length === 1 ? `Page ${pages[0]}` : `Pages ${pages.join(", ")}`;
};

const getPdfSource = (doc: RedactionStudioDoc) => {
  const ext = (doc.file_type ?? "").toLowerCase();

  if (isPdfExtension(ext)) {
    return {
      ready: true,
      reason: null as string | null,
    };
  }

  if (isCompletedConversionEligibleExtension(ext)) {
    if (!doc.converted_storage_path || doc.conversion_status !== "completed") {
      return {
        ready: false,
        reason:
          "This file is still processing. Redaction is available after PDF conversion is complete.",
      };
    }

    return {
      ready: true,
      reason: null as string | null,
    };
  }

  return {
    ready: false,
    reason:
      "Redaction is currently available only for PDF and convertible document formats.",
  };
};

const DocumentRedactionStudio: React.FC<DocumentRedactionStudioProps> = ({
  doc,
  workspaceId,
  backHref,
  documentViewHref,
  dataRoomName,
}) => {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isNavigating, startTransition] = useTransition();
  const [redactions, setRedactions] = useState<RedactionSelection[]>([]);
  const [activeSelection, setActiveSelection] =
    useState<ActiveSelection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommittingPendingRedaction, setIsCommittingPendingRedaction] =
    useState(false);
  const [isSaveAsNewDialogOpen, setIsSaveAsNewDialogOpen] = useState(false);
  const [newDocumentName, setNewDocumentName] = useState("");
  const [pendingRedactedPdf, setPendingRedactedPdf] =
    useState<GeneratedRedactedPdf | null>(null);
  const warningCancelButtonRef = useRef<HTMLButtonElement>(null);

  const pdfSource = useMemo(() => getPdfSource(doc), [doc]);
  const canRedact = pdfSource.ready;

  const textLayerElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const pageRotationsRef = useRef<Map<number, number>>(new Map());

  const redactionsByPage = useMemo(() => {
    const grouped = new Map<number, number>();
    redactions.forEach((selection) => {
      const selectionPages = new Set(
        selection.areas.map((area) => area.pageIndex),
      );
      selectionPages.forEach((pageIndex) => {
        grouped.set(pageIndex, (grouped.get(pageIndex) ?? 0) + 1);
      });
    });
    return grouped;
  }, [redactions]);

  const removeRedaction = useCallback((id: string) => {
    setRedactions((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearRedactions = useCallback(() => {
    setRedactions([]);
  }, []);

  const addRedactions = useCallback(
    (areas: SelectionArea[], excerpt: string) => {
      const safeExcerpt = excerpt.trim().slice(0, 140);
      const validAreas = areas
        .filter((area) => area.width > 0 && area.height > 0)
        .map((area) => ({
          pageIndex: area.pageIndex,
          left: clampPercent(area.left),
          top: clampPercent(area.top),
          width: clampPercent(area.width),
          height: clampPercent(area.height),
        }));
      if (validAreas.length === 0) return;

      setRedactions((prev) => {
        const existingAreaCount = prev.reduce(
          (total, selection) => total + selection.areas.length,
          0,
        );
        const remainingAreaCount = MAX_REDACTION_AREAS - existingAreaCount;
        if (remainingAreaCount <= 0) {
          showInfo("Maximum redaction limit reached for this document.");
          return prev;
        }

        const nextAreas = validAreas.slice(0, remainingAreaCount);
        if (nextAreas.length < validAreas.length) {
          showInfo("Maximum redaction limit reached for this document.");
        }
        return [
          ...prev,
          {
            id: makeRandomId(),
            areas: nextAreas,
            excerpt: safeExcerpt,
          },
        ];
      });
    },
    [],
  );

  const clearActiveSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setActiveSelection(null);
  }, []);

  const computeActiveSelection = useCallback((): ActiveSelection | null => {
    if (!canRedact || isSaving) return null;

    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const selectedText = selection.toString();
    if (!selectedText || selectedText.trim().length === 0) return null;

    const range = selection.getRangeAt(0);
    const rawRects = Array.from(range.getClientRects());
    if (rawRects.length === 0) return null;

    const pageBoxes = Array.from(textLayerElementsRef.current.entries()).map(
      ([pageIndex, ele]) => ({
        pageIndex,
        rect: ele.getBoundingClientRect(),
      }),
    );
    if (pageBoxes.length === 0) return null;

    // Overlay rotation contains toolbar rotation only; intrinsic PDF /Rotate
    // is deliberately excluded and remains the engine's responsibility.
    // Convert each screen-space capture back to the persisted page contract
    // exactly once before sending percentages to the redaction engine.
    const areas = transformCapturedAreas(
      rectsToAreas({ clientRects: rawRects, pageBoxes }),
      pageRotationsRef.current,
    ).map((pageArea) => ({
      ...pageArea,
      left: clampPercent(pageArea.left),
      top: clampPercent(pageArea.top),
      width: clampPercent(pageArea.width),
      height: clampPercent(pageArea.height),
    }));
    if (areas.length === 0) return null;
    return { areas, selectedText };
  }, [canRedact, isSaving]);

  const handleTextLayerMouseDown = useCallback(() => {
    setActiveSelection(null);
  }, []);

  const handleTextLayerMouseUp = useCallback(() => {
    const next = computeActiveSelection();
    setActiveSelection(next);
  }, [computeActiveSelection]);

  const onTextLayerReady = useCallback(
    ({ element, pageIndex, phase }: PdfTextLayerReadyEvent): void => {
      const existing = textLayerElementsRef.current.get(pageIndex);
      if (phase === "detach") {
        if (existing !== element) return;
        element.removeEventListener("mousedown", handleTextLayerMouseDown);
        element.removeEventListener("mouseup", handleTextLayerMouseUp);
        textLayerElementsRef.current.delete(pageIndex);
        return;
      }

      if (existing && existing !== element) {
        existing.removeEventListener("mousedown", handleTextLayerMouseDown);
        existing.removeEventListener("mouseup", handleTextLayerMouseUp);
      }
      element.dataset.dkTextLayer = String(pageIndex);
      textLayerElementsRef.current.set(pageIndex, element);
      element.addEventListener("mousedown", handleTextLayerMouseDown);
      element.addEventListener("mouseup", handleTextLayerMouseUp);
    },
    [handleTextLayerMouseDown, handleTextLayerMouseUp],
  );

  const redactionOverlays = useMemo<readonly PdfViewerOverlay[]>(
    () => [
      {
        id: "dk-redaction",
        layer: "over-text",
        onTextLayerReady,
        renderPageOverlay: ({ pageIndex, rotation }) => {
          pageRotationsRef.current.set(pageIndex, rotation);
          const selectionAreas =
            activeSelection?.areas.filter(
              (area) => area.pageIndex === pageIndex,
            ) ?? [];
          const pageRedactions = redactions.flatMap((selection) =>
            selection.areas.flatMap((area, areaIndex) =>
              area.pageIndex === pageIndex
                ? [{ area, areaIndex, selectionId: selection.id }]
                : [],
            ),
          );
          const anchor = selectionAreas[0] ?? null;
          const screenAnchor = anchor
            ? areaToScreenArea(anchor, rotation)
            : null;
          const actionArea = screenAnchor
            ? {
                pageIndex,
                top: Math.max(screenAnchor.top - 1, 2),
                left: Math.min(screenAnchor.left + screenAnchor.width + 1, 94),
                width: 0,
                height: 0,
              }
            : null;

          return (
            <>
              {selectionAreas.map((area, index) => (
                <div
                  key={`selection-${area.pageIndex}-${area.top}-${area.left}-${index}`}
                  style={getAreaCssProperties(area, rotation)}
                  className="pointer-events-none absolute z-10 rounded-sm border border-amber-600/90 bg-amber-300/55"
                />
              ))}

              {pageRedactions.map(({ area, areaIndex, selectionId }) => (
                <button
                  key={`${selectionId}-${areaIndex}`}
                  type="button"
                  style={getAreaCssProperties(area, rotation)}
                  className="pointer-events-auto absolute z-20 rounded-sm border border-amber-500/80 bg-amber-300/50 transition-colors hover:bg-amber-300/70 focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => removeRedaction(selectionId)}
                  aria-label={`Remove redaction on page ${area.pageIndex + 1}`}
                  title="Remove redaction"
                />
              ))}

              {actionArea && canRedact && !isSaving && activeSelection ? (
                <div
                  className="pointer-events-auto absolute z-30"
                  style={{
                    left: `${actionArea.left}%`,
                    top: `${actionArea.top}%`,
                  }}
                >
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 border-primary bg-primary px-2 text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
                    aria-label="Add redaction"
                    title="Add redaction"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      addRedactions(
                        activeSelection.areas,
                        activeSelection.selectedText,
                      );
                      clearActiveSelection();
                    }}
                  >
                    <Scissors className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Redact
                  </Button>
                </div>
              ) : null}
            </>
          );
        },
      },
    ],
    [
      activeSelection,
      addRedactions,
      canRedact,
      clearActiveSelection,
      isSaving,
      onTextLayerReady,
      redactions,
      removeRedaction,
    ],
  );

  const deleteUploadedObject = useCallback(
    async (params: { logicalBucket: string; path: string }) => {
      await fetch("/api/storage/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          items: [
            {
              logicalBucket: params.logicalBucket,
              path: params.path,
            },
          ],
        }),
      }).catch(() => undefined);
    },
    [workspaceId],
  );

  const getNextCopyName = useCallback(async (): Promise<string> => {
    let query = supabase
      .from("documents")
      .select("title")
      .eq("workspace_id", workspaceId);

    query =
      doc.data_room_id !== null
        ? query.eq("data_room_id", doc.data_room_id)
        : query.is("data_room_id", null);

    query =
      doc.folder_id !== null
        ? query.eq("folder_id", doc.folder_id)
        : query.is("folder_id", null);

    const { data, error } = await query;
    if (error) {
      throw new Error("Unable to verify duplicate names");
    }

    const titles = (data ?? [])
      .map((item) => item.title?.trim() ?? "")
      .filter((value) => value.length > 0);

    return buildNextRedactedFilename(doc.title, titles);
  }, [doc.data_room_id, doc.folder_id, doc.title, supabase, workspaceId]);

  const generateRedactedPdf = useCallback(
    async (
      saveMode: RedactionMode,
      newDocumentName?: string,
    ): Promise<GeneratedRedactedPdf> => {
      if (!canRedact) {
        throw new Error("Document is not ready for redaction");
      }
      if (redactions.length === 0) {
        throw new Error("Select at least one area to redact");
      }

      const trimmedNewName = newDocumentName?.trim() ?? "";
      if (saveMode === "new" && newDocumentName !== undefined) {
        if (!trimmedNewName) {
          throw new Error("Enter a name for the redacted document.");
        }
      }

      const uploadName =
        saveMode === "replace"
          ? ensurePdfFileName(doc.title)
          : trimmedNewName
            ? ensurePdfFileName(trimmedNewName)
            : await getNextCopyName();

      const redactionResponse = await fetch("/api/documents/redaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          documentId: doc.id,
          redactions: redactions.flatMap((selection) =>
            selection.areas.map((area) => ({
              pageIndex: area.pageIndex,
              left: area.left,
              top: area.top,
              width: area.width,
              height: area.height,
            })),
          ),
        }),
      });
      if (!redactionResponse.ok) {
        const payload = (await redactionResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Failed to process redaction");
      }

      const bytes = new Uint8Array(await redactionResponse.arrayBuffer());
      const warningCodes = [
        ...new Set(
          (redactionResponse.headers.get(REDACTION_WARNINGS_HEADER) ?? "")
            .split(",")
            .map((warningCode) => warningCode.trim())
            .filter(isRedactionWarningCode),
        ),
      ];
      const pageCountHeader = redactionResponse.headers.get(
        "x-redaction-page-count",
      );
      const parsedPageCount = pageCountHeader
        ? Number.parseInt(pageCountHeader, 10)
        : NaN;
      const pageCount =
        Number.isInteger(parsedPageCount) && parsedPageCount > 0
          ? parsedPageCount
          : doc.num_pages;

      return { bytes, pageCount, saveMode, uploadName, warningCodes };
    },
    [
      canRedact,
      doc.id,
      doc.num_pages,
      doc.title,
      getNextCopyName,
      redactions,
      workspaceId,
    ],
  );

  const commitRedactedPdf = useCallback(
    async (
      generatedPdf: GeneratedRedactedPdf,
    ): Promise<CommittedRedactedPdf> => {
      const { bytes, pageCount, saveMode, uploadName } = generatedPdf;

      const assetKind = doc.data_room_id ? "data-room-document" : "document";
      const uploadUrlResponse = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          assetKind,
          workspaceId,
          filename: uploadName,
          contentType: "application/pdf",
          fileSizeBytes: bytes.byteLength,
          folderId: doc.folder_id,
          dataRoomId: doc.data_room_id,
          replaceDocumentId: saveMode === "replace" ? doc.id : null,
        }),
      });

      if (!uploadUrlResponse.ok) {
        throw new Error("Unable to prepare redacted file upload");
      }

      const uploadPayload = (await uploadUrlResponse.json()) as {
        uploadUrl: string;
        logicalBucket: string;
        storagePath: string;
      };

      const uploadResult = await fetch(uploadPayload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: new Blob([bytes], { type: "application/pdf" }),
      });

      if (!uploadResult.ok) {
        throw new Error("Redacted file upload failed");
      }

      if (saveMode === "replace") {
        const idempotencyKey = `${doc.id}:${Date.now()}:${makeRandomId().slice(0, 12)}`;
        const replaceResponse = await fetch(
          "/api/documents/versioning/replace",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              workspaceId,
              documentId: doc.id,
              uploaded: {
                storagePath: uploadPayload.storagePath,
                convertedStoragePath: null,
                conversionStatus: "completed",
                sizeBytes: bytes.byteLength,
                numPages:
                  typeof pageCount === "number" && pageCount > 0
                    ? pageCount
                    : null,
                title: ensurePdfFileName(doc.title),
                fileType: "pdf",
                folderId: doc.folder_id,
                dataRoomId: doc.data_room_id,
              },
              idempotencyKey,
            }),
          },
        );

        if (!replaceResponse.ok) {
          await deleteUploadedObject({
            logicalBucket: uploadPayload.logicalBucket,
            path: uploadPayload.storagePath,
          });
          const payload = (await replaceResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error ?? "Failed to replace document");
        }

        return { documentId: doc.id, mode: "replace" as const };
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user?.id) {
        await deleteUploadedObject({
          logicalBucket: uploadPayload.logicalBucket,
          path: uploadPayload.storagePath,
        });
        throw new Error("Authentication expired. Please sign in again.");
      }

      const { data: inserted, error: insertError } = await supabase
        .from("documents")
        .insert({
          workspace_id: workspaceId,
          folder_id: doc.folder_id,
          data_room_id: doc.data_room_id,
          title: uploadName,
          file_type: "pdf",
          storage_path: uploadPayload.storagePath,
          converted_storage_path: null,
          conversion_claim_id: null,
          size_bytes: bytes.byteLength,
          num_pages:
            typeof pageCount === "number" && pageCount > 0 ? pageCount : null,
          created_by: user.id,
          conversion_status: "completed",
        })
        .select("id")
        .single();

      if (insertError || !inserted?.id) {
        await deleteUploadedObject({
          logicalBucket: uploadPayload.logicalBucket,
          path: uploadPayload.storagePath,
        });
        if (insertError?.code === "23505") {
          throw new Error(
            "A document with this name already exists in this location.",
          );
        }
        throw new Error("Failed to save redacted copy");
      }

      return { documentId: inserted.id, mode: "new" as const };
    },
    [
      deleteUploadedObject,
      doc.data_room_id,
      doc.folder_id,
      doc.id,
      doc.title,
      supabase,
      workspaceId,
    ],
  );

  const finishRedactionCommit = useCallback(
    (result: CommittedRedactedPdf): void => {
      const documentsCacheKey = getDocumentsClientCacheKey(doc.data_room_id);
      if (documentsCacheKey) {
        invalidateDocumentsClientCache(documentsCacheKey);
      }

      if (result.mode === "replace") {
        showSuccess("Document redacted and replaced successfully.");
        startTransition(() => router.push(documentViewHref));
        return;
      }

      showSuccess("Redacted copy created successfully.");
      setIsSaveAsNewDialogOpen(false);
      setNewDocumentName("");
      const nextHref = doc.data_room_id
        ? `/data-rooms/${doc.data_room_id}/documents/view/${result.documentId}`
        : `/documents/view/${result.documentId}`;
      startTransition(() => router.push(nextHref));
    },
    [doc.data_room_id, documentViewHref, router],
  );

  const commitAndFinishRedaction = useCallback(
    async (generatedPdf: GeneratedRedactedPdf): Promise<void> => {
      try {
        const result = await commitRedactedPdf(generatedPdf);
        finishRedactionCommit(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to redact document";
        showError(message);
      } finally {
        setIsSaving(false);
      }
    },
    [commitRedactedPdf, finishRedactionCommit],
  );

  const handleSave = useCallback(
    async (
      mode: RedactionMode,
      options?: { newDocumentName?: string },
    ): Promise<void> => {
      if (isSaving) return;
      setIsSaving(true);
      try {
        const generatedPdf = await generateRedactedPdf(
          mode,
          options?.newDocumentName,
        );
        if (generatedPdf.warningCodes.includes("over_redaction")) {
          setPendingRedactedPdf(generatedPdf);
          setIsSaveAsNewDialogOpen(false);
          return;
        }
        await commitAndFinishRedaction(generatedPdf);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to redact document";
        showError(message);
        setIsSaving(false);
      }
    },
    [commitAndFinishRedaction, generateRedactedPdf, isSaving],
  );

  const discardPendingRedactedPdf = useCallback((): void => {
    setPendingRedactedPdf(null);
    setIsSaving(false);
  }, []);

  const confirmPendingRedactedPdf = useCallback(async (): Promise<void> => {
    if (!pendingRedactedPdf || isCommittingPendingRedaction) return;
    setIsCommittingPendingRedaction(true);
    try {
      await commitAndFinishRedaction(pendingRedactedPdf);
    } finally {
      setPendingRedactedPdf(null);
      setIsCommittingPendingRedaction(false);
    }
  }, [
    commitAndFinishRedaction,
    isCommittingPendingRedaction,
    pendingRedactedPdf,
  ]);

  const openSaveAsNewDialog = useCallback(() => {
    const fallbackName = ensurePdfFileName(makeRedactedBaseName(doc.title));
    setNewDocumentName(fallbackName);
    setIsSaveAsNewDialogOpen(true);

    void getNextCopyName()
      .then((nextName) => {
        setNewDocumentName((current) =>
          normalizeNameForConflict(current) ===
          normalizeNameForConflict(fallbackName)
            ? nextName
            : current,
        );
      })
      .catch(() => undefined);
  }, [doc.title, getNextCopyName]);

  const handleSaveAsNewDialogSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleSave("new", { newDocumentName });
    },
    [handleSave, newDocumentName],
  );

  return (
    <PageContainer
      maxWidth="full"
      className={cn(
        // Height budget: the app chrome is declared once here as custom
        // properties so no per-page literal can drift from the real shell.
        // The compact WebKit shell keeps its header and tab bar in normal flow,
        // so its inherited offsets are zero. Other mobile engines retain the
        // fixed chrome offsets. Both collapse at >=1024px.
        "[--dk-app-header-h:var(--dk-mobile-app-header-height,calc(3.5rem+env(safe-area-inset-top)))] [--dk-app-tabbar-h:var(--dk-mobile-app-tabbar-height,calc(4rem+env(safe-area-inset-bottom)))]",
        "[--dk-app-sticky-top:var(--dk-mobile-app-header-offset,var(--dk-app-header-h))]",
        "lg:[--dk-app-header-h:0px] lg:[--dk-app-tabbar-h:0px]",
        "lg:[--dk-app-sticky-top:0px]",
        "[--dk-app-chrome-h:calc(var(--dk-app-header-h)_+_var(--dk-app-tabbar-h))]",
        "flex min-h-[calc(100dvh-var(--dk-app-chrome-h))] flex-col gap-5 pb-20 md:pb-8",
      )}
    >
      {/* The inherited offset clears fixed chrome and is zero when the WebKit
          compact shell keeps its header in normal flow. */}
      <div className="sticky top-[var(--dk-app-sticky-top,0px)] z-20 flex flex-col gap-2 border-b border-border/70 bg-background/95 pb-4 backdrop-blur supports-backdrop-filter:bg-background/90">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit px-2 text-muted-foreground hover:text-foreground"
          aria-label="Go back"
        >
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back
          </Link>
        </Button>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 text-xl font-medium tracking-tight">
              Document Redaction
            </h1>
            <Badge variant="secondary">{doc.title}</Badge>
            {dataRoomName ? (
              <Badge variant="outline">{dataRoomName}</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
        <div className="flex h-[68dvh] max-h-[44rem] min-h-[28rem] flex-col overflow-hidden rounded-lg bg-card/30 lg:h-auto lg:max-h-none lg:min-h-0">
          <Viewer
            doc={doc}
            accessMode="authenticated"
            className="h-full min-h-0 w-full flex-1"
            pdfOverlays={redactionOverlays}
          />
        </div>

        <div className="min-h-0 space-y-4">
          <Card className="relative overflow-hidden border-border/70 bg-card/50">
            <div
              className="absolute inset-x-0 top-0 h-px bg-primary/55"
              aria-hidden="true"
            />
            <CardHeader className="space-y-2 border-b border-border/60">
              <CardTitle className="text-base font-medium">
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Select text on the document and click <strong>Redact</strong> to
                add secure blackout regions.
              </p>
              <p className="text-muted-foreground">
                Redacted regions are destructively removed from the PDF while
                non-redacted text remains selectable.
              </p>
              {!canRedact && pdfSource.reason ? (
                <p className="text-destructive">{pdfSource.reason}</p>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex min-h-0 flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)]">
            <Card className="border-border/70 bg-card/50 lg:shrink-0">
              <CardHeader className="space-y-2 border-b border-border/60">
                <CardTitle className="text-base font-medium">
                  Apply Redaction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Choose how to save the redacted PDF when you apply the
                  redaction.
                </p>

                <Separator />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={
                        isSaving ||
                        isNavigating ||
                        redactions.length === 0 ||
                        !canRedact
                      }
                    >
                      {isSaving ? (
                        <>
                          <CircleNotch
                            aria-hidden
                            className="mr-2 h-4 w-4 animate-spin"
                          />
                          Saving…
                        </>
                      ) : (
                        <>
                          <FloppyDisk
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                          Apply redaction
                          <CaretDown
                            className="ml-2 h-4 w-4 opacity-70"
                            aria-hidden="true"
                          />
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuItem
                      onSelect={() => void handleSave("replace")}
                    >
                      Replace current document
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openSaveAsNewDialog}>
                      Save as new document
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/50 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              <CardHeader className="space-y-2 border-b border-border/60">
                <CardTitle className="text-base font-medium">
                  Redactions
                </CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-col gap-3">
                {redactions.length === 0 ? (
                  <EmptyState
                    variant="bare"
                    compact
                    icon={
                      <Scissors
                        className="h-6 w-6 text-muted-foreground"
                        aria-hidden
                      />
                    }
                    title="No redactions yet"
                    description="Select text on the document and click Redact to add one."
                  />
                ) : (
                  <div className="max-h-[300px]! space-y-2 overflow-y-auto pr-1 lg:max-h-none lg:min-h-0 lg:flex-1">
                    {redactions.map((item, index) => (
                      <div
                        key={item.id}
                        data-testid="redaction-selection"
                        className="flex items-start justify-between gap-2 rounded border border-border/65 bg-background/20 p-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-medium">
                            #{index + 1} ·{" "}
                            {formatSelectionPageLabel(item.areas)}
                          </p>
                          {item.excerpt ? (
                            <p className="truncate text-xs text-muted-foreground">
                              “{item.excerpt}”
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Manual selection
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => removeRedaction(item.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {redactionsByPage.size > 0 ? (
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {[...redactionsByPage.entries()].map(
                      ([pageIndex, count]) => (
                        <Badge key={pageIndex} variant="outline">
                          Page {pageIndex + 1}: {count}
                        </Badge>
                      ),
                    )}
                  </div>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearRedactions}
                  disabled={redactions.length === 0 || isSaving}
                >
                  <Eraser className="mr-2 h-4 w-4" aria-hidden="true" />
                  Clear All
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog
        open={isSaveAsNewDialogOpen}
        onOpenChange={(open) => {
          if (isSaving) return;
          setIsSaveAsNewDialogOpen(open);
          if (!open) setNewDocumentName("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name redacted document</DialogTitle>
            <DialogDescription>
              Choose a name for the new redacted PDF.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSaveAsNewDialogSubmit}>
            <div className="space-y-2">
              <Label htmlFor="redacted-document-name">Document name</Label>
              <Input
                id="redacted-document-name"
                autoFocus
                value={newDocumentName}
                onChange={(event) => setNewDocumentName(event.target.value)}
                placeholder="Q4 report redacted.pdf"
                maxLength={180}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Saved as PDF. “.pdf” is applied automatically.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => {
                  setIsSaveAsNewDialogOpen(false);
                  setNewDocumentName("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <CircleNotch
                      aria-hidden
                      className="mr-2 h-4 w-4 animate-spin"
                    />
                    Saving…
                  </>
                ) : (
                  "Done"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingRedactedPdf !== null}
        onOpenChange={(open) => {
          if (open || isCommittingPendingRedaction) return;
          discardPendingRedactedPdf();
        }}
      >
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            warningCancelButtonRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Review redaction result</DialogTitle>
            <DialogDescription>
              Extra content may have been removed. The PDF engine reports that
              extra visible objects may have been removed beyond the areas you
              selected. Cancel to keep your redaction selections and refine
              them, or confirm to save this generated PDF.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              ref={warningCancelButtonRef}
              type="button"
              variant="outline"
              disabled={isCommittingPendingRedaction}
              onClick={discardPendingRedactedPdf}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isCommittingPendingRedaction}
              onClick={() => void confirmPendingRedactedPdf()}
            >
              {isCommittingPendingRedaction ? (
                <>
                  <CircleNotch
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Saving…
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default DocumentRedactionStudio;
