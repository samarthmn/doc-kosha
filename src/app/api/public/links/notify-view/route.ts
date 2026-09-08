import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  getAccessCookieKey,
  type AccessCookiePayload,
} from "@/server/cookieConstants";
import { verifyCookie } from "@/server/cookieHelper";
import { claimEmailDelivery, sendClaimedEmail } from "@/server/emailDeliveries";
import { buildDocumentViewedEmail } from "@/server/emails/templates";
import { getPublicLinkAvailabilityError } from "@/server/publicLinkAvailability";
import { consumeRateLimit } from "@/server/rateLimit";
import {
  getViewNotificationDedupeKey,
  verifyViewNotificationToken,
} from "@/server/viewNotification";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";

const NotifyRequestSchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
  viewToken: z.string().min(1).max(2_048),
});

const hasValidAccessCookie = (
  req: NextRequest,
  linkId: string,
  documentId: string,
): boolean => {
  const cookieName = getAccessCookieKey("document", documentId, linkId);
  const cookieValue = req.cookies.get(cookieName)?.value;
  const payload = cookieValue
    ? verifyCookie<AccessCookiePayload>(cookieValue)
    : null;

  return Boolean(
    payload &&
    payload.resourceType === "document" &&
    payload.resourceId === documentId &&
    payload.linkId === linkId,
  );
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const parsed = NotifyRequestSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { linkId, documentId, viewToken } = parsed.data;
    const supabase = createSupabaseServiceClient();

    const { data: link } = await supabase
      .from("links")
      .select(
        "email_notify, created_by, workspace_id, open_once, revoked_at, expires_at",
      )
      .eq("id", linkId)
      .eq("document_id", documentId)
      .maybeSingle();

    if (!link) {
      return NextResponse.json(
        { error: "Link not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const availabilityError = getPublicLinkAvailabilityError(link);
    if (availabilityError) {
      const { status, ...payload } = availabilityError;
      return NextResponse.json(payload, { status });
    }

    if (!hasValidAccessCookie(req, linkId, documentId)) {
      return NextResponse.json(
        { error: "Access required", code: "ACCESS_REQUIRED" },
        { status: 401 },
      );
    }

    const verifiedView = verifyViewNotificationToken(viewToken, {
      linkId,
      documentId,
    });
    if (!verifiedView) {
      return NextResponse.json(
        { error: "View confirmation required", code: "VIEW_REQUIRED" },
        { status: 401 },
      );
    }

    if (!link.email_notify) {
      return NextResponse.json({ success: true, notified: false });
    }

    const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
    if (!hasEntitlement) {
      return NextResponse.json(
        { error: "Link not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const [hourlyLimit, dailyLimit] = await Promise.all([
      consumeRateLimit(supabase, {
        bucket: "view_notification_link_hour",
        identifier: linkId,
        limit: 50,
        windowSeconds: 60 * 60,
      }),
      consumeRateLimit(supabase, {
        bucket: "view_notification_link_day",
        identifier: linkId,
        limit: 200,
        windowSeconds: 24 * 60 * 60,
      }),
    ]);
    if (!hourlyLimit.allowed || !dailyLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }

    const [{ data: doc }, { data: workspace }] = await Promise.all([
      supabase
        .from("documents")
        .select("title")
        .eq("id", documentId)
        .maybeSingle(),
      supabase
        .from("workspaces")
        .select("created_by")
        .eq("id", link.workspace_id)
        .maybeSingle(),
    ]);

    const recipientIds = new Set<string>([link.created_by]);
    if (workspace?.created_by) recipientIds.add(workspace.created_by);

    const recipients = (
      await Promise.all(
        Array.from(recipientIds).map(async (userId) => {
          const { data, error } = await supabase.auth.admin.getUserById(userId);
          const email = data.user?.email?.trim();
          if (error || !email) return null;
          return { userId, email };
        }),
      )
    ).filter(
      (recipient): recipient is { userId: string; email: string } =>
        recipient !== null,
    );

    const analyticsLink = `${
      process.env.NEXT_PUBLIC_APP_URL || "https://dockosha.com"
    }/documents/view/${documentId}/analytics`;
    const viewedEmail = buildDocumentViewedEmail({
      documentTitle: doc?.title || "Document",
      analyticsUrl: analyticsLink,
    });

    let notifiedRecipients = 0;
    for (const recipient of recipients) {
      const claim = await claimEmailDelivery({
        template: "document-viewed",
        toEmail: recipient.email,
        userId: recipient.userId,
        workspaceId: link.workspace_id,
        dedupeKey: getViewNotificationDedupeKey({
          linkId,
          documentId,
          viewerKeyHash: verifiedView.viewerKeyHash,
          recipientUserId: recipient.userId,
        }),
      });
      if (!claim.claimed) continue;

      const sent = await sendClaimedEmail({
        id: claim.id,
        claimToken: claim.token,
        toEmail: recipient.email,
        subject: viewedEmail.subject,
        html: viewedEmail.html,
        text: viewedEmail.text,
      });
      if (sent) notifiedRecipients += 1;
    }

    return NextResponse.json({
      success: true,
      notified: notifiedRecipients > 0,
      recipients: notifiedRecipients,
    });
  } catch (err) {
    console.error("[Notify View API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
