import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  signCookie,
  verifyCookie,
  verifyVerifiedEmailCookie,
} from "@/server/cookieHelper";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { BRANDING_ASSETS_BUCKET_NAME } from "@/lib/constants";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { canRemoveBranding } from "@/modules/billing/entitlements";
import { canUseCustomDomain } from "@/modules/custom-domains/entitlements";
import type { Tables } from "@/types/generated/supabase";
import { evaluateWorkspaceBandwidthLimit } from "@/server/workspaceUsage";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import {
  getAccessCookieKey,
  getEmailCookieKey,
  getVersionCookieKey,
  type AccessCookiePayload,
  type PublicResourceType,
} from "@/server/cookieConstants";
import {
  fetchLinkAllowlistStatus,
  normalizeViewerEmail,
} from "@/server/linkAllowlist";
import {
  fetchLinkAlcViewerSeeds,
  filterDataRoomContentByAlc,
  isAlcSeedEmpty,
  isLinkAlcActive,
} from "@/server/linkAlc";
import { presignGetObject } from "@/server/storage";
import { resolveEffectivePublicLanguage } from "@/modules/public-links/server/settings";
import type { PublicLanguage } from "@/modules/public-links/types";
import { consumeRateLimit } from "@/server/rateLimit";
import { requiresVerifiedViewerEmail } from "@/lib/publicLinkEmailPolicy";
import { resolveTrustedRequestHost } from "@/server/trustedCountryResolver";

const ResolveRequestSchema = z
  .object({
    linkId: z.string().uuid(),
    documentId: z.string().uuid().optional(),
    dataRoomId: z.string().uuid().optional(),
    password: z.string().optional(),
  })
  .refine((value) => Boolean(value.documentId) || Boolean(value.dataRoomId), {
    message: "Provide at least one resource identifier",
    path: ["documentId"],
  });

type BrandingHeaderPayload = {
  company_name: string | null;
  website_url: string | null;
  logo_signed_url: string | null;
  logo_data_url?: string | null;
  domain: string | null;
  domain_verified: boolean;
  show_powered_by: boolean;
} | null;

type HostContext =
  | {
      ok: true;
      context: { domainVerified: boolean; verifiedDomainHost: string | null };
    }
  | { ok: false; response: NextResponse };

type PublicLinkRow = Tables<"links">;

const canWorkspaceUseCustomDomains = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  workspaceId: string,
): Promise<boolean> => {
  const { data, error } = await supabase
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    console.error("[Resolve API] subscription lookup failed", error);
    return false;
  }
  const subscription = mapWorkspaceSubscriptionRow(
    data as Tables<"workspace_subscriptions"> | null,
  );
  return canUseCustomDomain(subscription);
};

const enforceBandwidthLimit = async (
  workspaceId: string,
  publicLanguage?: PublicLanguage,
): Promise<NextResponse | null> => {
  const bandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
    workspaceId,
    0,
  );
  if (bandwidthEvaluation.shouldBlock) {
    return NextResponse.json(
      {
        error: "Bandwidth limit reached",
        code: "BANDWIDTH_LIMIT_REACHED",
        public_language: publicLanguage,
      },
      { status: 403 },
    );
  }
  return null;
};

const PASSWORD_FAILURE_BUCKET = "link_password";
const PASSWORD_FAILURE_LIMIT = 150;
const PASSWORD_FAILURE_WINDOW_SECONDS = 600;

const badPasswordResponse = (publicLanguage: PublicLanguage): NextResponse =>
  NextResponse.json(
    {
      error: "Incorrect password",
      code: "BAD_PASSWORD",
      public_language: publicLanguage,
    },
    { status: 401 },
  );

/**
 * Bound password guessing on a link without locking out its audience.
 *
 * ONE bucket, per link, sized so a whole dealroom fumbling its password never
 * reaches it — blocking here effectively only happens under attack.
 *
 * A per-viewer bucket was tried and removed: every candidate key is a cookie
 * (dk_acc_*, dk_ev_*, dk_dv_*) that is only issued AFTER access is granted,
 * and the password gate runs before all of them — so every first-time viewer
 * shared one "anonymous" bucket and eleven mistyped passwords locked out the
 * other thirty-nine recipients. Keying per viewer needs a nonce cookie minted
 * on the PASSWORD_REQUIRED response; until that exists, one honest per-link
 * budget is safer than a per-viewer one that silently isn't.
 *
 * The charge is atomic and pre-bcrypt (a check-then-charge pre-read lets N
 * concurrent attempts clear the same stale count), released when the password
 * proves correct so legitimate viewers consume nothing on net, and released
 * again when the request is refused so a blocked window cannot ratchet
 * upward forever.
 */
const enforcePasswordRateLimit = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  linkId: string,
  publicLanguage: PublicLanguage,
): Promise<NextResponse | null> => {
  const decision = await consumeRateLimit(supabase, {
    bucket: PASSWORD_FAILURE_BUCKET,
    identifier: linkId,
    limit: PASSWORD_FAILURE_LIMIT,
    windowSeconds: PASSWORD_FAILURE_WINDOW_SECONDS,
  });
  if (decision.allowed) return null;
  await releasePasswordCharge(supabase, linkId);
  return badPasswordResponse(publicLanguage);
};

/** Give back the budget an attempt consumed (correct password, or refused). */
const releasePasswordCharge = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  linkId: string,
): Promise<void> => {
  await consumeRateLimit(supabase, {
    bucket: PASSWORD_FAILURE_BUCKET,
    identifier: linkId,
    limit: PASSWORD_FAILURE_LIMIT,
    windowSeconds: PASSWORD_FAILURE_WINDOW_SECONDS,
    increment: -1,
  });
};

const fetchWorkspaceName = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  workspaceId: string,
): Promise<string> => {
  const { data, error } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) {
    console.error("[Resolve API] Workspace lookup failed", error);
  }
  return data?.name || "";
};

