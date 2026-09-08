import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { sendAppEmail } from "@/server/emailHelper";
import { buildDataRequestEmail } from "@/server/emails/templates";
import { CookieKeys } from "@/types/storage";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { consumeRateLimit, hashRateLimitIdentifier } from "@/server/rateLimit";

const dataRequestSchema = z.object({
  requestType: z.enum([
    "access",
    "correction",
    "deletion",
    "export",
    "consent_withdrawal",
    "other",
  ]),
  email: z.string().email().optional(),
  details: z.string().min(10).max(2000),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = dataRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { requestType, details, email } = parsed.data;
    const resolvedEmail = user?.email ?? email ?? null;

    if (!resolvedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const rateLimitClient = createSupabaseServiceClient();
    const [emailRateLimit, globalRateLimit] = await Promise.all([
      consumeRateLimit(rateLimitClient, {
        bucket: "data_request",
        identifier: hashRateLimitIdentifier(resolvedEmail),
        limit: 5,
        windowSeconds: 86_400,
      }),
      consumeRateLimit(rateLimitClient, {
        bucket: "data_request_global",
        identifier: "all",
        limit: 100,
        windowSeconds: 86_400,
      }),
    ]);

    if (!emailRateLimit.allowed || !globalRateLimit.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const dataRequestEmail = buildDataRequestEmail({
      requestType,
      email: resolvedEmail,
      userId: user?.id ?? null,
      details,
    });

    await sendAppEmail({
      to: "admin@dockosha.com",
      subject: dataRequestEmail.subject,
      html: dataRequestEmail.html,
      text: dataRequestEmail.text,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(CookieKeys.DataRequestSubmitted, "1", {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (error) {
    console.error("[data-request] failed", error);
    return NextResponse.json(
      { error: "Failed to submit request" },
      { status: 500 },
    );
  }
}
