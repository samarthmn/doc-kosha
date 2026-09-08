"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePublicResolve } from "@/hooks/usePublicResolve";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PublicGateShell } from "@/components/public/PublicGateShell";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  DataRoomResolveResult,
  PublicDataRoomDocument,
  PublicDataRoomFolder,
} from "@/hooks/usePublicResolve";
import {
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  CircleNotch as Loader2,
  DownloadSimple as Download,
  Eye,
  FileText,
  Folder,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { extractFilenameFromContentDisposition } from "@/lib/utils";
import { TrackerResourceType } from "@/lib/analytics/publicTracker";
import { PublicHeader } from "@/components/public/PublicHeader";
import ScreenLoader from "@/components/ui/screenLoader";
import ScreenshotShield from "@/components/public/ScreenshotShield";
import { usePublicViewerTracking } from "@/hooks/usePublicViewerTracking";
import { showInfo } from "@/lib/toast";
import { generateNdaTemplate } from "@/modules/nda/template";
import { z } from "zod";
import { FolderTree } from "@/components/documents/FolderTree";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import PublicNdaGate, {
  createInitialOtpState,
  type NdaStep,
  type OtpState,
} from "@/components/public/PublicNdaGate";
import { createTypedNdaSignatureImage } from "@/components/public/ndaSignatureImage";
import { getPublicMessages } from "@/modules/public-links/i18n";
import {
  DEFAULT_PUBLIC_LANGUAGE,
  normalizePublicLanguage,
  type PublicLanguage,
} from "@/modules/public-links/types";
import { formatFileSize } from "@/lib/format";

interface PublicDataRoomViewerClientProps {
  dataRoomId: string;
  linkId: string;
  slug?: string[];
}

const NDA_EMAIL_MAX_LENGTH = 254;
const ndaEmailSchema = z.string().email().max(NDA_EMAIL_MAX_LENGTH);

const getLocalizedDataRoomResourceCopy = (
  language: PublicLanguage,
): { plainName: string; actionVerb: string } => {
  switch (language) {
    case "fr":
      return { plainName: "cet espace sécurisé", actionVerb: "voir" };
    case "es":
      return { plainName: "esta sala de datos", actionVerb: "ver" };
    case "de":
      return { plainName: "diesen Datenraum", actionVerb: "ansehen" };
    default:
      return { plainName: "this data room", actionVerb: "view" };
  }
};

const buildFolderMap = (folders: PublicDataRoomFolder[]) => {
  const byId = new Map<string, PublicDataRoomFolder>();
  folders.forEach((f) => byId.set(f.id, f));
  return byId;
};

type DataRoomResolveCacheEntry = {
  atMs: number;
  result: DataRoomResolveResult;
};

const DATA_ROOM_RESOLVE_CACHE_TTL_MS = 60_000;

const dataRoomResolveCache = new Map<string, DataRoomResolveCacheEntry>();

const readCachedDataRoomResolve = (
  key: string,
): DataRoomResolveResult | null => {
  const hit = dataRoomResolveCache.get(key) || null;
  if (!hit) return null;
  if (Date.now() - hit.atMs > DATA_ROOM_RESOLVE_CACHE_TTL_MS) {
    dataRoomResolveCache.delete(key);
    return null;
  }
  return hit.result;
};

const writeCachedDataRoomResolve = (
  key: string,
  result: DataRoomResolveResult,
) => dataRoomResolveCache.set(key, { atMs: Date.now(), result });

const PublicDataRoomViewerClient: React.FC<PublicDataRoomViewerClientProps> = ({
  dataRoomId,
  linkId,
  slug = [],
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = useMemo(
    () => `/r/${dataRoomId}/${linkId}/folders`,
    [dataRoomId, linkId],
  );
  const resolveCacheKey = useMemo(
    () => `${dataRoomId}:${linkId}`,
    [dataRoomId, linkId],
  );
  const folderTreeExpandedStorageKey = useMemo(
    () => `dk-public-room-tree-expanded:${dataRoomId}:${linkId}`,
    [dataRoomId, linkId],
  );
  const lastBrowseHrefStorageKey = useMemo(
    () => `dk-public-room-last-folder-href:${dataRoomId}:${linkId}`,
    [dataRoomId, linkId],
  );
  const normalizedSlug = useMemo(() => (slug || []).filter(Boolean), [slug]);
  const slugFolderId = normalizedSlug.length
    ? normalizedSlug[normalizedSlug.length - 1]!
    : "root";
  const { resolve } = usePublicResolve();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gatePassword, setGatePassword] = useState<string>("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState<boolean>(false);
  const [emailOtp, setEmailOtp] = useState<OtpState>(() =>
    createInitialOtpState(),
  );
  const [ndaStep, setNdaStep] = useState<NdaStep>("intro");
  const [ndaOtp, setNdaOtp] = useState<OtpState>(() => createInitialOtpState());
  const [ndaFullName, setNdaFullName] = useState<string>("");
  const [ndaEmailVerified, setNdaEmailVerified] = useState<boolean>(false);
  const [ndaDrawnSignature, setNdaDrawnSignature] = useState<string | null>(
    null,
  );
  const [ndaTypedSignature, setNdaTypedSignature] = useState<string | null>(
    null,
  );
  const [ndaSignatureSource, setNdaSignatureSource] = useState<
    "draw" | "typed" | null
  >("typed");
  const [ndaSubmitting, setNdaSubmitting] = useState<boolean>(false);
  const [ndaPdfChecking, setNdaPdfChecking] = useState<boolean>(false);
  const [ndaSignError, setNdaSignError] = useState<string | null>(null);
  const [ndaPreviewReferenceDate, setNdaPreviewReferenceDate] =
    useState<Date | null>(null);
  const [ndaSignatureResetKey, setNdaSignatureResetKey] = useState<number>(0);
  const [downloadingZip, setDownloadingZip] = useState<
    "room" | "folder" | null
  >(null);
  const [foldersSheetOpen, setFoldersSheetOpen] = useState<boolean>(false);

  const [room, setRoom] = useState<DataRoomResolveResult["room"] | null>(null);
  const [linkSettings, setLinkSettings] = useState<
    DataRoomResolveResult["link"] | null
  >(null);
  const [ndaTemplateSnapshotHtml, setNdaTemplateSnapshotHtml] = useState<
    string | null
  >(null);
  const [folders, setFolders] = useState<PublicDataRoomFolder[]>([]);
  const [documents, setDocuments] = useState<PublicDataRoomDocument[]>([]);
  const [brandingHeader, setBrandingHeader] =
    useState<DataRoomResolveResult["branding_header"]>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [resendCooldownSec, setResendCooldownSec] = useState<number>(0);
  const [ndaResendCooldownSec, setNdaResendCooldownSec] = useState<number>(0);
  const [publicLanguage, setPublicLanguage] = useState<PublicLanguage>(
    DEFAULT_PUBLIC_LANGUAGE,
  );

  const messages = useMemo(
    () => getPublicMessages(publicLanguage),
    [publicLanguage],
  );

  const clearNdaSignatureState = () => {
    setNdaDrawnSignature(null);
    setNdaTypedSignature(null);
    setNdaSignatureSource("typed");
    setNdaSignatureResetKey((key) => key + 1);
  };

  const handleDrawSignatureChange = (next: string | null) => {
    setNdaDrawnSignature(next);
    if (next) {
      setNdaSignatureSource("draw");
    } else if (ndaSignatureSource === "draw") {
      setNdaSignatureSource(ndaTypedSignature ? "typed" : null);
    }
  };

  useEffect(() => {
    const trimmed = ndaFullName.trim();
    if (!trimmed) {
      setNdaTypedSignature(null);
      return;
    }
    const image = createTypedNdaSignatureImage(trimmed);
    if (image) {
      setNdaTypedSignature(image);
    }
  }, [ndaFullName]);

  const resolvedNdaSignature = useMemo(() => {
    if (ndaSignatureSource === "draw") {
      return ndaDrawnSignature;
    }
    if (ndaSignatureSource === "typed") {
      return ndaTypedSignature;
    }
    return ndaDrawnSignature ?? ndaTypedSignature;
  }, [ndaDrawnSignature, ndaTypedSignature, ndaSignatureSource]);

  useEffect(() => {
    if (ndaStep === "sign" && !ndaPreviewReferenceDate) {
      setNdaPreviewReferenceDate(new Date());
    }
    if (ndaStep !== "sign" && ndaPreviewReferenceDate) {
      setNdaPreviewReferenceDate(null);
    }
  }, [ndaStep, ndaPreviewReferenceDate]);

  const ndaTemplateHtml =
    linkSettings?.nda_template_snapshot_html ?? ndaTemplateSnapshotHtml;
  const ndaTemplateBody = ndaTemplateHtml?.trim() ?? "";

  const ndaPreviewHtml = useMemo(() => {
    if (ndaStep !== "sign" || !ndaTemplateBody) {
      return null;
    }
    const referenceDate = ndaPreviewReferenceDate ?? new Date();
    const { previewHtml } = generateNdaTemplate({
      workspaceName: workspaceName || "The Workspace",
      documentTitle: room?.name ?? "Data Room",
      receivingPartyName: ndaFullName.trim() || null,
      receivingPartyEmail: ndaOtp.email.trim() || null,
      effectiveDate: referenceDate,
      signedDateTime: referenceDate,
      signatureDataUrl: resolvedNdaSignature,
      showSignaturePlaceholder: !resolvedNdaSignature,
      bodyHtmlOverride: ndaTemplateBody,
    });
    return previewHtml;
  }, [
    ndaStep,
    ndaPreviewReferenceDate,
    workspaceName,
    room?.name,
    ndaFullName,
    ndaOtp.email,
    resolvedNdaSignature,
    ndaTemplateBody,
  ]);
  const ndaTemplateMissing =
    ndaStep === "sign" && ndaEmailVerified && !ndaTemplateBody;

  const resetOtpState = (
    setState: React.Dispatch<React.SetStateAction<OtpState>>,
    options: { clearEmail?: boolean } = {},
  ) => {
    setState((prev) => ({
      ...createInitialOtpState(),
      email: options.clearEmail ? "" : prev.email,
    }));
  };

  const sendOtp = async (
    email: string,
    setState: React.Dispatch<React.SetStateAction<OtpState>>,
  ): Promise<boolean> => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setState((prev) => ({ ...prev, error: messages.common.emailRequired }));
      return false;
    }

    setState((prev) => ({
      ...prev,
      email: trimmedEmail,
      sending: true,
      error: null,
    }));

    try {
      const res = await fetch("/api/public/links/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "send",
          linkId,
          email: trimmedEmail,
          dataRoomId,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message = data?.error || messages.common.failedToSendCode;
        throw new Error(message);
      }

      if (data?.devOtpCode) {
        showInfo(`Dev mode: your verification code is ${data.devOtpCode}.`, {
          autoClose: 7000,
        });
      }

      setState((prev) => ({
        ...prev,
        stage: "code",
        code: "",
        sending: false,
        error: null,
      }));
      setResendCooldownSec(30);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : messages.common.failedToSendCode;
      setState((prev) => ({
        ...prev,
        sending: false,
        error: message,
      }));
      return false;
    }
  };

  const verifyOtp = async (
    state: OtpState,
    setState: React.Dispatch<React.SetStateAction<OtpState>>,
    onSuccess?: () => Promise<void> | void,
  ): Promise<boolean> => {
    const email = state.email.trim();
    const code = state.code.trim();

    if (!email) {
      setState((prev) => ({ ...prev, error: messages.common.emailRequired }));
      return false;
    }

    if (!code) {
      setState((prev) => ({
        ...prev,
        error: messages.common.enterVerificationCode,
      }));
      return false;
    }

    setState((prev) => ({
      ...prev,
      verifying: true,
      error: null,
    }));

    try {
      const res = await fetch("/api/public/links/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "verify",
          linkId,
          email,
          code,
          dataRoomId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error || messages.common.verificationFailed;
        throw new Error(message);
      }

      setState((prev) => ({
        ...prev,
        verifying: false,
        stage: "verified",
        code: "",
        error: null,
      }));
      setVerifiedEmail(email);
      if (onSuccess) {
        await onSuccess();
      }
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : messages.common.verificationFailed;
      setState((prev) => ({
        ...prev,
        verifying: false,
        error: message,
      }));
      return false;
    }
  };

  const fetchNdaStatus = useCallback(async () => {
    const res = await fetch("/api/public/links/nda/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ linkId, dataRoomId }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error || messages.common.unableToVerifyNdaStatus;
      throw new Error(message);
    }

    return (data ?? { hasSigned: false, pdfReady: false }) as {
      hasSigned: boolean;
      signatureRecorded?: boolean;
      pdfReady?: boolean;
      email?: string;
    };
  }, [dataRoomId, linkId, messages.common.unableToVerifyNdaStatus]);

  useEffect(() => {
    if (resendCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldownSec((sec) => (sec > 0 ? sec - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldownSec]);

  useEffect(() => {
    if (ndaResendCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setNdaResendCooldownSec((sec) => (sec > 0 ? sec - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ndaResendCooldownSec]);

  useEffect(() => {
    if (error !== "EMAIL_OTP_REQUIRED") {
      setEmailOtp(createInitialOtpState());
    }
  }, [error]);

  useEffect(() => {
    if (error !== "NDA_SIGN_REQUIRED" && error !== "NDA_PDF_PENDING") {
      setNdaStep("intro");
      setNdaOtp(createInitialOtpState());
      setNdaFullName("");
      setNdaEmailVerified(false);
      clearNdaSignatureState();
      setNdaSubmitting(false);
      setNdaSignError(null);
    }
  }, [error]);

  useEffect(() => {
    if (
      (error === "NDA_SIGN_REQUIRED" || error === "NDA_PDF_PENDING") &&
      verifiedEmail &&
      !ndaOtp.email
    ) {
      setNdaOtp((prev) => ({ ...prev, email: verifiedEmail }));
    }
  }, [error, verifiedEmail, ndaOtp.email]);

  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const key = `dk-room-session-${dataRoomId}-${linkId}`;
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(key, sid);
    }
    setSessionId(sid);
  }, [dataRoomId, linkId]);

  const roomTrackingContext = useMemo(() => {
    if (!sessionId || !room) return null;
    return {
      sessionId,
      linkId,
      resourceId: dataRoomId,
      resourceType: TrackerResourceType.DataRoom,
      workspaceId: room.workspace_id,
      documentId: null,
    };
  }, [sessionId, linkId, dataRoomId, room]);
  const roomTracking = usePublicViewerTracking(roomTrackingContext);
  const trackRoomView = roomTracking?.trackView;

  const folderMap = useMemo(() => buildFolderMap(folders), [folders]);
  const folderExists =
    slugFolderId === "root" ? true : folderMap.has(slugFolderId);
  const currentFolderId = folderExists ? slugFolderId : "root";

  const handleDownloadZip = useCallback(
    async (scope: "room" | "folder") => {
      const folderId =
        scope === "folder" && currentFolderId !== "root"
          ? currentFolderId
          : null;

      if (scope === "folder" && !folderId) {
        showInfo(messages.dataRoom.noFolderSelectedForDownload);
        return;
      }

      setDownloadingZip(scope);
      try {
        const res = await fetch("/api/public/links/download-zip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            linkId,
            dataRoomId,
            scope,
            folderId,
          }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message =
            (typeof payload?.error === "string" && payload.error) ||
            messages.dataRoom.unableToDownloadZip;
          showInfo(message);
          return;
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const disposition = res.headers.get("content-disposition");
        const fallbackName =
          scope === "room"
            ? `${(room?.name || "data-room").trim() || "data-room"}.zip`
            : `${(room?.name || "data-room").trim() || "data-room"}-folder.zip`;
        const filename = disposition
          ? extractFilenameFromContentDisposition(disposition) || fallbackName
          : fallbackName;

        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(objectUrl);
      } catch (downloadError) {
        console.error("[public-data-room] zip download failed", downloadError);
        showInfo(messages.dataRoom.unableToDownloadZip);
      } finally {
        setDownloadingZip(null);
      }
    },
    [
      currentFolderId,
      dataRoomId,
      linkId,
      messages.dataRoom.noFolderSelectedForDownload,
      messages.dataRoom.unableToDownloadZip,
      room?.name,
    ],
  );

  useEffect(() => {
    if (loading) return;
    if (slugFolderId === "root") return;
    if (folderExists) return;
    router.replace(basePath);
  }, [slugFolderId, folderExists, router, basePath, loading]);

  const buildFolderHref = useCallback(
    (folderId: string | null) => {
      if (!folderId || folderId === "root") return basePath;
      const segments: string[] = [];
      let cursor = folderMap.get(folderId) || null;
      const guard = new Set<string>();
      while (cursor) {
        segments.unshift(cursor.id);
        const parent = cursor.parent_folder_id;
        if (!parent) break;
        if (guard.has(parent)) break;
        guard.add(parent);
        cursor = folderMap.get(parent) || null;
      }
      return segments.length ? `${basePath}/${segments.join("/")}` : basePath;
    },
    [basePath, folderMap],
  );

  const navigateToFolder = useCallback(
    (folderId: string | null) => {
      router.push(buildFolderHref(folderId));
    },
    [router, buildFolderHref],
  );

  const handleSelectFolderFromTree = useCallback(
    (folderId: string | null) => {
      setFoldersSheetOpen(false);
      navigateToFolder(folderId);
    },
    [navigateToFolder],
  );

  const buildClearSessionUrl = useCallback(() => {
    const returnPath = pathname ?? `/r/${dataRoomId}/${linkId}`;
    const params = new URLSearchParams({
      linkId,
      resourceType: "data_room",
      resourceId: dataRoomId,
      returnUrl: returnPath,
    });
    return `/api/public/links/clear-session?${params.toString()}`;
  }, [dataRoomId, linkId, pathname]);

  // Remember the last folder URL so the document viewer can navigate back to it.
  useEffect(() => {
    if (!pathname) return;
    try {
      sessionStorage.setItem(lastBrowseHrefStorageKey, pathname);
    } catch {
      // ignore
    }
  }, [lastBrowseHrefStorageKey, pathname]);

  const breadcrumbs = useMemo(() => {
    const crumbs: Array<{ id: string; name: string; href: string }> = [
      {
        id: "root",
        name: room?.name || "All documents",
        href: basePath,
      },
    ];
    if (currentFolderId === "root") {
      return crumbs;
    }
    const stack: Array<{ id: string; name: string; href: string }> = [];
    let cursor = folderMap.get(currentFolderId) || null;
    const guard = new Set<string>();
    while (cursor) {
      stack.unshift({
        id: cursor.id,
        name: cursor.name || "Untitled folder",
        href: buildFolderHref(cursor.id),
      });
      const parent = cursor.parent_folder_id;
      if (!parent) break;
      if (guard.has(parent)) break;
      guard.add(parent);
      cursor = folderMap.get(parent) || null;
    }
    return crumbs.concat(stack);
  }, [room?.name, basePath, currentFolderId, folderMap, buildFolderHref]);

  const childFolders = useMemo(() => {
    const parentKey = currentFolderId === "root" ? null : currentFolderId;
    return folders
      .filter((folder) => (folder.parent_folder_id || null) === parentKey)
      .sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        }),
      );
  }, [folders, currentFolderId]);

  const documentsInFolder = useMemo(() => {
    const parentKey = currentFolderId === "root" ? null : currentFolderId;
    return documents
      .filter((doc) => (doc.folder_id || null) === parentKey)
      .sort((a, b) =>
        (a.title || "Untitled document").localeCompare(
          b.title || "Untitled document",
          undefined,
          { sensitivity: "base" },
        ),
      );
  }, [documents, currentFolderId]);

  const folderStatsById = useMemo(() => {
    type Stats = {
      fileCount: number;
      knownBytes: number;
      unknownSizeCount: number;
    };
    const empty: Stats = { fileCount: 0, knownBytes: 0, unknownSizeCount: 0 };
    const clone = (s: Stats): Stats => ({ ...s });

    const directByFolder = new Map<string, Stats>();
    const inc = (folderId: string, doc: PublicDataRoomDocument) => {
      const prev = directByFolder.get(folderId) ?? clone(empty);
      prev.fileCount += 1;
      if (
        typeof doc.size_bytes === "number" &&
        Number.isFinite(doc.size_bytes)
      ) {
        prev.knownBytes += doc.size_bytes;
      } else {
        prev.unknownSizeCount += 1;
      }
      directByFolder.set(folderId, prev);
    };

    for (const doc of documents) {
      inc(doc.folder_id || "root", doc);
    }

    const childrenByParent = new Map<string, string[]>();
    for (const folder of folders) {
      const parentKey = folder.parent_folder_id || "root";
      const arr = childrenByParent.get(parentKey) ?? [];
      arr.push(folder.id);
      childrenByParent.set(parentKey, arr);
    }

    const totals = new Map<string, Stats>();
    const compute = (
      folderId: string,
      visited: Set<string> = new Set(),
    ): Stats => {
      const cached = totals.get(folderId);
      if (cached) return cached;

      if (visited.has(folderId)) {
        // Defensive guard: if folder parent references are cyclic we can infinite-recurse.
        console.warn(
          "[PublicDataRoomViewerClient] Detected cyclic folder parent reference while computing stats.",
          { folderId },
        );
        return empty;
      }

      visited.add(folderId);
      try {
        const base = clone(directByFolder.get(folderId) ?? empty);
        const kids = childrenByParent.get(folderId) ?? [];
        for (const childId of kids) {
          const child = compute(childId, visited);
          base.fileCount += child.fileCount;
          base.knownBytes += child.knownBytes;
          base.unknownSizeCount += child.unknownSizeCount;
        }

        totals.set(folderId, base);
        return base;
      } finally {
        visited.delete(folderId);
      }
    };

    // Prime totals for all known folders (and root).
    compute("root");
    for (const folder of folders) {
      compute(folder.id);
    }

    return totals;
  }, [documents, folders]);

  const docCountByFolderId = useMemo(() => {
    const counts = new Map<string, number>();
    folderStatsById.forEach((stats, folderId) => {
      counts.set(folderId, stats.fileCount);
    });
    return counts;
  }, [folderStatsById]);

  const applyResolvedDataRoom = (res: DataRoomResolveResult) => {
    setPublicLanguage(
      normalizePublicLanguage(res.public_language ?? res.link.public_language),
    );
    setRoom(res.room);
    setLinkSettings(res.link);
    setFolders(res.folders);
    setDocuments(res.documents);
    setBrandingHeader(res.branding_header ?? null);
    setWorkspaceName(res.workspace_name);
    setVerifiedEmail(res.verified_email || null);
  };

  const runResolve = async (override?: { password?: string }) => {
    if (!override?.password) {
      const cached = readCachedDataRoomResolve(resolveCacheKey);
      if (cached) {
        applyResolvedDataRoom(cached);
        setError(null);
        setPasswordError(null);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    if (!override) {
      setPasswordError(null);
    }

    try {
      const res = await resolve({
        linkId,
        dataRoomId,
        password: (override?.password ?? gatePassword) || undefined,
      });
      if (res.kind !== "data_room") {
        throw new Error("Unexpected resolve result");
      }

      writeCachedDataRoomResolve(resolveCacheKey, res);
      applyResolvedDataRoom(res);
    } catch (e) {
      const resolveError = e as {
        workspaceName?: string;
        workspaceId?: string;
        verifiedEmail?: string | null;
        ndaTemplateSnapshotHtml?: string | null;
        publicLanguage?: string;
      };
      const nextLanguage =
        typeof resolveError.publicLanguage === "string"
          ? normalizePublicLanguage(resolveError.publicLanguage)
          : publicLanguage;
      const nextMessages = getPublicMessages(nextLanguage);
      if (typeof resolveError.publicLanguage === "string") {
        setPublicLanguage(nextLanguage);
      }
      const message =
        e instanceof Error ? e.message : nextMessages.common.unableToOpenLink;
      if (message === "PASSWORD_REQUIRED") {
        // Link has a password but none provided yet
        setPasswordError("");
        setError(null);
      } else if (message === "BAD_PASSWORD") {
        setPasswordError(messages.common.incorrectPassword);
        setError(null);
      } else if (
        message === "NDA_SIGN_REQUIRED" ||
        message === "NDA_PDF_PENDING"
      ) {
        if (typeof resolveError.workspaceName === "string") {
          setWorkspaceName(resolveError.workspaceName);
        }
        if ("verifiedEmail" in resolveError) {
          setVerifiedEmail(resolveError.verifiedEmail ?? null);
        }
        if ("ndaTemplateSnapshotHtml" in resolveError) {
          setNdaTemplateSnapshotHtml(
            resolveError.ndaTemplateSnapshotHtml ?? null,
          );
        }
        setPasswordError(null);
        setError(message);
      } else {
        setPasswordError(null);
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const runResolveRef = useRef(runResolve);
  runResolveRef.current = runResolve;

  const checkNdaPdfReady = useCallback(async () => {
    setNdaPdfChecking(true);
    try {
      const status = await fetchNdaStatus();
      if (
        typeof status.email === "string" &&
        status.email &&
        status.email !== ndaOtp.email
      ) {
        setNdaOtp((prev) => ({ ...prev, email: status.email ?? prev.email }));
      }

      if (status.hasSigned || status.pdfReady) {
        setError(null);
        await runResolveRef.current();
        return true;
      }

      if (status.signatureRecorded) {
        setNdaEmailVerified(true);
        setNdaStep("processing");
        setError("NDA_PDF_PENDING");
        return false;
      }

      setNdaEmailVerified(true);
      setNdaStep("sign");
      setError("NDA_SIGN_REQUIRED");
      return false;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : messages.common.unableToVerifyNdaStatus;
      setNdaSignError(message);
      return false;
    } finally {
      setNdaPdfChecking(false);
    }
  }, [fetchNdaStatus, messages.common.unableToVerifyNdaStatus, ndaOtp.email]);

  // Prefetch document routes when data room loads
  useEffect(() => {
    if (!room?.id || !linkId) return;

    // Prefetch first 5 documents for faster navigation
    const docsToPrefetch = documents.slice(0, 5);
    docsToPrefetch.forEach((doc) => {
      const docHref = `/r/${room.id}/${linkId}/${doc.id}`;
      router.prefetch(docHref);
    });
  }, [room?.id, linkId, documents, router]);

  useEffect(() => {
    void runResolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error !== "NDA_PDF_PENDING") return;
    setNdaEmailVerified(true);
    setNdaStep("processing");

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      if (attempts > 40) {
        window.clearInterval(interval);
        return;
      }
      void checkNdaPdfReady();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [checkNdaPdfReady, error]);

  useEffect(() => {
    if (!roomTrackingContext || !trackRoomView) return;
    const promise = trackRoomView();
    if (!promise) return;
    void promise.catch((err) => {
      console.error("[Analytics] Failed to record data room view", err);
    });
  }, [roomTrackingContext, trackRoomView]);

  const handleSubmitPassword = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!gatePassword.trim()) {
      setPasswordError(messages.common.passwordRequired);
      return;
    }
    setPasswordSubmitting(true);
    await runResolve({ password: gatePassword });
    setPasswordSubmitting(false);
  };

  if (loading && !room && !error && !passwordError) {
    // Match the public document viewer's branded first paint (ScreenLoader)
    // instead of a bare text line.
    return <ScreenLoader />;
  }

  const renderPasswordGate = () => (
    <PublicGateShell
      title={messages.dataRoom.protectedTitle}
      description={messages.dataRoom.protectedDescription}
      error={passwordError}
    >
      <form className="space-y-3" onSubmit={handleSubmitPassword}>
        <Input
          type="password"
          aria-label="Access password"
          value={gatePassword}
          onChange={(e) => setGatePassword(e.target.value)}
          placeholder={messages.document.enterPasswordPlaceholder}
          autoComplete="current-password"
        />
        <Button type="submit" className="w-full" disabled={passwordSubmitting}>
          {passwordSubmitting
            ? messages.common.verifying
            : messages.dataRoom.unlock}
        </Button>
      </form>
    </PublicGateShell>
  );

  const renderEmailVerificationGate = () => (
    <PublicGateShell
      title={messages.dataRoom.emailVerificationRequired}
      description={messages.dataRoom.verifyEmailDescription}
      error={emailOtp.error}
    >
      <div className="flex w-full flex-col gap-3">
        <div className="flex w-full items-center gap-2">
          <Input
            placeholder={messages.document.enterEmailPlaceholder}
            type="email"
            aria-label="Email address"
            spellCheck={false}
            autoComplete="email"
            value={emailOtp.email}
            disabled={
              emailOtp.stage !== "input" ||
              emailOtp.sending ||
              emailOtp.verifying
            }
            onChange={(e) =>
              setEmailOtp((prev) => ({
                ...prev,
                email: e.target.value,
                error: null,
              }))
            }
          />
          {emailOtp.stage !== "input" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetOtpState(setEmailOtp, { clearEmail: true })}
              disabled={emailOtp.sending || emailOtp.verifying}
            >
              {messages.common.changeEmail}
            </Button>
          )}
        </div>
        {emailOtp.stage === "input" && (
          <Button
            onClick={() => void sendOtp(emailOtp.email, setEmailOtp)}
            disabled={!emailOtp.email.trim() || emailOtp.sending}
            className="w-full"
          >
            {emailOtp.sending
              ? messages.common.sending
              : messages.common.sendCode}
          </Button>
        )}
      </div>
      {emailOtp.stage === "code" && (
        <>
          <Input
            placeholder={messages.document.enterCodePlaceholder}
            inputMode="numeric"
            aria-label="Verification code"
            autoComplete="one-time-code"
            value={emailOtp.code}
            disabled={emailOtp.verifying}
            onChange={(e) =>
              setEmailOtp((prev) => ({
                ...prev,
                code: e.target.value,
                error: null,
              }))
            }
          />
          <div className="flex justify-center">
            <Button
              onClick={async () => {
                await verifyOtp(emailOtp, setEmailOtp, async () => {
                  setError(null);
                  await runResolve();
                });
              }}
              disabled={!emailOtp.code.trim() || emailOtp.verifying}
            >
              {emailOtp.verifying
                ? messages.common.verifying
                : messages.common.verify}
            </Button>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>{messages.common.didntGetCode}</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              disabled={resendCooldownSec > 0 || emailOtp.sending}
              onClick={() => void sendOtp(emailOtp.email, setEmailOtp)}
            >
              {resendCooldownSec > 0
                ? messages.common.resendIn(resendCooldownSec)
                : messages.common.resendCode}
            </Button>
          </div>
        </>
      )}
    </PublicGateShell>
  );

  const renderNdaGate = () => {
    const handleChangeNdaEmail = (options: { clearEmail?: boolean } = {}) => {
      resetOtpState(setNdaOtp, options);
      setNdaEmailVerified(false);
      clearNdaSignatureState();
      setNdaSignError(null);
    };

    const normalizeEmailInput = (value: string) =>
      value.replace(/\s+/g, "").slice(0, NDA_EMAIL_MAX_LENGTH);

    const validateNdaEmailInput = (value: string) => {
      const normalized = normalizeEmailInput(value);
      if (!normalized) {
        return { email: normalized, error: messages.common.emailRequired };
      }
      try {
        ndaEmailSchema.parse(normalized);
        return { email: normalized, error: null };
      } catch {
        return {
          email: normalized,
          error: messages.common.validEmailRequired,
        };
      }
    };

    const handleSendNdaCode = async () => {
      const { email: normalizedEmail, error } = validateNdaEmailInput(
        ndaOtp.email,
      );
      if (error) {
        setNdaOtp((prev) => ({
          ...prev,
          email: normalizedEmail,
          error,
        }));
        return;
      }
      setNdaOtp((prev) => ({ ...prev, email: normalizedEmail, error: null }));
      const ok = await sendOtp(normalizedEmail, setNdaOtp);
      if (ok) setNdaResendCooldownSec(30);
    };

    const handleVerifyNda = async () => {
      setNdaSignError(null);
      const ok = await verifyOtp(ndaOtp, setNdaOtp);
      if (!ok) {
        return;
      }

      try {
        const status = await fetchNdaStatus();
        if (status.hasSigned || status.pdfReady) {
          setError(null);
          await runResolve();
          return;
        }
        if (status.signatureRecorded) {
          setNdaEmailVerified(true);
          setNdaStep("processing");
          setError("NDA_PDF_PENDING");
          return;
        }
        setNdaEmailVerified(true);
        clearNdaSignatureState();
        setNdaStep("sign");
      } catch (statusErr) {
        const message =
          statusErr instanceof Error
            ? statusErr.message
            : messages.common.unableToVerifyNdaStatus;
        setNdaOtp((prev) => ({
          ...createInitialOtpState(),
          email: prev.email,
          error: message,
        }));
        setNdaEmailVerified(false);
        setNdaSignError(message);
      }
    };

    const handleNdaOtpEmailChange = (value: string) => {
      const sanitized = normalizeEmailInput(value);
      setNdaOtp((prev) => ({
        ...prev,
        email: sanitized,
        error: null,
      }));
    };

    const handleNdaOtpCodeChange = (value: string) => {
      setNdaOtp((prev) => ({
        ...prev,
        code: value,
        error: null,
      }));
    };

    const handleSubmitNda = async (signaturePayload: string | null) => {
      if (!ndaFullName.trim()) {
        setNdaSignError(messages.nda.enterFullName);
        return;
      }
      if (!signaturePayload) {
        setNdaSignError(messages.nda.provideSignature);
        return;
      }
      setNdaSignError(null);
      setNdaStep("processing");
      setNdaSubmitting(true);
      try {
        const res = await fetch("/api/public/links/nda/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            linkId,
            dataRoomId,
            fullName: ndaFullName.trim(),
            signature: signaturePayload,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const message = data?.error || messages.nda.failedToSign;
          throw new Error(message);
        }
        clearNdaSignatureState();
        setError(null);
        await runResolve();
      } catch (signErr) {
        const message =
          signErr instanceof Error
            ? signErr.message
            : messages.nda.failedToSign;
        setNdaSignError(message);
        setNdaStep("sign");
      } finally {
        setNdaSubmitting(false);
      }
    };

    const localizedResourceCopy =
      getLocalizedDataRoomResourceCopy(publicLanguage);
    const resourcePlainName =
      room?.name?.trim() || localizedResourceCopy.plainName;
    const resourceQuotedName = room?.name?.trim()
      ? `"${room.name.trim()}"`
      : localizedResourceCopy.plainName;
    const resourceActionVerb = localizedResourceCopy.actionVerb;

    const introDescription = workspaceName
      ? messages.nda.introDescription(
          workspaceName,
          resourceActionVerb,
          resourceQuotedName,
          resourcePlainName,
        )
      : messages.nda.introDescription(
          null,
          resourceActionVerb,
          resourceQuotedName,
          resourcePlainName,
        );

    return (
      <PublicNdaGate
        step={ndaStep}
        introDescription={introDescription}
        onContinueFromIntro={async () => {
          // If email is already verified (e.g., allowlist/email gate), skip OTP.
          if (verifiedEmail) {
            setNdaOtp((prev) => ({
              ...prev,
              email: verifiedEmail,
              stage: "verified",
              error: null,
            }));
            setNdaEmailVerified(true);
            setNdaSignError(null);
            try {
              const status = await fetchNdaStatus();
              if (status.hasSigned || status.pdfReady) {
                setError(null);
                await runResolve();
                return;
              }
              if (status.signatureRecorded) {
                setNdaStep("processing");
                setError("NDA_PDF_PENDING");
                return;
              }
              setNdaStep("sign");
            } catch (statusErr) {
              const message =
                statusErr instanceof Error
                  ? statusErr.message
                  : messages.common.unableToVerifyNdaStatus;
              setNdaSignError(message);
              setNdaStep("sign");
            }
            return;
          }
          handleChangeNdaEmail();
          setNdaStep("verify");
        }}
        otpControls={{
          state: ndaOtp,
          resendCooldownSec: ndaResendCooldownSec,
          onEmailChange: handleNdaOtpEmailChange,
          onCodeChange: handleNdaOtpCodeChange,
          onSendCode: () => void handleSendNdaCode(),
          onVerifyCode: () => void handleVerifyNda(),
          onChangeEmail: handleChangeNdaEmail,
        }}
        signatureControls={{
          fullName: ndaFullName,
          onFullNameChange: setNdaFullName,
          emailVerified: ndaEmailVerified,
          templateMissing: ndaTemplateMissing,
          previewHtml: ndaPreviewHtml,
          resolvedSignature: resolvedNdaSignature,
          submitting: ndaSubmitting,
          errorMessage: ndaSignError,
          onSubmit: (signature) => void handleSubmitNda(signature),
          signatureSource: ndaSignatureSource,
          onSignatureSourceChange: (source) => setNdaSignatureSource(source),
          onDrawSignatureChange: handleDrawSignatureChange,
          resetKey: ndaSignatureResetKey,
        }}
        processingControls={{
          isChecking: ndaPdfChecking,
          onCheck: () => void checkNdaPdfReady(),
          onSignAgain: () => {
            clearNdaSignatureState();
            setNdaSignError(null);
            setNdaStep("sign");
            setError("NDA_SIGN_REQUIRED");
          },
        }}
        messages={messages.nda}
        commonMessages={{
          changeEmail: messages.common.changeEmail,
          sendCode: messages.common.sendCode,
          sending: messages.common.sending,
          verify: messages.common.verify,
          verifying: messages.common.verifying,
          resendCode: messages.common.resendCode,
          resendIn: messages.common.resendIn,
          continue: messages.common.continue,
          change: messages.common.change,
          tryAgain: messages.common.tryAgain,
          didntGetCode: messages.common.didntGetCode,
        }}
        copy={{
          workspaceName,
          resourcePlainName,
          resourceQuotedName,
          resourceActionVerb,
        }}
      />
    );
  };

  const resolveErrorCopy = (code: string) =>
    messages.dataRoom.dataRoomResolveError(code);

  const renderErrorCard = (code: string) => (
    <PublicGateShell
      title={messages.common.linkUnavailable}
      description={`${resolveErrorCopy(code)} ${messages.common.contactLinkOwner}`}
    >
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void runResolve()}
          className="w-full"
        >
          {messages.common.tryAgain}
        </Button>
        {code === "ALC_NOT_ALLOWED" ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.removeItem(`dk-session-${linkId}`);
              }
              window.location.href = buildClearSessionUrl();
            }}
          >
            {messages.common.tryDifferentAccount}
          </Button>
        ) : null}
      </div>
    </PublicGateShell>
  );

  if (error === "EMAIL_OTP_REQUIRED") {
    return renderEmailVerificationGate();
  }

  if (error === "NDA_SIGN_REQUIRED" || error === "NDA_PDF_PENDING") {
    return renderNdaGate();
  }

  if (!room && passwordError !== null) {
    return renderPasswordGate();
  }

  if (!room && error) {
    return renderErrorCard(error);
  }

  if (!room) {
    return null;
  }

  const totalDocs = documents.length;
  const showBrandIdentity =
    Boolean(
      brandingHeader &&
      (brandingHeader.company_name ||
        brandingHeader.logo_data_url ||
        brandingHeader.logo_signed_url ||
        brandingHeader.website_url),
    ) || false;
  const brandLogoUrl = showBrandIdentity
    ? brandingHeader?.logo_data_url || brandingHeader?.logo_signed_url || null
    : null;
  const providerName = showBrandIdentity
    ? brandingHeader?.company_name?.trim() ||
      workspaceName ||
      room.name ||
      messages.header.verifiedWorkspace
    : null;
  const providerDomain = showBrandIdentity
    ? (brandingHeader?.domain ?? null)
    : null;
  const providerWebsiteUrl = showBrandIdentity
    ? (brandingHeader?.website_url ?? null)
    : null;

  return (
    <div translate="no" className="notranslate min-h-screen bg-background">
      <PublicHeader
        branding={{
          companyName: providerName,
          logoUrl: brandLogoUrl,
          websiteUrl: providerWebsiteUrl,
          domain: providerDomain,
          domainVerified: brandingHeader?.domain_verified,
          showPoweredBy: brandingHeader?.show_powered_by,
        }}
        title={room.name || messages.dataRoom.allDocuments}
        labels={messages.header}
      />
      <ScreenshotShield enabled={Boolean(linkSettings?.screenshot_protection)}>
        <main
          className="ph-no-capture mx-auto flex w-full max-w-6xl flex-col gap-6 px-3 py-5 sm:px-5 sm:py-7 lg:py-9"
          data-ph-no-capture
        >
          <SurfaceCard className="relative overflow-hidden border-border/70 bg-card/35">
            <div
              className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
              aria-hidden
            />
            <CardHeader className="space-y-4 px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-base font-semibold">
                    {messages.dataRoom.browseFolders}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {currentFolderId === "root"
                      ? messages.dataRoom.browseSharedContent
                      : messages.dataRoom.viewingFolderContents}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Sheet
                    open={foldersSheetOpen}
                    onOpenChange={setFoldersSheetOpen}
                  >
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="md:hidden"
                        aria-label={messages.dataRoom.browseFolders}
                      >
                        <Folder className="mr-2 h-4 w-4" aria-hidden />
                        {messages.dataRoom.foldersTitle}
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="left"
                      className="ph-no-capture w-[min(320px,88vw)]"
                      data-ph-no-capture
                    >
                      <SheetHeader>
                        <SheetTitle>
                          {messages.dataRoom.foldersTitle}
                        </SheetTitle>
                      </SheetHeader>
                      <div className="mt-4">
                        <FolderTree
                          folders={folders}
                          currentFolderId={currentFolderId}
                          rootLabel={
                            room.name || messages.dataRoom.allDocuments
                          }
                          mode="readonly"
                          onSelectFolder={handleSelectFolderFromTree}
                          expandedStorageKey={folderTreeExpandedStorageKey}
                        />
                      </div>
                    </SheetContent>
                  </Sheet>
                  {linkSettings?.can_download && totalDocs > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={downloadingZip !== null}
                        >
                          {downloadingZip !== null ? (
                            <Loader2
                              className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                              aria-hidden
                            />
                          ) : (
                            <Download className="mr-2 h-4 w-4" aria-hidden />
                          )}
                          {messages.header.download}
                          <ChevronDown className="ml-1 h-4 w-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => void handleDownloadZip("room")}
                          disabled={downloadingZip === "room"}
                        >
                          {downloadingZip === "room" ? (
                            <Loader2
                              className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                              aria-hidden
                            />
                          ) : (
                            <Download className="mr-2 h-4 w-4" aria-hidden />
                          )}
                          {messages.dataRoom.downloadEntireDataRoomZip}
                        </DropdownMenuItem>
                        {currentFolderId !== "root" && (
                          <DropdownMenuItem
                            onClick={() => void handleDownloadZip("folder")}
                            disabled={downloadingZip === "folder"}
                          >
                            {downloadingZip === "folder" ? (
                              <Loader2
                                className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                                aria-hidden
                              />
                            ) : (
                              <Folder className="mr-2 h-4 w-4" aria-hidden />
                            )}
                            {messages.dataRoom.downloadThisFolderZip}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
              <nav aria-label="Folder breadcrumbs" className="pb-2 text-sm">
                <ol className="flex flex-wrap items-center gap-1">
                  {breadcrumbs.map((crumb, index) => {
                    const isLast = index === breadcrumbs.length - 1;
                    return (
                      <li
                        key={`${crumb.id}-${index}`}
                        className="flex items-center gap-1"
                      >
                        {index > 0 ? (
                          <ChevronRight
                            className="h-4 w-4 text-muted-foreground"
                            aria-hidden
                          />
                        ) : null}
                        {isLast ? (
                          <span
                            aria-current="page"
                            className="font-semibold text-foreground"
                          >
                            {crumb.name}
                          </span>
                        ) : (
                          <Link
                            href={crumb.href}
                            prefetch
                            className="rounded-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none"
                          >
                            {crumb.name}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </CardHeader>
            <CardContent className="space-y-6 px-4 pt-0 pb-5 sm:px-6 sm:pb-6">
              <div className="grid gap-6 md:grid-cols-[280px_1fr]">
                <aside className="hidden md:block">
                  <div className="sticky top-4 max-h-[calc(100dvh-260px)] overflow-y-auto pr-1">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {messages.dataRoom.foldersTitle}
                    </p>
                    <div className="mt-3">
                      <FolderTree
                        folders={folders}
                        currentFolderId={currentFolderId}
                        rootLabel={room.name || messages.dataRoom.allDocuments}
                        docCountByFolderId={docCountByFolderId}
                        mode="readonly"
                        onSelectFolder={handleSelectFolderFromTree}
                        expandedStorageKey={folderTreeExpandedStorageKey}
                      />
                    </div>
                  </div>
                </aside>
                <div className="space-y-6">
                  {childFolders.length === 0 &&
                  documentsInFolder.length === 0 ? (
                    <EmptyState
                      variant="bare"
                      icon={
                        <Folder
                          className="h-6 w-6 text-muted-foreground"
                          aria-hidden
                        />
                      }
                      title={
                        currentFolderId === "root"
                          ? messages.dataRoom.noDocumentsYet
                          : messages.dataRoom.emptyFolder
                      }
                    />
                  ) : (
                    <>
                      <div className="space-y-2 md:hidden">
                        {childFolders.map((folder) => {
                          const stats = folderStatsById.get(folder.id) ?? {
                            fileCount: 0,
                            knownBytes: 0,
                            unknownSizeCount: 0,
                          };
                          const sizeLabel =
                            stats.fileCount === 0
                              ? "—"
                              : stats.unknownSizeCount > 0
                                ? `${formatFileSize(stats.knownBytes)}+`
                                : formatFileSize(stats.knownBytes);
                          const fileCountLabel =
                            stats.fileCount === 0
                              ? messages.dataRoom.empty
                              : messages.dataRoom.fileCount(stats.fileCount);
                          const folderHref = buildFolderHref(folder.id);

                          return (
                            <Link
                              key={`mobile-folder-${folder.id}`}
                              href={folderHref}
                              prefetch
                              className="group flex min-h-16 items-center gap-3 rounded-lg border border-border/60 bg-background/25 p-3 transition-colors hover:border-primary/30 hover:bg-primary/[0.025] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none"
                              aria-label={`${messages.dataRoom.open} ${folder.name || messages.dataRoom.untitledFolder}`}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/8 text-primary">
                                <Folder className="h-4 w-4" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium wrap-break-word">
                                  {folder.name ||
                                    messages.dataRoom.untitledFolder}
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {fileCountLabel} · {sizeLabel}
                                </span>
                              </span>
                              <ChevronRight
                                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                                aria-hidden
                              />
                            </Link>
                          );
                        })}
                        {documentsInFolder.map((doc) => (
                          <Link
                            key={`mobile-doc-${doc.id}`}
                            href={`/r/${room.id}/${linkId}/${doc.id}`}
                            prefetch
                            className="group flex min-h-16 items-center gap-3 rounded-lg border border-border/60 bg-background/25 p-3 transition-colors hover:border-primary/30 hover:bg-primary/[0.025] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none"
                            aria-label={`${messages.dataRoom.open} ${doc.title || messages.dataRoom.untitledDocument}`}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/60 text-muted-foreground">
                              <FileText className="h-4 w-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium wrap-break-word">
                                {doc.title ||
                                  messages.dataRoom.untitledDocument}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {doc.file_type
                                  ? `${doc.file_type.toUpperCase()} · `
                                  : ""}
                                {formatFileSize(doc.size_bytes)}
                              </span>
                            </span>
                            <Eye
                              className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary motion-reduce:transition-none"
                              aria-hidden
                            />
                          </Link>
                        ))}
                      </div>

                      <div className="hidden md:block">
                        <Table>
                          <TableHeader className="bg-muted/20">
                            <TableRow>
                              <TableHead className="w-1/2 text-[11px] tracking-[0.08em] uppercase">
                                {messages.dataRoom.name}
                              </TableHead>
                              <TableHead className="text-left text-[11px] tracking-[0.08em] uppercase">
                                {messages.dataRoom.size}
                              </TableHead>
                              <TableHead className="text-right text-[11px] tracking-[0.08em] uppercase">
                                {messages.dataRoom.actions}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {childFolders.map((folder) => {
                              const stats = folderStatsById.get(folder.id) ?? {
                                fileCount: 0,
                                knownBytes: 0,
                                unknownSizeCount: 0,
                              };
                              const sizeLabel =
                                stats.fileCount === 0
                                  ? "—"
                                  : stats.unknownSizeCount > 0
                                    ? `${formatFileSize(stats.knownBytes)}+`
                                    : formatFileSize(stats.knownBytes);
                              const fileCountLabel =
                                stats.fileCount === 0
                                  ? messages.dataRoom.empty
                                  : messages.dataRoom.fileCount(
                                      stats.fileCount,
                                    );

                              const folderHref = buildFolderHref(folder.id);

                              return (
                                <TableRow
                                  key={`folder-${folder.id}`}
                                  className="transition-colors hover:bg-primary/[0.025] motion-reduce:transition-none"
                                >
                                  <TableCell className="max-w-md">
                                    <Link
                                      href={folderHref}
                                      prefetch
                                      className="flex w-full min-w-0 items-start gap-2 rounded-sm text-left transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none"
                                      aria-label={`${messages.dataRoom.open} ${folder.name || messages.dataRoom.untitledFolder}`}
                                    >
                                      <Folder
                                        className="h-4 w-4 shrink-0 text-muted-foreground"
                                        aria-hidden
                                      />
                                      <span className="flex min-w-0 flex-col">
                                        <span
                                          className="min-w-0 font-medium wrap-break-word whitespace-normal"
                                          title={
                                            folder.name ||
                                            messages.dataRoom.untitledFolder
                                          }
                                        >
                                          {folder.name ||
                                            messages.dataRoom.untitledFolder}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {fileCountLabel}
                                        </span>
                                      </span>
                                    </Link>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {sizeLabel}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Link
                                      href={folderHref}
                                      prefetch
                                      className={cn(
                                        buttonVariants({
                                          variant: "outline",
                                          size: "sm",
                                        }),
                                        "inline-flex items-center justify-center",
                                      )}
                                      aria-label={`${messages.dataRoom.open} ${folder.name || messages.dataRoom.untitledFolder}`}
                                    >
                                      <ChevronRight
                                        className="h-4 w-4"
                                        aria-hidden
                                      />
                                    </Link>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {documentsInFolder.map((doc) => (
                              <TableRow
                                key={`doc-${doc.id}`}
                                className="transition-colors hover:bg-primary/[0.025] motion-reduce:transition-none"
                              >
                                <TableCell className="max-w-md">
                                  <div className="flex items-start gap-2">
                                    <FileText
                                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                                      aria-hidden
                                    />
                                    <div className="min-w-0">
                                      <div
                                        className="font-medium wrap-break-word whitespace-normal"
                                        title={
                                          doc.title ||
                                          messages.dataRoom.untitledDocument
                                        }
                                      >
                                        {doc.title ||
                                          messages.dataRoom.untitledDocument}
                                      </div>
                                      {doc.file_type ? (
                                        <div className="mt-0.5 text-xs text-muted-foreground uppercase">
                                          {doc.file_type}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatFileSize(doc.size_bytes)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Link
                                    href={`/r/${room.id}/${linkId}/${doc.id}`}
                                    prefetch
                                    className={cn(
                                      buttonVariants({
                                        variant: "outline",
                                        size: "sm",
                                      }),
                                      "inline-flex items-center gap-1",
                                    )}
                                    aria-label={`${messages.dataRoom.open} ${doc.title || messages.dataRoom.untitledDocument}`}
                                  >
                                    <Eye className="h-3.5 w-3.5" aria-hidden />
                                    <span>{messages.dataRoom.open}</span>
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </SurfaceCard>
        </main>
      </ScreenshotShield>
    </div>
  );
};

export default PublicDataRoomViewerClient;