const buildNdaGateResponse = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  link: Pick<Tables<"links">, "workspace_id" | "nda_template_snapshot_html">,
  message: string,
  code: "NDA_SIGN_REQUIRED" | "NDA_PDF_PENDING" = "NDA_SIGN_REQUIRED",
  publicLanguage?: PublicLanguage,
  verifiedEmail?: string | null,
): Promise<NextResponse> => {
  const workspaceName = await fetchWorkspaceName(supabase, link.workspace_id);
  return NextResponse.json(
    {
      error: message,
      code,
      workspace_name: workspaceName,
      workspace_id: link.workspace_id,
      verified_email: verifiedEmail ?? null,
      nda_template_snapshot_html: link.nda_template_snapshot_html ?? null,
      public_language: publicLanguage,
    },
    { status: 403 },
  );
};

const buildResolvedLinkPayload = (
  link: PublicLinkRow,
  publicLanguage: PublicLanguage,
) => ({
  can_download: link.can_download,
  apply_watermark: link.apply_watermark,
  dynamic_watermark_variables: link.dynamic_watermark_variables,
  email_verification: link.email_verification,
  screenshot_protection: link.screenshot_protection,
  expires_at: link.expires_at,
  show_qas: link.show_qas,
  curated_qas: link.curated_qas,
  show_feedback: link.show_feedback,
  email_notify: link.email_notify,
  comments_enabled: Boolean(link.comments_enabled),
  nda_gate: link.nda_gate,
  nda_template_snapshot_html: link.nda_template_snapshot_html,
  public_language: publicLanguage,
});

const ensureHostAccess = async (
  req: NextRequest,
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  workspaceId: string,
  publicLanguage?: PublicLanguage,
): Promise<HostContext> => {
  const host = resolveTrustedRequestHost(
    req.headers,
    process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET,
  );

  if (host === null) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid host",
          code: "INVALID_HOST",
          public_language: publicLanguage,
        },
        { status: 400 },
      ),
    };
  }

  // Check if this is a local development host
  const isLocalBase =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  const isLocalSubdomain =
    host.endsWith(".localhost") || host.endsWith(".127.0.0.1");

  // Get the app's configured host info
  const { envHost, rootFromEnv } = (() => {
    try {
      const raw = process.env.NEXT_PUBLIC_APP_URL || "";
      const u = new URL(raw);
      const h = u.hostname.toLowerCase();
      const parts = h.split(".");
      const root = parts.length >= 2 ? parts.slice(-2).join(".") : h;
      return { envHost: h, rootFromEnv: root };
    } catch {
      return { envHost: "dockosha.com", rootFromEnv: "dockosha.com" };
    }
  })();

  // Define the set of "base" hosts that are always allowed
  const baseHosts = new Set<string>([
    rootFromEnv,
    envHost,
    `www.${rootFromEnv}`,
    `staging.${rootFromEnv}`,
  ]);
  const isBaseHost = baseHosts.has(host);

  let domainVerified = false;
  let verifiedDomainHost: string | null = null;

  // Case 1: Local development - always allow
  if (isLocalBase || isLocalSubdomain) {
    return {
      ok: true,
      context: { domainVerified: false, verifiedDomainHost: null },
    };
  }

  // Case 2: Base/default hosts - always allow
  if (isBaseHost) {
    return {
      ok: true,
      context: { domainVerified: false, verifiedDomainHost: null },
    };
  }

  // Case 3: Check if this is a verified custom domain for this workspace
  // Read the configured verified-domain row for this workspace.
  // Look up the domain by exact hostname match
  const { data: domainRow } = await supabase
    .from("custom_domains")
    .select("id, workspace_id, domain, status")
    .eq("domain", host)
    .eq("status", "verified")
    .maybeSingle();

  if (!domainRow) {
    // Not a recognized custom domain
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid host",
          code: "INVALID_HOST",
          public_language: publicLanguage,
        },
        { status: 400 },
      ),
    };
  }

  // Verify this domain belongs to the workspace of the requested resource
  if (domainRow.workspace_id !== workspaceId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Domain mismatch",
          code: "INVALID_DOMAIN",
          public_language: publicLanguage,
        },
        { status: 404 },
      ),
    };
  }

  // Check if this domain is the active custom domain for the workspace
  const { data: ws, error: wsError } = await supabase
    .from("workspaces")
    .select("active_custom_domain_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (wsError) {
    console.error("[Resolve API] Workspace lookup failed", wsError);
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Workspace lookup failed",
          code: "WORKSPACE_LOOKUP_FAILED",
          public_language: publicLanguage,
        },
        { status: 500 },
      ),
    };
  }

  const activeId =
    (ws as { active_custom_domain_id?: string | null } | null)
      ?.active_custom_domain_id || null;

  if (!activeId || activeId !== domainRow.id) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Inactive domain",
          code: "INVALID_DOMAIN",
          public_language: publicLanguage,
        },
        { status: 404 },
      ),
    };
  }

  // Check if workspace is entitled to use custom domains
  const customDomainsEnabled = await canWorkspaceUseCustomDomains(
    supabase,
    workspaceId,
  );
  if (!customDomainsEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Custom domains not enabled",
          code: "INVALID_DOMAIN",
          public_language: publicLanguage,
        },
        { status: 404 },
      ),
    };
  }

  // Custom domain is valid
  domainVerified = true;
  verifiedDomainHost = domainRow.domain;

  return {
    ok: true,
    context: { domainVerified, verifiedDomainHost },
  };
};

const buildBrandingHeader = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  workspaceId: string,
  domainVerified: boolean,
  verifiedDomainHost: string | null,
): Promise<BrandingHeaderPayload> => {
  const { data: branding } = await supabase
    .from("branding")
    .select("company_name, website_url, logo_storage_path")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let logoUrl: string | null = null;
  const logoPath =
    (branding as { logo_storage_path?: string | null } | null)
      ?.logo_storage_path || null;
  if (logoPath) {
    try {
      // Generate presigned URL using R2
      logoUrl = await presignGetObject({
        logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
        path: logoPath,
        expiresInSeconds: 60 * 10,
      });
    } catch {
      logoUrl = null;
    }
  }

  const { data: subscriptionRow } = await supabase
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const subscription = mapWorkspaceSubscriptionRow(
    subscriptionRow as Tables<"workspace_subscriptions"> | null,
  );

  return {
    company_name:
      (branding as { company_name?: string | null } | null)?.company_name ??
      null,
    website_url:
      (branding as { website_url?: string | null } | null)?.website_url ?? null,
    logo_signed_url: logoUrl,
    domain: domainVerified ? verifiedDomainHost : null,
    domain_verified: domainVerified,
    // Stays core: white-label read — the !canRemoveBranding default keeps the powered-by badge.
    show_powered_by: !canRemoveBranding(subscription),
  };
};

