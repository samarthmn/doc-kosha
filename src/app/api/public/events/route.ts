import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  signCookie,
  verifyCookie,
  verifyVerifiedEmailCookie,
} from "@/server/cookieHelper";
import { getOrCreateAnonymousUserId } from "@/server/analyticsCookieHelper";
import { resolveCountryFromHeaders } from "@/modules/advanced-analytics/server/requestMetadata";
import { PublicSubmissionKind } from "@/lib/analytics/publicSubmissions";
import {
  getAccessCookieKey,
  getEmailCookieKey,
  getVersionCookieKey,
  type AccessCookiePayload,
  type PublicResourceType,
} from "@/server/cookieConstants";
import { ResourceType as ResourceTypeSchema } from "@/lib/validators/events";
import type { Database, Json } from "@/types/generated/supabase";
import {
  TrackerEvent,
  TrackerResourceType,
} from "@/lib/analytics/publicTracker";
import {
  fetchLinkAllowlistStatus,
  normalizeViewerEmail,
} from "@/server/linkAllowlist";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { isProbablyBot } from "@/server/analyticsBotFilter";
import { getPublicLinkAvailabilityError } from "@/server/publicLinkAvailability";
import { createViewNotificationToken } from "@/server/viewNotification";
import {
  publicFeedbackSubmissionSchema,
  publicQAAnswerSchema,
  publicQAQuestionSchema,
  sanitizePublicFeedbackSubmission,
} from "@/lib/validators/publicSubmissions";
import {
  requiresVerifiedViewerEmail,
  shouldPersistViewerEmail,
} from "@/lib/publicLinkEmailPolicy";
import { isLinkAlcActive } from "@/server/linkAlc";

type ResourceType = z.infer<typeof ResourceTypeSchema>;

const EventSchema = z.object({
  kind: z.literal(PublicSubmissionKind.Event),
  linkId: z.string().uuid(),
  resourceId: z.string().uuid(),
  resourceType: ResourceTypeSchema.default(TrackerResourceType.Document),
  workspaceId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional().nullable(),
  event: z.enum([
    TrackerEvent.View,
    TrackerEvent.Download,
    TrackerEvent.PageView,
    TrackerEvent.SectionTime,
  ]),
  sessionId: z.string().optional().nullable(),
  pageNumber: z.number().optional().nullable(),
  sectionOffset: z.number().optional().nullable(),
  durationMs: z.number().optional().nullable(),
});

const EventSchemaValidated = EventSchema.superRefine((value, ctx) => {
  const ensureInt = (input: unknown): number | null => {
    if (typeof input !== "number") return null;
    if (!Number.isFinite(input)) return null;
    if (!Number.isInteger(input)) return null;
    return input;
  };

  if (value.event === TrackerEvent.PageView) {
    const pageNumber = ensureInt(value.pageNumber);
    if (pageNumber === null || pageNumber < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pageNumber"],
        message: "pageNumber must be an integer >= 1 for page_view events",
      });
    }
    const durationMs = ensureInt(value.durationMs);
    if (durationMs === null || durationMs < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationMs"],
        message: "durationMs must be an integer >= 0 for page_view events",
      });
    }
  }

  if (value.event === TrackerEvent.SectionTime) {
    const sectionOffset = ensureInt(value.sectionOffset);
    if (sectionOffset === null || sectionOffset < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectionOffset"],
        message:
          "sectionOffset must be an integer >= 0 for section_time events",
      });
    }
    const durationMs = ensureInt(value.durationMs);
    if (durationMs === null || durationMs < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationMs"],
        message: "durationMs must be an integer >= 0 for section_time events",
      });
    }
  }
});

const FeedbackSchema = z.object({
  kind: z.literal(PublicSubmissionKind.Feedback),
  linkId: z.string().uuid(),
  resourceId: z.string().uuid(),
  resourceType: ResourceTypeSchema.default(TrackerResourceType.Document),
  workspaceId: z.string().uuid().optional(),
  submission: publicFeedbackSubmissionSchema,
});

