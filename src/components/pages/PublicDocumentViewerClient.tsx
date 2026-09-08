"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ScreenLoader from "@/components/ui/screenLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicGateShell } from "@/components/public/PublicGateShell";
import ScreenshotShield from "@/components/public/ScreenshotShield";
import Viewer from "@/components/documents/Viewer";
import { canEnablePublicViewerComments } from "@/components/documents/viewerAsset";
import { TrackerResourceType } from "@/lib/analytics/publicTracker";
import { usePublicSubmissions } from "@/hooks/usePublicSubmissions";
import { usePublicViewerTracking } from "@/hooks/usePublicViewerTracking";
import { cn, extractFilenameFromContentDisposition } from "@/lib/utils";
import { z } from "zod";
import {
  usePublicResolve,
  type DocumentResolveResult,
} from "@/hooks/usePublicResolve";
import { generateNdaTemplate } from "@/modules/nda/template";
import PublicNdaGate, {
  createInitialOtpState,
  type NdaStep,
  type OtpState,
} from "@/components/public/PublicNdaGate";
import { createTypedNdaSignatureImage } from "@/components/public/ndaSignatureImage";
import { describeFileType, isVideoExtension } from "@/lib/fileTypes";
import { showInfo } from "@/lib/toast";
import { usePublicCommentsOverlay } from "@/modules/comments/components/usePublicCommentsOverlay";
import { getPublicMessages } from "@/modules/public-links/i18n";
import {
  DEFAULT_PUBLIC_LANGUAGE,
  normalizePublicLanguage,
  type PublicLanguage,
} from "@/modules/public-links/types";

interface Props {
  documentId: string;
  linkId: string;
  dataRoomId?: string;
}

const NDA_EMAIL_MAX_LENGTH = 254;
const ndaEmailSchema = z.string().email().max(NDA_EMAIL_MAX_LENGTH);

const getLocalizedDocumentResourceCopy = (
  language: PublicLanguage,
  fileType: string | null | undefined,
): { plainName: string; actionVerb: string } => {
  const { category } = describeFileType(fileType);

  if (language === "fr") {
    switch (category) {
      case "image":
        return { plainName: "cette image", actionVerb: "voir" };
      case "video":
        return { plainName: "cette vidéo", actionVerb: "voir" };
      case "audio":
        return { plainName: "cet audio", actionVerb: "écouter" };
      default:
        return { plainName: "ce document", actionVerb: "voir" };
    }
  }

  if (language === "es") {
    switch (category) {
      case "image":
        return { plainName: "esta imagen", actionVerb: "ver" };
      case "video":
        return { plainName: "este video", actionVerb: "ver" };
      case "audio":
        return { plainName: "este audio", actionVerb: "escuchar" };
      default:
        return { plainName: "este documento", actionVerb: "ver" };
    }
  }

  if (language === "de") {
    switch (category) {
      case "image":
        return { plainName: "dieses Bild", actionVerb: "ansehen" };
      case "video":
        return { plainName: "dieses Video", actionVerb: "ansehen" };
      case "audio":
        return { plainName: "diese Audiodatei", actionVerb: "anhören" };
      default:
        return { plainName: "dieses Dokument", actionVerb: "ansehen" };
    }
  }

  const { nounLower, actionVerb } = describeFileType(fileType);
  return { plainName: `this ${nounLower}`, actionVerb };
};