const readVerifiedEmail = (
  req: NextRequest,
  resourceType: PublicResourceType,
  resourceId: string,
  linkId: string,
): string | null => {
  const cookieName = getEmailCookieKey(resourceType, resourceId, linkId);
  const cookieValue = req.cookies.get(cookieName)?.value;
  if (!cookieValue) {
    return null;
  }
  const payload = verifyVerifiedEmailCookie(cookieValue, {
    resourceType,
    resourceId,
    linkId,
  });
  if (!payload?.email) {
    return null;
  }
  return normalizeViewerEmail(payload.email);
};

const hasValidAccessCookie = (
  req: NextRequest,
  resourceType: PublicResourceType,
  resourceId: string,
  linkId: string,
): boolean => {
  const cookieName = getAccessCookieKey(resourceType, resourceId, linkId);
  const cookieValue = req.cookies.get(cookieName)?.value;
  if (!cookieValue) {
    return false;
  }
  const payload = verifyCookie<AccessCookiePayload>(cookieValue);
  if (!payload) {
    return false;
  }
  return (
    payload.resourceId === resourceId &&
    payload.resourceType === resourceType &&
    payload.linkId === linkId
  );
};

const setAccessCookie = (
  response: NextResponse,
  resourceType: PublicResourceType,
  resourceId: string,
  linkId: string,
) => {
  const cookieName = getAccessCookieKey(resourceType, resourceId, linkId);
  const cookieValue = signCookie({
    resourceType,
    resourceId,
    linkId,
    exp: Date.now() + 60 * 60 * 1000,
  });
  response.cookies.set(cookieName, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
};

const setVersionCookie = (
  response: NextResponse,
  resourceType: PublicResourceType,
  resourceId: string,
  linkId: string,
  contentPath: string,
) => {
  const cookieName = getVersionCookieKey(resourceType, resourceId, linkId);
  const cookieValue = signCookie({
    contentPath,
    exp: Date.now() + 60 * 60 * 1000,
  });
  response.cookies.set(cookieName, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
};

const consumeOpenOnceLink = async (
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  link: Pick<Tables<"links">, "id" | "open_once">,
): Promise<boolean> => {
  if (!link.open_once) return true;
  const { data, error } = await supabase
    .from("links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", link.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[Resolve API] Failed to consume open-once link", {
      linkId: link.id,
      error,
    });
    throw error;
  }
  return Boolean(data);
};

const openOnceAlreadyConsumedResponse = (
  publicLanguage: PublicLanguage,
): NextResponse =>
  NextResponse.json(
    {
      error: "Link revoked",
      code: "REVOKED",
      public_language: publicLanguage,
    },
    { status: 410 },
  );

type DocumentResolveArgs = {
  req: NextRequest;
  linkId: string;
  documentId: string;
  password?: string;
};

type DataRoomResolveArgs = {
  req: NextRequest;
  linkId: string;
  dataRoomId: string;
  password?: string;
};

type DataRoomDocumentResolveArgs = {
  req: NextRequest;
  linkId: string;
  documentId: string;
  dataRoomId: string;
  password?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ResolveRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { linkId, documentId, dataRoomId, password } = parsed.data;
    if (documentId && dataRoomId) {
      return resolveDataRoomDocument({
        req,
        linkId,
        documentId,
        dataRoomId,
        password,
      });
    }
    if (documentId) {
      return resolveDocument({
        req,
        linkId,
        documentId,
        password,
      });
    }
    return resolveDataRoom({
      req,
      linkId,
      dataRoomId: dataRoomId as string,
      password,
    });
  } catch (err) {
    console.error("[Resolve API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error", code: "UNKNOWN" },
      { status: 500 },
    );
  }
}