const QASchema = z.object({
  kind: z.literal(PublicSubmissionKind.Qa),
  linkId: z.string().uuid(),
  resourceId: z.string().uuid(),
  resourceType: ResourceTypeSchema.default(TrackerResourceType.Document),
  workspaceId: z.string().uuid().optional(),
  question: publicQAQuestionSchema,
  answer: publicQAAnswerSchema.optional().nullable(),
});

const RequestSchema = z.discriminatedUnion("kind", [
  EventSchemaValidated,
  FeedbackSchema,
  QASchema,
]);

type RequestPayload = z.infer<typeof RequestSchema>;

interface AccessContext {
  workspaceId: string;
  verifiedEmail: string | null;
  collectEmailForAnalytics: boolean;
  documentFileType?: string | null;
  documentStoragePath?: string | null;
}

const toJson = (value: unknown): Json => {
  try {
    const jsonString = JSON.stringify(value);
    if (jsonString === undefined) {
      return null;
    }
    return JSON.parse(jsonString) as Json;
  } catch {
    return null;
  }
};

type AccessError = {
  status: number;
  code: string;
  message: string;
};

type AccessResult = { context: AccessContext } | { error: AccessError };

const accessError = (
  status: number,
  code: string,
  message: string,
): { error: AccessError } =>
  ({
    error: {
      status,
      code,
      message,
    },
  }) as const;

const supabaseService = () => createSupabaseServiceClient();

const cookieValid = (
  cookieValue: string | undefined,
  resourceType: ResourceType,
  resourceId: string,
  linkId: string,
) => {
  const accessPayload = cookieValue
    ? verifyCookie<AccessCookiePayload>(cookieValue)
    : null;
  if (
    !accessPayload ||
    accessPayload.resourceId !== resourceId ||
    accessPayload.resourceType !== resourceType ||
    accessPayload.linkId !== linkId ||
    (typeof accessPayload.exp === "number" && accessPayload.exp < Date.now())
  ) {
    return false;
  }
  return true;
};

const readVerifiedEmail = (
  req: NextRequest,
  resourceType: PublicResourceType,
  resourceId: string,
  linkId: string,
): string | null => {
  const emailCookieName = getEmailCookieKey(resourceType, resourceId, linkId);
  const emailCookieValue = req.cookies.get(emailCookieName)?.value;
  const emailPayload = emailCookieValue
    ? verifyVerifiedEmailCookie(emailCookieValue, {
        resourceType,
        resourceId,
        linkId,
      })
    : null;
  if (!emailPayload?.email) {
    return null;
  }
  return normalizeViewerEmail(emailPayload.email);
};

