import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { sendAuthEmail } from "@/server/emailHelper";
import { buildLinkOtpEmail } from "@/server/emails/templates";
import { signVerifiedEmailCookie } from "@/server/cookieHelper";
import {
  getEmailCookieKey,
  type PublicResourceType,
} from "@/server/cookieConstants";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { z } from "zod";
import {
  fetchLinkAllowlistStatus,
  normalizeViewerEmail,
} from "@/server/linkAllowlist";
import { isLinkAlcActive } from "@/server/linkAlc";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { resolveEffectivePublicLanguage } from "@/modules/public-links/server/settings";
import { consumeRateLimit, hashRateLimitIdentifier } from "@/server/rateLimit";

const OTPRequestSchema = z
  .object({
    action: z.enum(["send", "verify"]),
    linkId: z.string().uuid(),
    documentId: z.string().uuid().optional(),
    dataRoomId: z.string().uuid().optional(),
    email: z.string().email(),
    code: z.string().optional(),
  })
  .refine(
    (value) =>
      (value.documentId && !value.dataRoomId) ||
      (!value.documentId && value.dataRoomId),
    {
      message: "Provide exactly one resource identifier",
      path: ["documentId"],
    },
  );

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

const invalidOtpResponse = (): NextResponse =>
  NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = OTPRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { action, linkId, documentId, dataRoomId, email, code } = parsed.data;
    const resourceType: PublicResourceType = documentId
      ? "document"
      : "data_room";
    const resourceId = documentId ?? (dataRoomId as string);
    const resourceColumn = documentId ? "document_id" : "data_room_id";
    const normalizedEmail = normalizeViewerEmail(email);

    const supabase = createSupabaseServiceClient();

    // Verify link exists
    const { data: link } = await supabase
      .from("links")
      .select(
        "id, document_id, data_room_id, workspace_id, public_language_override",
      )
      .eq("id", linkId)
      .eq(resourceColumn, resourceId)
      .maybeSingle();
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    const locale = await resolveEffectivePublicLanguage({
      workspaceId: link.workspace_id,
      linkPublicLanguageOverride: link.public_language_override,
    });

    const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
    if (!hasEntitlement) {
      return NextResponse.json(
        { error: "Link not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const allowlistStatus = await fetchLinkAllowlistStatus(
      supabase,
      linkId,
      normalizedEmail,
    );
    const alcActive =
      resourceType === "data_room"
        ? await isLinkAlcActive(supabase, linkId)
        : false;

    if (alcActive) {
      // ALC ignores allowlist but keeps blocklist as a hard deny.
      if (allowlistStatus.isActive && allowlistStatus.emailBlocked === true) {
        return NextResponse.json(
          {
            error: "Email not allowed for this link",
            code: "EMAIL_NOT_ALLOWED",
          },
          { status: 403 },
        );
      }
    } else {
      if (allowlistStatus.isActive && allowlistStatus.emailAllowed === false) {
        return NextResponse.json(
          {
            error: "Email not allowed for this link",
            code: "EMAIL_NOT_ALLOWED",
          },
          { status: 403 },
        );
      }
    }
    const emailForOtp = allowlistStatus.normalizedEmail ?? normalizedEmail;

    if (action === "send") {
      const [emailRateLimit, linkRateLimit] = await Promise.all([
        consumeRateLimit(supabase, {
          bucket: "otp_send_email",
          identifier: `${linkId}:${hashRateLimitIdentifier(email)}`,
          limit: 5,
          windowSeconds: 900,
        }),
        // Per-link cap exists only to bound mail-provider abuse from a single
        // link, so it must clear real onboarding: a large dealroom can send
        // hundreds of first-time codes within an hour. The per-(link,email)
        // cap above is the guard that actually stops inbox-bombing one person.
        consumeRateLimit(supabase, {
          bucket: "otp_send_link",
          identifier: linkId,
          limit: 300,
          windowSeconds: 3600,
        }),
      ]);
      if (!emailRateLimit.allowed || !linkRateLimit.allowed) {
        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429 },
        );
      }

      // Generate 6-digit code
      const otpCode = randomInt(100000, 999999).toString();
      const codeHash = createHash("sha256").update(otpCode).digest("hex");
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

      // Upsert OTP record (delete old, insert new)
      await supabase
        .from("email_otps")
        .delete()
        .eq("link_id", linkId)
        .eq("email", emailForOtp)
        .eq(resourceColumn, resourceId)
        .eq("purpose", "view");

      const { error: insertError } = await supabase.from("email_otps").insert({
        document_id: documentId ?? null,
        data_room_id: dataRoomId ?? null,
        link_id: linkId,
        email: emailForOtp,
        purpose: "view",
        code_hash: codeHash,
        expires_at: expiresAt,
        consumed_at: null,
      });

      if (insertError) {
        console.error("[OTP] Insert failed:", insertError);
        return NextResponse.json(
          { error: "Failed to generate OTP" },
          { status: 500 },
        );
      }

      try {
        const otpEmail = buildLinkOtpEmail({
          code: otpCode,
          expiryMinutes: Math.round(OTP_EXPIRY_MS / 60000),
          locale,
        });
        await sendAuthEmail({
          to: email,
          subject: otpEmail.subject,
          html: otpEmail.html,
          text: otpEmail.text,
        });
      } catch (err) {
        console.error("[OTP] Email send failed:", err);
        return NextResponse.json(
          { error: "Failed to send email" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === "verify") {
      if (!code) {
        return NextResponse.json({ error: "Code required" }, { status: 400 });
      }

      const verifyRateLimit = await consumeRateLimit(supabase, {
        bucket: "otp_verify",
        identifier: `${linkId}:${hashRateLimitIdentifier(email)}`,
        limit: 15,
        windowSeconds: 900,
      });
      if (!verifyRateLimit.allowed) {
        return invalidOtpResponse();
      }

      const codeHash = createHash("sha256").update(code).digest("hex");

      // Find valid OTP
      const { data: otp } = await supabase
        .from("email_otps")
        .select("id, code_hash, attempts")
        .eq("link_id", linkId)
        .eq(resourceColumn, resourceId)
        .eq("email", emailForOtp)
        .eq("purpose", "view")
        .is("consumed_at", null)
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!otp) {
        return invalidOtpResponse();
      }

      const { data: attemptedOtp } = await supabase
        .from("email_otps")
        .update({ attempts: otp.attempts + 1 })
        .eq("id", otp.id)
        .eq("attempts", otp.attempts)
        .select("attempts")
        .maybeSingle();
      if (!attemptedOtp || attemptedOtp.attempts > 5) {
        return invalidOtpResponse();
      }

      const codeMatches = timingSafeEqual(
        Buffer.from(codeHash, "hex"),
        Buffer.from(otp.code_hash, "hex"),
      );
      if (!codeMatches) {
        return invalidOtpResponse();
      }

      // Mark consumed
      await supabase
        .from("email_otps")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", otp.id);

      // Set signed cookie
      const cookieName = getEmailCookieKey(resourceType, resourceId, linkId);
      const payload = {
        email: emailForOtp,
        resourceType,
        resourceId,
        linkId,
        exp: Date.now() + COOKIE_MAX_AGE * 1000,
      };
      const cookieValue = signVerifiedEmailCookie(payload);

      const response = NextResponse.json({ success: true, email: emailForOtp });
      response.cookies.set(cookieName, cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
      });

      return response;
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[OTP API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