const resolveDocument = async ({
  req,
  linkId,
  documentId,
  password,
}: DocumentResolveArgs): Promise<NextResponse> => {
  const supabase = createSupabaseServiceClient();
  const { data: link, error: linkError } = await supabase
    .from("links")
    .select("*")
    .eq("id", linkId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (linkError || !link) {
    return NextResponse.json(
      { error: "Link not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  const publicLanguage = await resolveEffectivePublicLanguage({
    workspaceId: link.workspace_id,
    linkPublicLanguageOverride: link.public_language_override,
  });

  const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
  if (!hasEntitlement) {
    return NextResponse.json(
      {
        error: "Link not found",
        code: "NOT_FOUND",
        public_language: publicLanguage,
      },
      { status: 404 },
    );
  }

  const hostCheck = await ensureHostAccess(
    req,
    supabase,
    link.workspace_id,
    publicLanguage,
  );
  if (!hostCheck.ok) {
    return hostCheck.response;
  }
  const { domainVerified, verifiedDomainHost } = hostCheck.context;

  const resourceType: PublicResourceType = "document";
  const cookieVerifiedEmail = readVerifiedEmail(
    req,
    resourceType,
    documentId,
    linkId,
  );
  const allowlistStatus = await fetchLinkAllowlistStatus(
    supabase,
    linkId,
    cookieVerifiedEmail,
  );
  const verifiedEmail =
    allowlistStatus.normalizedEmail ?? cookieVerifiedEmail ?? null;
  const requiresVerifiedEmail = requiresVerifiedViewerEmail({
    emailVerification: link.email_verification,
    ndaGate: link.nda_gate,
    collectEmailForAnalytics: link.collect_email_for_analytics,
    dynamicWatermarkEmail: link.apply_watermark && link.dynamic_watermark_email,
    allowlistActive: allowlistStatus.isActive,
  });

  if (requiresVerifiedEmail && !verifiedEmail) {
    return NextResponse.json(
      {
        error: "Email verification required",
        code: "EMAIL_OTP_REQUIRED",
        public_language: publicLanguage,
      },
      { status: 401 },
    );
  }
  if (allowlistStatus.isActive && allowlistStatus.emailAllowed === false) {
    return NextResponse.json(
      {
        error: "Email not allowed",
        code: "EMAIL_NOT_ALLOWED",
        public_language: publicLanguage,
      },
      { status: 403 },
    );
  }

  if (link.nda_gate) {
    if (!verifiedEmail) {
      return buildNdaGateResponse(
        supabase,
        link,
        "Email verification required for NDA",
        "NDA_SIGN_REQUIRED",
        publicLanguage,
        verifiedEmail,
      );
    }
    const { data: sig } = await supabase
      .from("nda_signatures")
      .select("id, signed_pdf_path")
      .eq("link_id", linkId)
      .eq("email", verifiedEmail)
      .maybeSingle();
    if (!sig) {
      return buildNdaGateResponse(
        supabase,
        link,
        "NDA signature required",
        "NDA_SIGN_REQUIRED",
        publicLanguage,
        verifiedEmail,
      );
    }
    if (!sig.signed_pdf_path) {
      return buildNdaGateResponse(
        supabase,
        link,
        "Signed NDA is being prepared",
        "NDA_PDF_PENDING",
        publicLanguage,
        verifiedEmail,
      );
    }
  }

  const documentAccessValid = hasValidAccessCookie(
    req,
    "document",
    documentId,
    linkId,
  );

  let passwordMatches = documentAccessValid;
  if (link.password_hash && !passwordMatches) {
    if (!password) {
      return NextResponse.json(
        {
          error: "Password required",
          code: "PASSWORD_REQUIRED",
          public_language: publicLanguage,
        },
        { status: 401 },
      );
    }
    const rateLimitResponse = await enforcePasswordRateLimit(
      supabase,
      linkId,
      publicLanguage,
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    try {
      passwordMatches = await bcrypt.compare(password, link.password_hash);
    } catch (err) {
      console.error("[Resolve API] Password compare failed", err);
      return NextResponse.json(
        {
          error: "Incorrect password",
          code: "BAD_PASSWORD",
          public_language: publicLanguage,
        },
        { status: 401 },
      );
    }
    if (passwordMatches) {
      await releasePasswordCharge(supabase, linkId);
    }
    if (!passwordMatches) {
      return NextResponse.json(
        {
          error: "Incorrect password",
          code: "BAD_PASSWORD",
          public_language: publicLanguage,
        },
        { status: 401 },
      );
    }
  }

  const bandwidthLimitResponse = await enforceBandwidthLimit(
    link.workspace_id,
    publicLanguage,
  );
  if (bandwidthLimitResponse) {
    return bandwidthLimitResponse;
  }

  const { data: resolved, error: rpcError } = await supabase.rpc(
    "resolve_public_link",
    {
      document_id: documentId,
      link_id: linkId,
      email: verifiedEmail || "",
      password: password || "",
      accept_nda: false,
    },
  );

  if (rpcError) {
    const code = (rpcError.code || "").toUpperCase();

    if (code === "42883" && passwordMatches) {
      const now = new Date();
      if (link.revoked_at) {
        return NextResponse.json(
          {
            error: "Link revoked",
            code: "REVOKED",
            public_language: publicLanguage,
          },
          { status: 410 },
        );
      }
      if (link.expires_at && new Date(link.expires_at) < now) {
        return NextResponse.json(
          {
            error: "Link expired",
            code: "EXPIRED",
            public_language: publicLanguage,
          },
          { status: 410 },
        );
      }

      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select(
          "id, title, file_type, num_pages, storage_path, converted_storage_path, conversion_status, workspace_id",
        )
        .eq("id", documentId)
        .maybeSingle();
      if (docError || !doc) {
        return NextResponse.json(
          { error: "Document not found", code: "NOT_FOUND" },
          { status: 404 },
        );
      }

      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", doc.workspace_id)
        .maybeSingle();
      if (workspaceError) {
        console.error("[Resolve API] Workspace lookup failed", workspaceError);
      }

      const brandingHeader = await buildBrandingHeader(
        supabase,
        link.workspace_id,
        domainVerified,
        verifiedDomainHost,
      );

      const manualResponse = NextResponse.json({
        link: buildResolvedLinkPayload(link, publicLanguage),
        document: {
          id: doc.id,
          title: doc.title,
          file_type: doc.file_type,
          num_pages: doc.num_pages,
          storage_path: doc.storage_path,
          converted_storage_path: doc.converted_storage_path,
          conversion_status: doc.conversion_status,
        },
        workspace_name: workspace?.name || "",
        workspace_id: link.workspace_id,
        verified_email: verifiedEmail,
        branding_header: brandingHeader,
        public_language: publicLanguage,
      });

      setAccessCookie(manualResponse, resourceType, documentId, linkId);
      if (doc.storage_path) {
        setVersionCookie(
          manualResponse,
          "document",
          documentId,
          linkId,
          doc.storage_path,
        );
      }
      if (!(await consumeOpenOnceLink(supabase, link))) {
        return openOnceAlreadyConsumedResponse(publicLanguage);
      }
      return manualResponse;
    }

    if (code === "PGRST102") {
      return NextResponse.json(
        {
          error: "Link not found",
          code: "NOT_FOUND",
          public_language: publicLanguage,
        },
        { status: 404 },
      );
    }
    if (code === "P0001") {
      const { data: currentLink, error: currentLinkError } = await supabase
        .from("links")
        .select("id,document_id,revoked_at,expires_at")
        .eq("id", linkId)
        .maybeSingle();

      if (currentLinkError) {
        console.error(
          "[Resolve API] Failed to classify structured link state",
          currentLinkError,
        );
      } else if (!currentLink || currentLink.document_id !== documentId) {
        return NextResponse.json(
          {
            error: "Link not found",
            code: "NOT_FOUND",
            public_language: publicLanguage,
          },
          { status: 404 },
        );
      } else if (currentLink.revoked_at) {
        return NextResponse.json(
          {
            error: "Link revoked",
            code: "REVOKED",
            public_language: publicLanguage,
          },
          { status: 410 },
        );
      } else if (
        currentLink.expires_at &&
        new Date(currentLink.expires_at) < new Date()
      ) {
        return NextResponse.json(
          {
            error: "Link expired",
            code: "EXPIRED",
            public_language: publicLanguage,
          },
          { status: 410 },
        );
      } else {
        const { data: currentDocument, error: currentDocumentError } =
          await supabase
            .from("documents")
            .select("id")
            .eq("id", documentId)
            .maybeSingle();
        if (currentDocumentError) {
          console.error(
            "[Resolve API] Failed to classify structured document state",
            currentDocumentError,
          );
        } else if (!currentDocument) {
          return NextResponse.json(
            {
              error: "Document not found",
              code: "NOT_FOUND",
              public_language: publicLanguage,
            },
            { status: 404 },
          );
        }
      }
    }
    if (code === "22P02" || code === "22023") {
      return NextResponse.json(
        {
          error: "Invalid request",
          code: "INVALID_INPUT",
          public_language: publicLanguage,
        },
        { status: 400 },
      );
    }
    console.error("[Resolve API] Unhandled RPC error", rpcError);
    return NextResponse.json(
      {
        error: "Resolution failed",
        code: "UNKNOWN",
        public_language: publicLanguage,
      },
      { status: 500 },
    );
  }

  if (!resolved || (Array.isArray(resolved) && resolved.length === 0)) {
    return NextResponse.json(
      {
        error: "Link unavailable",
        code: "NOT_FOUND",
        public_language: publicLanguage,
      },
      { status: 404 },
    );
  }

  const row = Array.isArray(resolved) ? resolved[0] : resolved;
  const brandingHeader = await buildBrandingHeader(
    supabase,
    link.workspace_id,
    domainVerified,
    verifiedDomainHost,
  );

  const ndaGate =
    (row as { nda_gate?: boolean }).nda_gate ?? link.nda_gate ?? false;

  const response = NextResponse.json({
    link: {
      ...buildResolvedLinkPayload(link, publicLanguage),
      can_download: row.can_download,
      apply_watermark: row.apply_watermark,
      dynamic_watermark_variables: row.dynamic_watermark_variables,
      email_verification: row.email_verification,
      screenshot_protection: row.screenshot_protection,
      expires_at: row.expires_at,
      show_qas: row.show_qas,
      curated_qas: row.curated_qas,
      show_feedback: row.show_feedback,
      email_notify: row.email_notify,
      comments_enabled:
        (row as { comments_enabled?: boolean }).comments_enabled ??
        Boolean(link.comments_enabled),
      nda_gate: ndaGate,
      nda_template_snapshot_html: link.nda_template_snapshot_html,
    },
    document: {
      id: row.doc_id,
      title: row.title,
      file_type: row.file_type,
      num_pages: row.num_pages,
      storage_path: row.storage_path,
      converted_storage_path: row.converted_storage_path,
      conversion_status: row.conversion_status,
    },
    workspace_name: row.workspace_name,
    workspace_id: link.workspace_id,
    verified_email: verifiedEmail,
    branding_header: brandingHeader,
    public_language: publicLanguage,
  });

  setAccessCookie(response, resourceType, documentId, linkId);
  if (row.storage_path) {
    setVersionCookie(
      response,
      "document",
      documentId,
      linkId,
      row.storage_path,
    );
  }
  if (!(await consumeOpenOnceLink(supabase, link))) {
    return openOnceAlreadyConsumedResponse(publicLanguage);
  }
  return response;
};

const resolveDataRoom = async ({
  req,
  linkId,
  dataRoomId: requestedDataRoomId,
  password,
}: DataRoomResolveArgs): Promise<NextResponse> => {
  const supabase = createSupabaseServiceClient();
  const { data: link, error: linkError } = await supabase
    .from("links")
    .select("*")
    .eq("id", linkId)
    .maybeSingle();
  if (linkError || !link) {
    return NextResponse.json(
      { error: "Link not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  const publicLanguage = await resolveEffectivePublicLanguage({
    workspaceId: link.workspace_id,
    linkPublicLanguageOverride: link.public_language_override,
  });

  const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
  if (!hasEntitlement) {
    return NextResponse.json(
      {
        error: "Link not found",
        code: "NOT_FOUND",
        public_language: publicLanguage,
      },
      { status: 404 },
    );
  }

  const resolvedDataRoomId =
    (link as { data_room_id?: string | null }).data_room_id || null;
  if (!resolvedDataRoomId) {
    return NextResponse.json(
      {
        error: "Link not found",
        code: "NOT_FOUND",
        public_language: publicLanguage,
      },
      { status: 404 },
    );
  }
  if (
    requestedDataRoomId &&
    requestedDataRoomId !== resolvedDataRoomId &&
    process.env.NODE_ENV !== "production"
  ) {
    console.warn(
      "[Resolve Data Room] Requested room id does not match stored id",
      {
        requestedDataRoomId,
        resolvedDataRoomId,
        linkId,
      },
    );
  }

  // Fail fast before doing any heavier work (custom domain checks, allowlist, etc).
  const now = new Date();
  if (link.revoked_at) {
    return NextResponse.json(
      {
        error: "Link revoked",
        code: "REVOKED",
        public_language: publicLanguage,
      },
      { status: 410 },
    );
  }
  if (link.expires_at && new Date(link.expires_at) < now) {
    return NextResponse.json(
      {
        error: "Link expired",
        code: "EXPIRED",
        public_language: publicLanguage,
      },
      { status: 410 },
    );
  }

  const hostCheck = await ensureHostAccess(
    req,
    supabase,
    link.workspace_id,
    publicLanguage,
  );
  if (!hostCheck.ok) {
    return hostCheck.response;
  }
  const { domainVerified, verifiedDomainHost } = hostCheck.context;

  const resourceType: PublicResourceType = "data_room";
  const cookieVerifiedEmail = readVerifiedEmail(
    req,
    resourceType,
    resolvedDataRoomId,
    linkId,
  );

  const dataRoomAccessValid = hasValidAccessCookie(
    req,
    "data_room",
    resolvedDataRoomId,
    linkId,
  );

  if (link.password_hash && !dataRoomAccessValid) {
    if (!password) {
      return NextResponse.json(
        {
          error: "Password required",
          code: "PASSWORD_REQUIRED",
          public_language: publicLanguage,
        },
        { status: 401 },
      );
    }
    const rateLimitResponse = await enforcePasswordRateLimit(
      supabase,
      linkId,
      publicLanguage,
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    try {
      const passwordMatches = await bcrypt.compare(
        password,
        link.password_hash,
      );
      if (!passwordMatches) {
        return NextResponse.json(
          {
            error: "Incorrect password",
            code: "BAD_PASSWORD",
            public_language: publicLanguage,
          },
          { status: 401 },
        );
      }
      await releasePasswordCharge(supabase, linkId);
    } catch (err) {
      console.error("[Resolve Data Room] Password compare failed", err);
      return NextResponse.json(
        {
          error: "Incorrect password",
          code: "BAD_PASSWORD",
          public_language: publicLanguage,
        },
        { status: 401 },
      );
    }
  }

  const allowlistStatus = await fetchLinkAllowlistStatus(
    supabase,
    linkId,
    cookieVerifiedEmail,
  );
  const alcActive = await isLinkAlcActive(supabase, linkId);
  const verifiedEmail =
    allowlistStatus.normalizedEmail ?? cookieVerifiedEmail ?? null;
  const requiresVerifiedEmail = requiresVerifiedViewerEmail({
    emailVerification: link.email_verification,
    ndaGate: link.nda_gate,
    collectEmailForAnalytics: link.collect_email_for_analytics,
    dynamicWatermarkEmail: link.apply_watermark && link.dynamic_watermark_email,
    allowlistActive: allowlistStatus.isActive || alcActive,
  });

  if (requiresVerifiedEmail && !verifiedEmail) {
    return NextResponse.json(
      {
        error: "Email verification required",
        code: "EMAIL_OTP_REQUIRED",
        public_language: publicLanguage,
      },
      { status: 401 },
    );
  }
  if (allowlistStatus.isActive && allowlistStatus.emailBlocked === true) {
    return NextResponse.json(
      {
        error: "Email not allowed",
        code: "EMAIL_NOT_ALLOWED",
        public_language: publicLanguage,
      },
      { status: 403 },
    );
  }
  if (
    !alcActive &&
    allowlistStatus.isActive &&
    allowlistStatus.emailAllowed === false
  ) {
    return NextResponse.json(
      {
        error: "Email not allowed",
        code: "EMAIL_NOT_ALLOWED",
        public_language: publicLanguage,
      },
      { status: 403 },
    );
  }

  const alcSeeds =
    alcActive && verifiedEmail
      ? await fetchLinkAlcViewerSeeds(supabase, {
          linkId,
          workspaceId: link.workspace_id,
          viewerEmail: verifiedEmail,
        }).catch((error) => {
          console.error("[Resolve Data Room] Failed to evaluate ALC", {
            linkId,
            workspaceId: link.workspace_id,
            error,
          });
          return null;
        })
      : null;

  if (alcActive && (!alcSeeds || isAlcSeedEmpty(alcSeeds))) {
    return NextResponse.json(
      {
        error: "Access denied",
        code: "ALC_NOT_ALLOWED",
        public_language: publicLanguage,
      },
      { status: 403 },
    );
  }

  if (link.nda_gate) {
    if (!verifiedEmail) {
      return buildNdaGateResponse(
        supabase,
        link,
        "Email verification required for NDA",
        "NDA_SIGN_REQUIRED",
        publicLanguage,
        verifiedEmail,
      );
    }
    const { data: ndaSignature, error: ndaError } = await supabase
      .from("nda_signatures")
      .select("id, signed_pdf_path")
      .eq("link_id", linkId)
      .eq("email", verifiedEmail)
      .maybeSingle();
    if (ndaError) {
      console.error("[Resolve Data Room] NDA lookup failed", ndaError);
    }
    if (!ndaSignature) {
      return buildNdaGateResponse(
        supabase,
        link,
        "NDA signature required",
        "NDA_SIGN_REQUIRED",
        publicLanguage,
        verifiedEmail,
      );
    }
    if (!ndaSignature.signed_pdf_path) {
      return buildNdaGateResponse(
        supabase,
        link,
        "Signed NDA is being prepared",
        "NDA_PDF_PENDING",
        publicLanguage,
        verifiedEmail,
      );
    }
  }

  const bandwidthLimitResponse = await enforceBandwidthLimit(
    link.workspace_id,
    publicLanguage,
  );
  if (bandwidthLimitResponse) {
    return bandwidthLimitResponse;
  }

  const { data: room } = await supabase
    .from("data_rooms")
    .select("id, name, description, workspace_id, created_at, is_disabled")
    .eq("id", resolvedDataRoomId)
    .maybeSingle();

  if (!room || room.workspace_id !== link.workspace_id) {
    return NextResponse.json(
      {
        error: "Data room not found",
        code: "NOT_FOUND",
        public_language: publicLanguage,
      },
      { status: 404 },
    );
  }
  if (room.is_disabled) {
    return NextResponse.json(
      {
        error: "Link unavailable",
        code: "ROOM_DISABLED",
        public_language: publicLanguage,
      },
      { status: 410 },
    );
  }

  const [
    { data: folders, error: folderError },
    { data: documents, error: docError },
    { data: workspace, error: workspaceError },
    brandingHeader,
  ] = await Promise.all([
    supabase
      .from("folders")
      .select("id, name, parent_folder_id")
      .eq("data_room_id", resolvedDataRoomId),
    supabase
      .from("documents")
      .select("id, title, file_type, size_bytes, folder_id")
      .eq("data_room_id", resolvedDataRoomId),
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", room.workspace_id)
      .maybeSingle(),
    buildBrandingHeader(
      supabase,
      link.workspace_id,
      domainVerified,
      verifiedDomainHost,
    ),
  ]);

  if (folderError) {
    console.error("[Resolve Data Room] Failed to load folders", folderError);
  }
  if (docError) {
    console.error("[Resolve Data Room] Failed to load documents", docError);
  }

  if (workspaceError) {
    console.error(
      "[Resolve Data Room] Workspace lookup failed",
      workspaceError,
    );
  }

  const effectiveFolders = (folders ?? []) as Array<{
    id: string;
    name: string | null;
    parent_folder_id: string | null;
  }>;
  const effectiveDocuments = (documents ?? []) as Array<{
    id: string;
    title: string | null;
    file_type: string | null;
    size_bytes: number | null;
    folder_id: string | null;
  }>;

  const { filteredFolders, filteredDocuments } =
    alcActive && alcSeeds
      ? filterDataRoomContentByAlc({
          folders: effectiveFolders,
          documents: effectiveDocuments,
          roomAllowed: alcSeeds.roomAllowed,
          allowedFolderSeedIds: alcSeeds.allowedFolderSeedIds,
          allowedDocumentSeedIds: alcSeeds.allowedDocumentSeedIds,
        })
      : {
          filteredFolders: effectiveFolders,
          filteredDocuments: effectiveDocuments,
        };

  const response = NextResponse.json({
    link: buildResolvedLinkPayload(link, publicLanguage),
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      status: null,
      workspace_id: room.workspace_id,
      created_at: room.created_at,
      updated_at: null,
    },
    folders:
      filteredFolders?.map((folder) => ({
        ...folder,
        updated_at: null,
      })) ?? [],
    documents: filteredDocuments ?? [],
    workspace_name: workspace?.name || "",
    workspace_id: link.workspace_id,
    verified_email: verifiedEmail,
    branding_header: brandingHeader,
    public_language: publicLanguage,
  });

  setAccessCookie(response, resourceType, resolvedDataRoomId, linkId);
  if (!(await consumeOpenOnceLink(supabase, link))) {
    return openOnceAlreadyConsumedResponse(publicLanguage);
  }
  return response;
};

const resolveDataRoomDocument = async ({
  req,
  linkId,
  documentId,
  dataRoomId,
  password,
}: DataRoomDocumentResolveArgs): Promise<NextResponse> => {
  const supabase = createSupabaseServiceClient();
  const { data: link, error: linkError } = await supabase
    .from("links")
    .select("*")
    .eq("id", linkId)
    .eq("data_room_id", dataRoomId)
    .maybeSingle();
  if (linkError || !link) {
    return NextResponse.json(
      { error: "Link not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  const publicLanguage = await resolveEffectivePublicLanguage({
    workspaceId: link.workspace_id,
    linkPublicLanguageOverride: link.public_language_override,
  });

  const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
  if (!hasEntitlement) {
    return NextResponse.json(
      {
        error: "Link not found",
        code: "NOT_FOUND",
        public_language: publicLanguage,
      },
      { status: 404 },
    );
  }

  const hostCheck = await ensureHostAccess(
    req,
    supabase,
    link.workspace_id,
    publicLanguage,
  );
  if (!hostCheck.ok) {
    return hostCheck.response;
  }
  const { domainVerified, verifiedDomainHost } = hostCheck.context;

  const documentAccessValid = hasValidAccessCookie(
    req,
    "document",
    documentId,
    linkId,
  );
  const dataRoomAccessValid = hasValidAccessCookie(
    req,
    "data_room",
    dataRoomId,
    linkId,
  );
  const hasAccessCookie = documentAccessValid || dataRoomAccessValid;

  if (link.password_hash && !hasAccessCookie) {
    if (!password) {
      return NextResponse.json(
        {
          error: "Password required",
          code: "PASSWORD_REQUIRED",
          public_language: publicLanguage,
        },
        { status: 401 },
      );
    }
    const rateLimitResponse = await enforcePasswordRateLimit(
      supabase,
      linkId,
      publicLanguage,
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    try {
      const passwordMatches = await bcrypt.compare(
        password,
        link.password_hash,
      );
      if (!passwordMatches) {
        return NextResponse.json(
          {
            error: "Incorrect password",
            code: "BAD_PASSWORD",
            public_language: publicLanguage,
          },
          { status: 401 },
        );
      }
      await releasePasswordCharge(supabase, linkId);
    } catch (err) {
      console.error("[Resolve Data Room Doc] Password compare failed", err);
      return NextResponse.json(
        {
          error: "Incorrect password",
          code: "BAD_PASSWORD",
          public_language: publicLanguage,
        },
        { status: 401 },
      );
    }
  }

  const now = new Date();
  const hasConsumedOpenOnceAccess = Boolean(
    link.open_once &&
    link.revoked_at &&
    hasValidAccessCookie(req, "data_room", dataRoomId, linkId),
  );
  if (link.revoked_at && !hasConsumedOpenOnceAccess) {
    return NextResponse.json(
      {
        error: "Link revoked",
        code: "REVOKED",
        public_language: publicLanguage,
      },
      { status: 410 },
    );
  }
  if (link.expires_at && new Date(link.expires_at) < now) {
    return NextResponse.json(
      {
        error: "Link expired",
        code: "EXPIRED",
        public_language: publicLanguage,
      },
      { status: 410 },
    );
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select(
      "id, title, file_type, num_pages, storage_path, converted_storage_path, conversion_status, workspace_id, data_room_id, folder_id",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (
    documentError ||
    !document ||
    (document as { data_room_id?: string | null }).data_room_id !== dataRoomId
  ) {
    return NextResponse.json(
      {
        error: "Document not found",
        code: "NOT_FOUND",
        public_language: publicLanguage,
      },
      { status: 404 },
    );
  }

  const { data: dataRoom } = await supabase
    .from("data_rooms")
    .select("id, workspace_id, is_disabled")
    .eq("id", dataRoomId)
    .maybeSingle();

  if (!dataRoom || dataRoom.workspace_id !== link.workspace_id) {
    return NextResponse.json(
      {
        error: "Data room not found",
        code: "NOT_FOUND",
        public_language: publicLanguage,
      },
      { status: 404 },
    );
  }
  if (dataRoom.is_disabled) {
    return NextResponse.json(
      {
        error: "Link unavailable",
        code: "ROOM_DISABLED",
        public_language: publicLanguage,
      },
      { status: 410 },
    );
  }

  const dataRoomVerifiedEmail = readVerifiedEmail(
    req,
    "data_room",
    dataRoomId,
    linkId,
  );
  const documentScopeVerifiedEmail = readVerifiedEmail(
    req,
    "document",
    documentId,
    linkId,
  );
  const requiresDataRoomScope = Boolean(link.data_room_id);
  const scopedVerifiedEmail = requiresDataRoomScope
    ? dataRoomVerifiedEmail
    : (documentScopeVerifiedEmail ?? dataRoomVerifiedEmail);
  const allowlistStatus = await fetchLinkAllowlistStatus(
    supabase,
    linkId,
    scopedVerifiedEmail,
  );
  const alcActive = await isLinkAlcActive(supabase, linkId);
  const normalizedScopedEmail =
    allowlistStatus.normalizedEmail ?? scopedVerifiedEmail ?? null;
  const verifiedEmail =
    normalizedScopedEmail ??
    dataRoomVerifiedEmail ??
    documentScopeVerifiedEmail ??
    null;
  const requiresVerifiedEmail = requiresVerifiedViewerEmail({
    emailVerification: link.email_verification,
    ndaGate: link.nda_gate,
    collectEmailForAnalytics: link.collect_email_for_analytics,
    dynamicWatermarkEmail: link.apply_watermark && link.dynamic_watermark_email,
    allowlistActive: allowlistStatus.isActive || alcActive,
  });

  if (requiresVerifiedEmail && !normalizedScopedEmail) {
    return NextResponse.json(
      {
        error: "Email verification required",
        code: "EMAIL_OTP_REQUIRED",
        public_language: publicLanguage,
      },
      { status: 401 },
    );
  }
  if (allowlistStatus.isActive && allowlistStatus.emailBlocked === true) {
    return NextResponse.json(
      {
        error: "Email not allowed",
        code: "EMAIL_NOT_ALLOWED",
        public_language: publicLanguage,
      },
      { status: 403 },
    );
  }
  if (
    !alcActive &&
    allowlistStatus.isActive &&
    allowlistStatus.emailAllowed === false
  ) {
    return NextResponse.json(
      {
        error: "Email not allowed",
        code: "EMAIL_NOT_ALLOWED",
        public_language: publicLanguage,
      },
      { status: 403 },
    );
  }

  const alcSeeds =
    alcActive && normalizedScopedEmail
      ? await fetchLinkAlcViewerSeeds(supabase, {
          linkId,
          workspaceId: link.workspace_id,
          viewerEmail: normalizedScopedEmail,
        }).catch((error) => {
          console.error("[Resolve Data Room Doc] Failed to evaluate ALC", {
            linkId,
            workspaceId: link.workspace_id,
            error,
          });
          return null;
        })
      : null;

  if (alcActive && (!alcSeeds || isAlcSeedEmpty(alcSeeds))) {
    return NextResponse.json(
      {
        error: "Access denied",
        code: "ALC_NOT_ALLOWED",
        public_language: publicLanguage,
      },
      { status: 403 },
    );
  }

  if (alcActive && alcSeeds) {
    const { data: folders, error: foldersError } = await supabase
      .from("folders")
      .select("id, parent_folder_id")
      .eq("data_room_id", dataRoomId);

    if (foldersError) {
      console.error("[Resolve Data Room Doc] Failed to load folders for ALC", {
        linkId,
        dataRoomId,
        error: foldersError,
      });
      return NextResponse.json(
        { error: "Access denied", code: "ALC_NOT_ALLOWED" },
        { status: 403 },
      );
    }

    const { allowedDocumentIds } = filterDataRoomContentByAlc({
      folders: (folders ?? []) as Array<{
        id: string;
        parent_folder_id: string | null;
      }>,
      documents: [
        {
          id: documentId,
          folder_id:
            (document as { folder_id?: string | null }).folder_id ?? null,
        },
      ],
      roomAllowed: alcSeeds.roomAllowed,
      allowedFolderSeedIds: alcSeeds.allowedFolderSeedIds,
      allowedDocumentSeedIds: alcSeeds.allowedDocumentSeedIds,
    });

    if (!allowedDocumentIds.has(documentId)) {
      return NextResponse.json(
        {
          error: "Access denied",
          code: "ALC_NOT_ALLOWED",
          public_language: publicLanguage,
        },
        { status: 403 },
      );
    }
  }

  if (link.nda_gate) {
    if (!dataRoomVerifiedEmail) {
      return buildNdaGateResponse(
        supabase,
        link,
        "Email verification required for NDA",
        "NDA_SIGN_REQUIRED",
        publicLanguage,
        dataRoomVerifiedEmail,
      );
    }
    const { data: sig } = await supabase
      .from("nda_signatures")
      .select("id, signed_pdf_path")
      .eq("link_id", linkId)
      .eq("email", dataRoomVerifiedEmail)
      .maybeSingle();
    if (!sig) {
      return buildNdaGateResponse(
        supabase,
        link,
        "NDA signature required",
        "NDA_SIGN_REQUIRED",
        publicLanguage,
        dataRoomVerifiedEmail,
      );
    }
    if (!sig.signed_pdf_path) {
      return buildNdaGateResponse(
        supabase,
        link,
        "Signed NDA is being prepared",
        "NDA_PDF_PENDING",
        publicLanguage,
        dataRoomVerifiedEmail,
      );
    }
  }

  const bandwidthLimitResponse = await enforceBandwidthLimit(
    link.workspace_id,
    publicLanguage,
  );
  if (bandwidthLimitResponse) {
    return bandwidthLimitResponse;
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", link.workspace_id)
    .maybeSingle();
  if (workspaceError) {
    console.error(
      "[Resolve Data Room Doc] Workspace lookup failed",
      workspaceError,
    );
  }

  const brandingHeader = await buildBrandingHeader(
    supabase,
    link.workspace_id,
    domainVerified,
    verifiedDomainHost,
  );

  const response = NextResponse.json({
    link: buildResolvedLinkPayload(link, publicLanguage),
    document: {
      id: document.id,
      title: document.title,
      file_type: document.file_type,
      num_pages: document.num_pages,
      storage_path: document.storage_path,
      converted_storage_path: document.converted_storage_path,
      conversion_status: document.conversion_status,
    },
    workspace_name: workspace?.name || "",
    workspace_id: link.workspace_id,
    verified_email: verifiedEmail,
    branding_header: brandingHeader,
    public_language: publicLanguage,
  });

  setAccessCookie(response, "document", documentId, linkId);
  setAccessCookie(response, "data_room", dataRoomId, linkId);
  if (document.storage_path) {
    setVersionCookie(
      response,
      "document",
      documentId,
      linkId,
      document.storage_path,
    );
  }
  if (
    !hasConsumedOpenOnceAccess &&
    !(await consumeOpenOnceLink(supabase, link))
  ) {
    return openOnceAlreadyConsumedResponse(publicLanguage);
  }
  return response;
};