async function ensureDocumentAccess(
  req: NextRequest,
  linkId: string,
  resourceId: string,
): Promise<AccessResult> {
  const supabase = supabaseService();
  const { data: link } = await supabase
    .from("links")
    .select(
      "id, document_id, data_room_id, workspace_id, email_verification, nda_gate, collect_email_for_analytics, apply_watermark, dynamic_watermark_email, open_once, revoked_at, expires_at",
    )
    .eq("id", linkId)
    .maybeSingle();

  if (!link) {
    return accessError(404, "LINK_NOT_FOUND", "Link not found");
  }

  const availabilityError = getPublicLinkAvailabilityError(link);
  if (availabilityError) {
    return accessError(
      availabilityError.status,
      availabilityError.code,
      availabilityError.error,
    );
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, workspace_id, data_room_id, file_type, storage_path")
    .eq("id", resourceId)
    .maybeSingle();

  if (!doc) {
    return accessError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  }

  const isDocumentLink = link.document_id === resourceId;
  const matchesDataRoomLink =
    Boolean(link.data_room_id) && link.data_room_id === doc.data_room_id;

  if (!isDocumentLink && !matchesDataRoomLink) {
    return accessError(404, "LINK_NOT_FOUND", "Link not found");
  }

  const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
  if (!hasEntitlement) {
    return accessError(404, "LINK_NOT_FOUND", "Link not found");
  }

  const accessCookieName = getAccessCookieKey(
    TrackerResourceType.Document,
    resourceId,
    linkId,
  );
  const accessCookieValue = req.cookies.get(accessCookieName)?.value;
  if (
    !cookieValid(
      accessCookieValue,
      TrackerResourceType.Document,
      resourceId,
      linkId,
    )
  ) {
    return accessError(
      401,
      "ACCESS_CONFIRMATION_REQUIRED",
      "Access confirmation required",
    );
  }

  const isDataRoomLinkContext =
    Boolean(link.data_room_id) &&
    Boolean(doc.data_room_id) &&
    link.data_room_id === doc.data_room_id;
  const documentScopeEmail = readVerifiedEmail(
    req,
    TrackerResourceType.Document,
    resourceId,
    linkId,
  );
  const dataRoomScopeEmail =
    isDataRoomLinkContext && link.data_room_id
      ? readVerifiedEmail(
          req,
          TrackerResourceType.DataRoom,
          link.data_room_id,
          linkId,
        )
      : null;
  const resolvedEmail = documentScopeEmail ?? dataRoomScopeEmail ?? null;
  const allowlistStatus = await fetchLinkAllowlistStatus(
    supabase,
    link.id,
    resolvedEmail,
  );
  const alcActive =
    isDataRoomLinkContext && (await isLinkAlcActive(supabase, link.id));
  const requiresVerifiedEmail = requiresVerifiedViewerEmail({
    emailVerification: link.email_verification,
    ndaGate: link.nda_gate,
    collectEmailForAnalytics: link.collect_email_for_analytics,
    dynamicWatermarkEmail: link.apply_watermark && link.dynamic_watermark_email,
    allowlistActive: allowlistStatus.isActive || alcActive,
  });
  const verifiedEmail =
    allowlistStatus.normalizedEmail ?? resolvedEmail ?? null;

  if (requiresVerifiedEmail && !verifiedEmail) {
    return accessError(
      401,
      "EMAIL_VERIFICATION_REQUIRED",
      "Email verification required",
    );
  }
  if (allowlistStatus.isActive && allowlistStatus.emailAllowed === false) {
    return accessError(
      403,
      "EMAIL_NOT_ALLOWED",
      "Email not allowed for this link",
    );
  }
  if (link.nda_gate && verifiedEmail) {
    const { data: signature } = await supabase
      .from("nda_signatures")
      .select("id")
      .eq("link_id", link.id)
      .eq("email", verifiedEmail)
      .maybeSingle();
    if (!signature) {
      return accessError(
        403,
        "NDA_SIGNATURE_REQUIRED",
        "NDA signature required",
      );
    }
  }

  const collectEmailForAnalytics = shouldPersistViewerEmail({
    collectEmailForAnalytics: Boolean(link.collect_email_for_analytics),
    verifiedEmail,
  });

  return {
    context: {
      workspaceId: doc.workspace_id,
      verifiedEmail,
      collectEmailForAnalytics,
      documentFileType: doc.file_type,
      documentStoragePath: doc.storage_path,
    },
  } as const;
}

async function ensureDataRoomAccess(
  req: NextRequest,
  linkId: string,
  resourceId: string,
): Promise<AccessResult> {
  const supabase = supabaseService();
  const { data: link } = await supabase
    .from("links")
    .select(
      "id, data_room_id, workspace_id, email_verification, nda_gate, collect_email_for_analytics, apply_watermark, dynamic_watermark_email, open_once, revoked_at, expires_at",
    )
    .eq("id", linkId)
    .eq("data_room_id", resourceId)
    .maybeSingle();

  if (!link) {
    return accessError(404, "LINK_NOT_FOUND", "Link not found");
  }

  const availabilityError = getPublicLinkAvailabilityError(link);
  if (availabilityError) {
    return accessError(
      availabilityError.status,
      availabilityError.code,
      availabilityError.error,
    );
  }

  const { data: dataRoom } = await supabase
    .from("data_rooms")
    .select("id, workspace_id")
    .eq("id", resourceId)
    .maybeSingle();

  if (!dataRoom) {
    return accessError(404, "DATA_ROOM_NOT_FOUND", "Data room not found");
  }

  const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
  if (!hasEntitlement) {
    return accessError(404, "LINK_NOT_FOUND", "Link not found");
  }

  const accessCookieName = getAccessCookieKey(
    TrackerResourceType.DataRoom,
    resourceId,
    linkId,
  );
  const accessCookieValue = req.cookies.get(accessCookieName)?.value;
  if (
    !cookieValid(
      accessCookieValue,
      TrackerResourceType.DataRoom,
      resourceId,
      linkId,
    )
  ) {
    return accessError(
      401,
      "ACCESS_CONFIRMATION_REQUIRED",
      "Access confirmation required",
    );
  }

  const scopedEmail = readVerifiedEmail(
    req,
    TrackerResourceType.DataRoom,
    resourceId,
    linkId,
  );
  const allowlistStatus = await fetchLinkAllowlistStatus(
    supabase,
    link.id,
    scopedEmail,
  );
  const alcActive = await isLinkAlcActive(supabase, link.id);
  const requiresVerifiedEmail = requiresVerifiedViewerEmail({
    emailVerification: link.email_verification,
    ndaGate: link.nda_gate,
    collectEmailForAnalytics: link.collect_email_for_analytics,
    dynamicWatermarkEmail: link.apply_watermark && link.dynamic_watermark_email,
    allowlistActive: allowlistStatus.isActive || alcActive,
  });
  const verifiedEmail = allowlistStatus.normalizedEmail ?? scopedEmail ?? null;
  if (requiresVerifiedEmail && !verifiedEmail) {
    return accessError(
      401,
      "EMAIL_VERIFICATION_REQUIRED",
      "Email verification required",
    );
  }
  if (allowlistStatus.isActive && allowlistStatus.emailAllowed === false) {
    return accessError(
      403,
      "EMAIL_NOT_ALLOWED",
      "Email not allowed for this link",
    );
  }

  const collectEmailForAnalytics = shouldPersistViewerEmail({
    collectEmailForAnalytics: Boolean(link.collect_email_for_analytics),
    verifiedEmail,
  });

  return {
    context: {
      workspaceId: dataRoom.workspace_id,
      verifiedEmail,
      collectEmailForAnalytics,
    },
  } as const;
}

async function ensureAccess(
  req: NextRequest,
  linkId: string,
  resourceId: string,
  resourceType: ResourceType,
): Promise<AccessResult> {
  if (resourceType === TrackerResourceType.Document) {
    return ensureDocumentAccess(req, linkId, resourceId);
  }
  if (resourceType === TrackerResourceType.DataRoom) {
    return ensureDataRoomAccess(req, linkId, resourceId);
  }
  return accessError(
    400,
    "UNSUPPORTED_RESOURCE_TYPE",
    "Unsupported resource type for public analytics",
  );
}

type RawEventPayload = Extract<
  RequestPayload,
  { kind: PublicSubmissionKind.Event }
>;

type EventPayload = Omit<RawEventPayload, "workspaceId"> &
  AccessContext & { documentId?: string | null };

type EventResult =
  | {
      success: true;
      isUniqueView: boolean;
      isRevisit: boolean;
      notificationViewToken?: string;
    }
  | { success: true; skippedReason?: string };

type RecordEventArgs =
  Database["public"]["Functions"]["record_public_analytics_event_v2"]["Args"];

class InvalidPublicEventError extends Error {
  status: number;
  code: string;

  constructor(message: string, code = "INVALID_EVENT_PAYLOAD", status = 400) {
    super(message);
    this.name = "InvalidPublicEventError";
    this.status = status;
    this.code = code;
  }
}

const REQUIRED_RPC_ARG_KEYS = [
  "p_workspace_id",
  "p_link_id",
  "p_resource_type",
  "p_resource_id",
  "p_document_id",
  "p_viewer_key",
  "p_viewer_email",
  "p_anonymous_user_id",
  "p_session_id",
  "p_event",
  "p_page_number",
  "p_duration_ms",
  "p_section_offset",
  "p_content_path",
] as const satisfies ReadonlyArray<keyof RecordEventArgs>;

const ensureRecordEventArgsShape = (args: RecordEventArgs): RecordEventArgs => {
  for (const key of REQUIRED_RPC_ARG_KEYS) {
    const value = args[key];
    if (value === undefined) {
      throw new InvalidPublicEventError(`Missing analytics argument: ${key}`);
    }
  }

  if (
    args.p_resource_type !== TrackerResourceType.DataRoom &&
    !args.p_document_id
  ) {
    throw new InvalidPublicEventError(
      "Document analytics events must include a document ID.",
    );
  }

  return args;
};

type VersionCookiePayload = { contentPath: string; exp: number };

async function handleEvent(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: EventPayload,
  req: NextRequest,
): Promise<EventResult> {
  const trackerResourceType = (payload.resourceType ??
    TrackerResourceType.Document) as TrackerResourceType;

  const anonymousUserId = await getOrCreateAnonymousUserId({
    resourceType: trackerResourceType,
    resourceId: payload.resourceId,
    linkId: payload.linkId,
  });

  const shouldStoreEmail =
    Boolean(payload.collectEmailForAnalytics) && Boolean(payload.verifiedEmail);
  const normalizedEmail = shouldStoreEmail
    ? (payload.verifiedEmail ?? "").trim().toLowerCase()
    : null;
  const viewerKey = normalizedEmail || anonymousUserId;

  const documentIdForRpc: string = payload.documentId ?? payload.resourceId;

  const sessionId = payload.sessionId ?? "";
  const pageNumber = payload.pageNumber ?? 0;
  const durationMs = payload.durationMs ?? 0;
  const sectionOffset = payload.sectionOffset ?? 0;
  const viewerEmail = normalizedEmail ?? "";

  const contentPath = (() => {
    if (trackerResourceType === TrackerResourceType.DataRoom) {
      return "";
    }
    const cookieName = getVersionCookieKey(
      "document",
      payload.resourceId,
      payload.linkId,
    );
    const cookieValue = req.cookies.get(cookieName)?.value;
    const cookiePayload = cookieValue
      ? verifyCookie<VersionCookiePayload>(cookieValue)
      : null;
    if (cookiePayload?.contentPath && cookiePayload.exp > Date.now()) {
      return cookiePayload.contentPath;
    }
    return payload.documentStoragePath ?? "";
  })();

  const country =
    payload.event === TrackerEvent.View
      ? await resolveCountryFromHeaders(req.headers)
      : null;

  const rpcArgs = {
    p_workspace_id: payload.workspaceId!,
    p_link_id: payload.linkId,
    p_resource_type: trackerResourceType,
    p_resource_id: payload.resourceId,
    p_document_id: documentIdForRpc,
    p_viewer_key: viewerKey,
    p_viewer_email: viewerEmail,
    p_anonymous_user_id: anonymousUserId,
    p_session_id: sessionId,
    p_event: payload.event,
    p_page_number: pageNumber,
    p_duration_ms: durationMs,
    p_section_offset: sectionOffset,
    p_content_path: contentPath,
    p_country_code: country ?? undefined,
  } satisfies RecordEventArgs;

  const validatedRpcArgs = ensureRecordEventArgsShape(
    rpcArgs as RecordEventArgs,
  );

  const { data, error } = await supabase.rpc(
    "record_public_analytics_event_v2",
    validatedRpcArgs,
  );

  if (error) {
    throw new Error("Failed to record event");
  }

  const result = data?.[0];
  const isUniqueView = Boolean(result?.is_unique_view);
  return {
    success: true,
    isUniqueView,
    isRevisit: Boolean(result?.is_revisit),
    ...(isUniqueView && payload.event === TrackerEvent.View
      ? {
          notificationViewToken: createViewNotificationToken({
            linkId: payload.linkId,
            documentId: documentIdForRpc,
            viewerKey,
          }),
        }
      : {}),
  };
}

async function handleFeedback(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: Extract<RequestPayload, { kind: PublicSubmissionKind.Feedback }> &
    AccessContext,
) {
  const insertResult = await supabase.from("feedback").insert({
    workspace_id: payload.workspaceId,
    link_id: payload.linkId,
    resource_type: payload.resourceType,
    resource_id: payload.resourceId,
    submission: toJson(
      sanitizePublicFeedbackSubmission(payload.submission, {
        collectEmailForAnalytics: payload.collectEmailForAnalytics,
        verifiedEmail: payload.verifiedEmail,
      }),
    ),
    form_schema: null,
  });
  if (insertResult.error) {
    throw new Error("Failed to record feedback");
  }
}

async function handleQA(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  payload: Extract<RequestPayload, { kind: PublicSubmissionKind.Qa }> &
    AccessContext,
) {
  const insertResult = await supabase.from("qas").insert({
    workspace_id: payload.workspaceId,
    link_id: payload.linkId,
    resource_type: payload.resourceType,
    resource_id: payload.resourceId,
    question: payload.question,
    answer: payload.answer ?? null,
    author_email_hash: null,
  });
  if (insertResult.error) {
    throw new Error("Failed to record Q&A");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const access = await ensureAccess(
      req,
      payload.linkId,
      payload.resourceId,
      payload.resourceType,
    );
    if ("error" in access) {
      return NextResponse.json(
        { error: access.error.message, code: access.error.code },
        { status: access.error.status },
      );
    }

    const supabase = createSupabaseServiceClient();
    const context = access.context;

    try {
      if (payload.kind === PublicSubmissionKind.Event) {
        const botCheck = isProbablyBot(req.headers);
        if (botCheck.isBot) {
          console.info("[Public Events] bot filtered", {
            event: payload.event,
            reason: botCheck.reason ?? null,
          });
          const cookieResourceType =
            payload.resourceType === TrackerResourceType.DataRoom
              ? TrackerResourceType.DataRoom
              : TrackerResourceType.Document;
          const accessCookieName = getAccessCookieKey(
            cookieResourceType,
            payload.resourceId,
            payload.linkId,
          );
          const refreshedAccess = signCookie({
            resourceType: cookieResourceType as unknown as PublicResourceType,
            resourceId: payload.resourceId,
            linkId: payload.linkId,
            exp: Date.now() + 60 * 60 * 1000,
          });
          const response = NextResponse.json({
            success: true,
            skippedReason: "bot",
          });
          response.cookies.set(accessCookieName, refreshedAccess, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60,
            path: "/",
          });
          return response;
        }

        const result = await handleEvent(
          supabase,
          { ...payload, ...context },
          req,
        );
        const cookieResourceType =
          payload.resourceType === TrackerResourceType.DataRoom
            ? TrackerResourceType.DataRoom
            : TrackerResourceType.Document;
        const accessCookieName = getAccessCookieKey(
          cookieResourceType,
          payload.resourceId,
          payload.linkId,
        );
        const refreshedAccess = signCookie({
          resourceType: cookieResourceType,
          resourceId: payload.resourceId,
          linkId: payload.linkId,
          exp: Date.now() + 60 * 60 * 1000,
        });
        const response = NextResponse.json(result);
        response.cookies.set(accessCookieName, refreshedAccess, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60,
          path: "/",
        });
        return response;
      } else if (payload.kind === PublicSubmissionKind.Feedback) {
        await handleFeedback(supabase, { ...payload, ...context });
      } else {
        await handleQA(supabase, { ...payload, ...context });
      }
    } catch (err) {
      if (err instanceof InvalidPublicEventError) {
        // Log the detailed error server-side, return generic message to client
        console.error("[Public Events] InvalidPublicEventError:", err.message);
        return NextResponse.json(
          { error: "Invalid request", code: err.code },
          { status: err.status },
        );
      }
      console.error("[Public Events] Insert failed", err);
      return NextResponse.json(
        { error: "Failed to record data", code: "INGEST_FAILED" },
        { status: 500 },
      );
    }

    const cookieResourceType =
      payload.resourceType === TrackerResourceType.DataRoom
        ? TrackerResourceType.DataRoom
        : TrackerResourceType.Document;
    const accessCookieName = getAccessCookieKey(
      cookieResourceType,
      payload.resourceId,
      payload.linkId,
    );
    const refreshedAccess = signCookie({
      resourceType: cookieResourceType,
      resourceId: payload.resourceId,
      linkId: payload.linkId,
      exp: Date.now() + 60 * 60 * 1000,
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(accessCookieName, refreshedAccess, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[Public Events API] Error", err);
    return NextResponse.json(
      { error: "Server error", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