const PublicDocumentViewerClient: React.FC<Props> = ({
  documentId,
  linkId,
  dataRoomId,
}) => {
  // Generate or retrieve sessionId from sessionStorage for stable view tracking
  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return crypto.randomUUID();

    const key = `dk-session-${linkId}`;
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(key, sid);
    }
    return sid;
  }, [linkId]);
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
  const [linkMeta, setLinkMeta] = useState<{
    can_download: boolean;
    apply_watermark: boolean;
    dynamic_watermark_variables: boolean;
    email_verification: boolean;
    screenshot_protection: boolean;
    expires_at: string | null;
    show_qas: boolean;
    curated_qas: Array<{ question: string; answer: string }>;
    show_feedback?: boolean;
    email_notify?: boolean;
    comments_enabled?: boolean;
    nda_template_snapshot_html?: string | null;
  } | null>(null);
  const [ndaTemplateSnapshotHtml, setNdaTemplateSnapshotHtml] = useState<
    string | null
  >(null);
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [doc, setDoc] = useState<{
    id: string;
    title?: string | null;
    file_type?: string | null;
    num_pages?: number | null;
    workspace_id?: string | null;
    storage_path?: string | null;
    converted_storage_path?: string | null;
    conversion_status?: string | null;
  } | null>(null);
  const [brandingHeader, setBrandingHeader] = useState<{
    company_name: string | null;
    website_url: string | null;
    logo_signed_url: string | null;
    logo_data_url?: string | null;
    domain: string | null;
    domain_verified: boolean;
    show_powered_by: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingWatermarkedPdf, setDownloadingWatermarkedPdf] =
    useState<boolean>(false);
  const [resendCooldownSec, setResendCooldownSec] = useState<number>(0);
  const [ndaResendCooldownSec, setNdaResendCooldownSec] = useState<number>(0);
  const [commentsOtpOpen, setCommentsOtpOpen] = useState<boolean>(false);
  const [convertedAssetUnavailable, setConvertedAssetUnavailable] =
    useState(false);
  const [commentsOtp, setCommentsOtp] = useState<OtpState>(() =>
    createInitialOtpState(),
  );
  const [publicLanguage, setPublicLanguage] = useState<PublicLanguage>(
    DEFAULT_PUBLIC_LANGUAGE,
  );
  const pendingCommentActionRef = useRef<(() => Promise<void>) | null>(null);
  const clearNdaSignatureState = () => {
    setNdaDrawnSignature(null);
    setNdaTypedSignature(null);
    setNdaSignatureSource("typed");
    setNdaSignatureResetKey((key) => key + 1);
  };

  const trackingContext = useMemo(() => {
    if (!doc || !linkId) return null;
    return {
      sessionId,
      linkId,
      resourceId: doc.id,
      resourceType: TrackerResourceType.Document,
      workspaceId: workspaceId ?? undefined,
      documentId: doc.id,
    };
  }, [doc, linkId, sessionId, workspaceId]);
  const tracking = usePublicViewerTracking(trackingContext);
  const { trackView, trackDownload } = tracking;

  const docTitle = doc?.title?.trim() || null;
  const localizedResourceCopy = useMemo(
    () => getLocalizedDocumentResourceCopy(publicLanguage, doc?.file_type),
    [doc?.file_type, publicLanguage],
  );
  const resourceActionVerb = localizedResourceCopy.actionVerb;
  const resourceQuotedName = docTitle
    ? `"${docTitle}"`
    : localizedResourceCopy.plainName;
  const resourcePlainName = docTitle ?? localizedResourceCopy.plainName;

  const defaultBackToRoomHref = useMemo(() => {
    if (!dataRoomId) return null;
    return `/r/${dataRoomId}/${linkId}`;
  }, [dataRoomId, linkId]);

  const messages = useMemo(
    () => getPublicMessages(publicLanguage),
    [publicLanguage],
  );

  const [backToRoomHrefOverride, setBackToRoomHrefOverride] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!dataRoomId || !linkId) {
      setBackToRoomHrefOverride(null);
      return;
    }
    try {
      const key = `dk-public-room-last-folder-href:${dataRoomId}:${linkId}`;
      const stored = sessionStorage.getItem(key);
      const allowedPrefix = `/r/${dataRoomId}/${linkId}`;
      if (!stored || typeof stored !== "string") {
        setBackToRoomHrefOverride(null);
        return;
      }
      if (!stored.startsWith(allowedPrefix)) {
        setBackToRoomHrefOverride(null);
        return;
      }
      setBackToRoomHrefOverride(stored);
    } catch {
      setBackToRoomHrefOverride(null);
    }
  }, [dataRoomId, linkId]);

  const backToRoomHref = backToRoomHrefOverride ?? defaultBackToRoomHref;

  const roomTrackingContext = useMemo(() => {
    if (!dataRoomId || !doc?.id || !workspaceId || !sessionId) {
      return null;
    }
    return {
      sessionId,
      linkId,
      resourceId: dataRoomId,
      resourceType: TrackerResourceType.DataRoom,
      workspaceId,
      documentId: doc.id,
    };
  }, [dataRoomId, doc?.id, linkId, sessionId, workspaceId]);
  const roomTracking = usePublicViewerTracking(roomTrackingContext);
  const trackRoomView = roomTracking?.trackView;

  const handleDrawSignatureChange = (next: string | null) => {
    setNdaDrawnSignature(next);
    if (next) {
      setNdaSignatureSource("draw");
    } else if (ndaSignatureSource === "draw") {
      setNdaSignatureSource(ndaTypedSignature ? "typed" : null);
    }
  };

  // When full name changes, we should update the typed signature image if that was the source
  // Automatically update typed signature when name changes
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
    linkMeta?.nda_template_snapshot_html ?? ndaTemplateSnapshotHtml;
  const ndaTemplateBody = ndaTemplateHtml?.trim() ?? "";

  const ndaPreviewHtml = useMemo(() => {
    if (ndaStep !== "sign" || !ndaTemplateBody) {
      return null;
    }
    const referenceDate = ndaPreviewReferenceDate ?? new Date();
    const { previewHtml } = generateNdaTemplate({
      workspaceName: workspaceName || "The Workspace",
      documentTitle: doc?.title ?? "Document",
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
    doc?.title,
    ndaFullName,
    ndaOtp.email,
    resolvedNdaSignature,
    ndaTemplateBody,
  ]);
  const ndaTemplateMissing =
    ndaStep === "sign" && ndaEmailVerified && !ndaTemplateBody;

  const publicAccess = useMemo(
    () =>
      dataRoomId ? { linkId, documentId, dataRoomId } : { linkId, documentId },
    [linkId, documentId, dataRoomId],
  );
  const { submitFeedback } = usePublicSubmissions();
  const { resolve: rpcResolve } = usePublicResolve();

  // Memoize doc object to prevent unnecessary rerenders of Viewer
  const memoizedDoc = useMemo(() => {
    if (!doc) return null;
    return {
      id: doc.id,
      title: doc.title || "",
      file_type: (doc.file_type || "").toLowerCase(),
      size_bytes: 0,
      num_pages: null,
      storage_path: doc.storage_path || "",
      converted_storage_path: doc.converted_storage_path || null,
      conversion_status: doc.conversion_status,
    };
  }, [doc]);

  useEffect(() => {
    setConvertedAssetUnavailable(false);
  }, [doc?.conversion_status, doc?.converted_storage_path, doc?.id]);

  const commentsSupported = useMemo(
    () =>
      canEnablePublicViewerComments({
        fileType: doc?.file_type,
        convertedStoragePath: doc?.converted_storage_path,
        conversionStatus: doc?.conversion_status,
        convertedAssetFailed: convertedAssetUnavailable,
      }),
    [
      convertedAssetUnavailable,
      doc?.conversion_status,
      doc?.converted_storage_path,
      doc?.file_type,
    ],
  );

  const commentsEnabled =
    Boolean(linkMeta?.comments_enabled) && commentsSupported;

  const runPendingCommentAction = useCallback(async () => {
    const pending = pendingCommentActionRef.current;
    pendingCommentActionRef.current = null;
    if (!pending) return;
    await pending();
  }, []);

  const requestCommentsVerification = useCallback(
    (retry: () => Promise<void>) => {
      pendingCommentActionRef.current = retry;
      setCommentsOtpOpen(true);
      setCommentsOtp((prev) => ({
        ...createInitialOtpState(),
        email: verifiedEmail ?? prev.email,
      }));
    },
    [verifiedEmail],
  );

  const viewerShellRef = useRef<HTMLDivElement | null>(null);

  const commentsOverlay = usePublicCommentsOverlay({
    enabled: commentsEnabled,
    linkId,
    documentId: doc?.id ?? documentId,
    verifiedEmail,
    onRequireVerification: requestCommentsVerification,
    viewerRootRef: viewerShellRef,
    language: publicLanguage,
    messages: {
      commentActionFailed: messages.document.commentActionFailed,
      commentSelectionFailed: messages.document.commentSelectionFailed,
      addComment: messages.comments.addComment,
      threadTitle: messages.comments.threadTitle,
      commentPlaceholder: messages.comments.commentPlaceholder,
      replyPlaceholder: messages.comments.replyPlaceholder,
      submitComment: messages.comments.submitComment,
      sendReply: messages.comments.sendReply,
      loadingThread: messages.comments.loadingThread,
      unableToLoadThread: messages.comments.unableToLoadThread,
      closeComments: messages.comments.closeComments,
      resolve: messages.comments.resolve,
      reopen: messages.comments.reopen,
      resolved: messages.comments.resolved,
      viewThread: messages.comments.viewThread,
      hideThread: messages.comments.hideThread,
      deleteComment: messages.comments.deleteComment,
      deleted: messages.comments.deleted,
      resolvedDescription: messages.comments.resolvedDescription,
      openCommentThread: messages.comments.openCommentThread,
      you: messages.comments.you,
      viewer: messages.comments.viewer,
      retry: messages.common.tryAgain,
      close: messages.common.close,
    },
  });

  const resetOtpState = (
    setState: React.Dispatch<React.SetStateAction<OtpState>>,
    options: { clearEmail?: boolean } = {},
  ) => {
    setState((prev) => ({
      ...createInitialOtpState(),
      email: options.clearEmail ? "" : prev.email,
    }));
  };

  const sendOtp = useCallback(
    async (
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
            ...(dataRoomId
              ? { dataRoomId }
              : {
                  documentId,
                }),
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
    },
    [
      dataRoomId,
      documentId,
      linkId,
      messages.common.emailRequired,
      messages.common.failedToSendCode,
    ],
  );

  useEffect(() => {
    if (resendCooldownSec <= 0) return;
    const t = setInterval(() => {
      setResendCooldownSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldownSec]);

  useEffect(() => {
    if (ndaResendCooldownSec <= 0) return;
    const t = setInterval(() => {
      setNdaResendCooldownSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [ndaResendCooldownSec]);

  const verifyOtp = useCallback(
    async (
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
            ...(dataRoomId
              ? { dataRoomId }
              : {
                  documentId,
                }),
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
          err instanceof Error
            ? err.message
            : messages.common.verificationFailed;
        setState((prev) => ({
          ...prev,
          verifying: false,
          error: message,
        }));
        return false;
      }
    },
    [
      dataRoomId,
      documentId,
      linkId,
      messages.common.emailRequired,
      messages.common.enterVerificationCode,
      messages.common.verificationFailed,
    ],
  );

  const fetchNdaStatus = useCallback(async () => {
    const res = await fetch("/api/public/links/nda/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(
        dataRoomId ? { linkId, dataRoomId } : { linkId, documentId },
      ),
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
  }, [dataRoomId, documentId, linkId, messages.common.unableToVerifyNdaStatus]);

  useEffect(() => {
    if (error !== "EMAIL_OTP_REQUIRED") {
      setEmailOtp(createInitialOtpState());
    }
  }, [error]);

  // Watermark overlay is no longer rendered client-side for public viewers.
  // The server-side file route (/api/public/links/file) embeds the watermark
  // directly into the PDF when apply_watermark=true, preventing double
  // watermarks from appearing.

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

  // Resolve link and apply gates
  const resolve = useCallback(
    async (override?: { password?: string }) => {
      setLoading(true);
      setError(null);
      setPasswordError(null);
      let resolved: DocumentResolveResult | null = null;
      try {
        resolved = (await rpcResolve({
          documentId,
          dataRoomId,
          linkId,
          // Important: do NOT automatically re-resolve on every keystroke while
          // a viewer is typing a password. Only submit a password explicitly.
          password: override?.password || undefined,
        })) as DocumentResolveResult;
        setPublicLanguage(
          normalizePublicLanguage(
            resolved.public_language ?? resolved.link.public_language,
          ),
        );
        setLinkMeta(resolved.link);
        setWorkspaceName(resolved.workspace_name);
        setWorkspaceId(resolved.workspace_id);
        setVerifiedEmail(resolved.verified_email);
        setBrandingHeader(resolved.branding_header ?? null);
        setDoc({
          id: resolved.document.id,
          title: resolved.document.title || undefined,
          file_type: resolved.document.file_type || undefined,
          storage_path: resolved.document.storage_path || undefined,
          converted_storage_path:
            resolved.document.converted_storage_path || undefined,
          conversion_status: resolved.document.conversion_status,
        });
      } catch (e) {
        const resolveError = e as {
          workspaceName?: string;
          workspaceId?: string;
          verifiedEmail?: string | null;
          ndaTemplateSnapshotHtml?: string | null;
          publicLanguage?: string;
        };
        if (typeof resolveError.publicLanguage === "string") {
          setPublicLanguage(
            normalizePublicLanguage(resolveError.publicLanguage),
          );
        }
        const message =
          e instanceof Error ? e.message : messages.common.unableToOpenLink;

        if (message === "BAD_PASSWORD") {
          setPasswordError(messages.common.incorrectPassword);
        } else if (message === "PASSWORD_REQUIRED") {
          setPasswordError(null);
        } else if (
          message === "NDA_SIGN_REQUIRED" ||
          message === "NDA_PDF_PENDING"
        ) {
          if (typeof resolveError.workspaceName === "string") {
            setWorkspaceName(resolveError.workspaceName);
          }
          if (typeof resolveError.workspaceId === "string") {
            setWorkspaceId(resolveError.workspaceId);
          }
          if ("verifiedEmail" in resolveError) {
            setVerifiedEmail(resolveError.verifiedEmail ?? null);
          }
          if ("ndaTemplateSnapshotHtml" in resolveError) {
            setNdaTemplateSnapshotHtml(
              resolveError.ndaTemplateSnapshotHtml ?? null,
            );
          }
        }
        setError(message);
        setLoading(false);
        return;
      }
      setLoading(false);
      if (!resolved) {
        return;
      }
      setWorkspaceName(resolved.workspace_name);
      setWorkspaceId(resolved.workspace_id);
      setBrandingHeader(resolved.branding_header);
    },
    [
      dataRoomId,
      documentId,
      linkId,
      messages.common.incorrectPassword,
      messages.common.unableToOpenLink,
      rpcResolve,
    ],
  );

  // Keep a stable ref so callbacks that need `resolve` don't re-create on
  // every render and cause infinite effect chains (fixes DOCKOSHA-26).
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  const handleSendCommentsOtp = useCallback(async () => {
    const ok = await sendOtp(commentsOtp.email, setCommentsOtp);
    if (ok) {
      setResendCooldownSec(30);
    }
  }, [commentsOtp.email, sendOtp]);

  const handleVerifyCommentsOtp = useCallback(async () => {
    await verifyOtp(commentsOtp, setCommentsOtp, async () => {
      setCommentsOtpOpen(false);
      await resolve();
      await runPendingCommentAction();
    });
  }, [commentsOtp, resolve, runPendingCommentAction, verifyOtp]);

  useEffect(() => {
    if (commentsEnabled) return;
    setCommentsOtpOpen(false);
    pendingCommentActionRef.current = null;
  }, [commentsEnabled]);

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
        await resolveRef.current();
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

  useEffect(() => {
    void resolve();
  }, [resolve]);

  useEffect(() => {
    if (error !== "NDA_PDF_PENDING") return;
    setNdaEmailVerified(true);
    setNdaStep("processing");

    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (attempts > 40) {
        clearInterval(interval);
        return;
      }
      void checkNdaPdfReady();
    }, 3000);

    return () => clearInterval(interval);
  }, [checkNdaPdfReady, error]);

  const shouldNotifyView = Boolean(linkMeta?.email_notify && !dataRoomId);

  useEffect(() => {
    if (!trackingContext || !trackView) return;
    let cancelled = false;
    let removeVisibilityListener: (() => void) | undefined;

    const runTracking = () => {
      if (cancelled) return;
      const promise = trackView();
      if (promise) {
        promise
          .then((result) => {
            if (
              !shouldNotifyView ||
              !result?.isUniqueView ||
              !result.notificationViewToken
            ) {
              return;
            }
            void fetch("/api/public/links/notify-view", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                linkId,
                documentId,
                viewToken: result.notificationViewToken,
              }),
            });
          })
          .catch((err) => {
            console.error("[Analytics] Failed to record view", err);
          });
      }
      if (roomTrackingContext && trackRoomView) {
        const roomPromise = trackRoomView();
        if (roomPromise) {
          roomPromise.catch((err) => {
            console.error("[Analytics] Failed to record data room view", err);
          });
        }
      }
    };

    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      const handleVisibility = () => {
        if (document.visibilityState !== "visible") {
          return;
        }
        document.removeEventListener("visibilitychange", handleVisibility);
        removeVisibilityListener = undefined;
        runTracking();
      };
      document.addEventListener("visibilitychange", handleVisibility);
      removeVisibilityListener = () => {
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    } else {
      runTracking();
    }

    return () => {
      cancelled = true;
      if (removeVisibilityListener) {
        removeVisibilityListener();
      }
    };
  }, [
    documentId,
    linkId,
    roomTrackingContext,
    shouldNotifyView,
    trackRoomView,
    trackView,
    trackingContext,
  ]);

  const handleDownload = useCallback(async () => {
    const targetDocumentId = doc?.id ?? documentId;
    if (!targetDocumentId) {
      return;
    }
    setDownloadingWatermarkedPdf(true);
    try {
      const variant: "original" | "converted" = linkMeta?.apply_watermark
        ? "converted"
        : "original";
      const payload: {
        linkId: string;
        documentId: string;
        dataRoomId?: string;
        variant: "original" | "converted";
      } = {
        linkId,
        documentId: targetDocumentId,
        variant,
      };
      if (dataRoomId) {
        payload.dataRoomId = dataRoomId;
      }
      // Use same-origin so CORS doesn't require Access-Control-Allow-Credentials
      // when the server redirects to R2 (cross-origin) for direct delivery
      const res = await fetch("/api/public/links/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          (typeof data?.error === "string" && data.error) ||
          messages.document.unableToDownload;
        showInfo(message);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const headerFileName = extractFilenameFromContentDisposition(
        res.headers.get("content-disposition"),
      );
      const fallbackName =
        doc?.title?.trim() ||
        (variant === "converted" ? "document.pdf" : "document");
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = headerFileName || fallbackName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
      if (trackDownload) {
        void trackDownload();
      }
    } catch (downloadError) {
      console.error("[public-viewer] download failed", downloadError);
      showInfo(messages.document.unableToDownload);
    } finally {
      setDownloadingWatermarkedPdf(false);
    }
  }, [
    dataRoomId,
    doc?.id,
    doc?.title,
    documentId,
    linkId,
    linkMeta?.apply_watermark,
    trackDownload,
    messages.document.unableToDownload,
  ]);

  const handlePrint = useCallback(async () => {
    if (!linkMeta?.can_download) return;
    const targetDocumentId = doc?.id ?? documentId;
    if (!targetDocumentId) {
      return;
    }
    try {
      const payload: {
        linkId: string;
        documentId: string;
        dataRoomId?: string;
        variant: "converted";
      } = {
        linkId,
        documentId: targetDocumentId,
        variant: "converted",
      };
      if (dataRoomId) {
        payload.dataRoomId = dataRoomId;
      }
      const res = await fetch("/api/public/links/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          (typeof data?.error === "string" && data.error) ||
          messages.document.unableToPrint;
        showInfo(message);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const printWindow = window.open(
        objectUrl,
        "_blank",
        "noopener,noreferrer",
      );
      if (!printWindow) {
        URL.revokeObjectURL(objectUrl);
        showInfo(messages.document.allowPopupsToPrint);
        return;
      }
      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
      };
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      printWindow.addEventListener("beforeunload", cleanup, { once: true });
      printWindow.addEventListener(
        "load",
        () => {
          printWindow.focus();
          printWindow.print();
        },
        { once: true },
      );
    } catch (printError) {
      console.error("[public-viewer] print failed", printError);
      showInfo(messages.document.unableToPrint);
    }
  }, [
    dataRoomId,
    doc?.id,
    documentId,
    linkId,
    linkMeta?.can_download,
    messages.document.allowPopupsToPrint,
    messages.document.unableToPrint,
  ]);

  const handleViewerShellWheel = useCallback((event: React.WheelEvent) => {
    const root = viewerShellRef.current;
    if (!root) return;

    const innerPages = root.querySelector(
      ".dk-pdf-scroll",
    ) as HTMLElement | null;
    if (!innerPages) return;

    const target = event.target as HTMLElement | null;
    if (target) {
      if (innerPages.contains(target)) return;
      if (target.closest(".dk-pdf-sidebar")) return;
    }

    innerPages.scrollBy({
      top: event.deltaY,
      left: event.deltaX,
      behavior: "auto",
    });
    event.preventDefault();
  }, []);

  const onRetry = useCallback(async () => {
    await resolve();
  }, [resolve]);
  const handleConvertedAssetUnavailable = useCallback(() => {
    setConvertedAssetUnavailable(true);
  }, []);

  const resolveErrorCopy = (code: string) =>
    messages.document.documentResolveError(code);

  const buildClearSessionUrl = useCallback(() => {
    const returnPath = dataRoomId
      ? `/d/${documentId}/${linkId}?dataRoomId=${encodeURIComponent(dataRoomId)}`
      : `/d/${documentId}/${linkId}`;
    const params = new URLSearchParams({
      linkId,
      resourceType: "document",
      resourceId: documentId,
      returnUrl: returnPath,
    });
    return `/api/public/links/clear-session?${params.toString()}`;
  }, [documentId, linkId, dataRoomId]);

  const renderErrorCard = (code: string) => (
    <PublicGateShell
      title={messages.common.linkUnavailable}
      description={`${resolveErrorCopy(code)} ${messages.common.contactSenderForHelp}`}
    >
      <div className="mt-3 flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void resolve()}
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

  // NDA flow
  if (error === "NDA_SIGN_REQUIRED" || error === "NDA_PDF_PENDING") {
    const handleChangeNdaEmail = (options: { clearEmail?: boolean } = {}) => {
      resetOtpState(setNdaOtp, options);
      setNdaEmailVerified(false);
      clearNdaSignatureState();
      setNdaSignError(null);
    };

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
          await resolve();
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
            ...(dataRoomId ? { dataRoomId } : { documentId }),
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
        await resolve();
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

    return (
      <PublicNdaGate
        step={ndaStep}
        introDescription={introDescription}
        onContinueFromIntro={async () => {
          // If we already have a verified email (e.g., from allowlist/email gate),
          // skip the extra OTP step and proceed directly to NDA status/signing.
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
                await resolve();
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
  }

  if (error === "EMAIL_OTP_REQUIRED") {
    return (
      <PublicGateShell
        title={messages.document.emailVerificationRequired}
        description={messages.document.verifyEmailToAccess(
          resourceActionVerb,
          resourcePlainName,
        )}
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
                    await resolve();
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
  }

  // Password gate
  if (error === "BAD_PASSWORD" || error === "PASSWORD_REQUIRED") {
    return (
      <PublicGateShell
        title={messages.document.passwordProtectedLink}
        description={messages.document.protectedDescription(
          resourceActionVerb,
          resourcePlainName,
        )}
        error={passwordError}
      >
        <Input
          placeholder={messages.document.enterPasswordPlaceholder}
          type="password"
          aria-label="Access password"
          value={gatePassword}
          onChange={(e) => {
            setGatePassword(e.target.value);
            setPasswordError(null);
          }}
          onKeyDown={(e) => {
            const trimmed = gatePassword.trim();
            if (e.key === "Enter" && trimmed && !passwordSubmitting) {
              void (async () => {
                setPasswordSubmitting(true);
                await resolve({ password: trimmed });
                setPasswordSubmitting(false);
              })();
            }
          }}
        />
        <Button
          type="button"
          className="w-full"
          disabled={passwordSubmitting || !gatePassword.trim()}
          onClick={async () => {
            const trimmed = gatePassword.trim();
            if (!trimmed) return;
            if (trimmed !== gatePassword) {
              setGatePassword(trimmed);
            }
            setPasswordSubmitting(true);
            await resolve({ password: trimmed });
            setPasswordSubmitting(false);
          }}
        >
          {passwordSubmitting
            ? messages.common.checking
            : messages.document.unlock}
        </Button>
      </PublicGateShell>
    );
  }

  if (
    error &&
    error !== "BAD_PASSWORD" &&
    error !== "PASSWORD_REQUIRED" &&
    error !== "EMAIL_OTP_REQUIRED" &&
    error !== "NDA_SIGN_REQUIRED"
  ) {
    return renderErrorCard(error);
  }

  if (loading || !doc || !linkMeta) {
    return <ScreenLoader />;
  }

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
      doc.title ||
      messages.document.sharedDocumentFallback
    : null;
  const providerWebsiteUrl = showBrandIdentity
    ? (brandingHeader?.website_url ?? null)
    : null;
  const usesContentHeightCanvas = isVideoExtension(doc.file_type ?? "");

  return (
    <div
      translate="no"
      className={cn(
        "notranslate no-scrollbar flex min-h-dvh flex-col bg-background",
        usesContentHeightCanvas
          ? "h-auto overflow-y-auto"
          : "h-dvh overflow-hidden",
      )}
      style={{
        WebkitPrintColorAdjust: linkMeta?.screenshot_protection
          ? "exact"
          : undefined,
        printColorAdjust: linkMeta?.screenshot_protection ? "exact" : undefined,
      }}
    >
      <PublicHeader
        branding={{
          companyName: providerName,
          logoUrl: brandLogoUrl,
          websiteUrl: providerWebsiteUrl,
          domain: brandingHeader?.domain ?? null,
          domainVerified: brandingHeader?.domain_verified,
          showPoweredBy: brandingHeader?.show_powered_by,
        }}
        title={doc.title || undefined}
        backToRoomHref={backToRoomHref}
        actions={{
          showFeedback: linkMeta?.show_feedback,
          showQnA: linkMeta?.show_qas,
          showComments: commentsOverlay.headerActions.showComments,
          commentsOpen: commentsOverlay.headerActions.commentsOpen,
          onToggleComments: commentsOverlay.headerActions.onToggleComments,
          canDownload: linkMeta?.can_download,
          downloading: downloadingWatermarkedPdf,
          onDownload: handleDownload,
          onFeedbackSubmit: async (text) => {
            await submitFeedback({
              linkId,
              resourceId: documentId,
              resourceType: TrackerResourceType.Document,
              workspaceId: workspaceId ?? undefined,
              submission: {
                message: text.trim(),
                email: verifiedEmail,
              },
            });
          },
          curatedQas: linkMeta?.curated_qas,
        }}
        labels={messages.header}
        className="shrink-0"
      />

      <ScreenshotShield
        enabled={Boolean(linkMeta?.screenshot_protection)}
        className={cn(
          "flex min-h-0 flex-col",
          usesContentHeightCanvas ? "flex-none" : "flex-1",
        )}
      >
        <div
          ref={viewerShellRef}
          data-ph-no-capture
          className={cn(
            "dk-document-viewer ph-no-capture relative min-h-0 w-full bg-background p-0",
            usesContentHeightCanvas
              ? "flex-none overflow-visible"
              : "flex-1 overflow-hidden",
          )}
          onWheel={handleViewerShellWheel}
        >
          <div
            className={cn(
              "mx-auto w-full max-w-6xl px-2 sm:px-3 lg:px-0",
              usesContentHeightCanvas ? "h-auto" : "h-full",
            )}
          >
            <Viewer
              doc={memoizedDoc}
              accessMode="public"
              onRefreshStatus={onRetry}
              onConvertedAssetUnavailable={handleConvertedAssetUnavailable}
              className={
                usesContentHeightCanvas
                  ? "h-auto min-h-0 w-full"
                  : "h-full min-h-0 w-full"
              }
              allowDownload={!!linkMeta?.can_download}
              pdfUi="full"
              onDownload={handleDownload}
              onPrint={handlePrint}
              publicAccess={publicAccess}
              watermarkOverlay={null}
              publicTracking={tracking}
              pdfOverlays={commentsOverlay.pdfOverlays}
              watermarkRequired={Boolean(linkMeta?.apply_watermark)}
            />
          </div>

          {commentsOverlay.panel}
        </div>
      </ScreenshotShield>

      <Dialog open={commentsOtpOpen} onOpenChange={setCommentsOtpOpen}>
        <DialogContent
          className="ph-no-capture dk-nocturne-overlay rounded-[14px]"
          data-ph-no-capture
        >
          <DialogHeader>
            <DialogTitle>
              {messages.document.verifyEmailToCommentTitle}
            </DialogTitle>
            <DialogDescription>
              {messages.document.verifyEmailToCommentDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder={messages.document.commentEmailPlaceholder}
              type="email"
              aria-label="Comment verification email"
              spellCheck={false}
              autoComplete="email"
              value={commentsOtp.email}
              disabled={
                commentsOtp.stage !== "input" ||
                commentsOtp.sending ||
                commentsOtp.verifying
              }
              onChange={(event) =>
                setCommentsOtp((prev) => ({
                  ...prev,
                  email: event.target.value,
                  error: null,
                }))
              }
            />

            {commentsOtp.stage === "code" ? (
              <Input
                placeholder={messages.document.commentCodePlaceholder}
                inputMode="numeric"
                aria-label="Comment verification code"
                autoComplete="one-time-code"
                value={commentsOtp.code}
                disabled={commentsOtp.verifying}
                onChange={(event) =>
                  setCommentsOtp((prev) => ({
                    ...prev,
                    code: event.target.value,
                    error: null,
                  }))
                }
              />
            ) : null}

            {commentsOtp.error ? (
              <p className="text-sm text-destructive">{commentsOtp.error}</p>
            ) : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {commentsOtp.stage === "code" ? (
              <Button
                type="button"
                variant="outline"
                disabled={resendCooldownSec > 0 || commentsOtp.sending}
                onClick={() => void handleSendCommentsOtp()}
              >
                {resendCooldownSec > 0
                  ? messages.common.resendIn(resendCooldownSec)
                  : messages.common.resendCode}
              </Button>
            ) : (
              <span />
            )}

            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCommentsOtpOpen(false);
                  pendingCommentActionRef.current = null;
                }}
              >
                {messages.common.cancel}
              </Button>
              {commentsOtp.stage === "code" ? (
                <Button
                  type="button"
                  onClick={() => void handleVerifyCommentsOtp()}
                  disabled={!commentsOtp.code.trim() || commentsOtp.verifying}
                >
                  {commentsOtp.verifying
                    ? messages.common.verifying
                    : messages.common.verify}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleSendCommentsOtp()}
                  disabled={!commentsOtp.email.trim() || commentsOtp.sending}
                >
                  {commentsOtp.sending
                    ? messages.common.sending
                    : messages.document.sendCommentCode}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicDocumentViewerClient;
