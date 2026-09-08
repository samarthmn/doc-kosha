import { sendAppEmail } from "@/server/emailHelper";
import { buildContactFormEmail } from "@/server/emails/templates";
import { NextResponse } from "next/server";
import { CookieKeys } from "@/types/storage";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { consumeRateLimit, hashRateLimitIdentifier } from "@/server/rateLimit";

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  company: z.string().max(200).optional().or(z.literal("")),
  subject: z.string().max(200).optional().or(z.literal("")),
  message: z.string().min(5).max(5000),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid input" },
        { status: 400 },
      );
    }

    const { name, email, company, subject, message } = parsed.data;
    const rateLimitClient = createSupabaseServiceClient();
    const [emailRateLimit, globalRateLimit] = await Promise.all([
      consumeRateLimit(rateLimitClient, {
        bucket: "contact_form",
        identifier: hashRateLimitIdentifier(email),
        limit: 5,
        windowSeconds: 86_400,
      }),
      consumeRateLimit(rateLimitClient, {
        bucket: "contact_form_global",
        identifier: "all",
        limit: 100,
        windowSeconds: 86_400,
      }),
    ]);

    if (!emailRateLimit.allowed || !globalRateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const contactEmail = buildContactFormEmail({
      name,
      email,
      company,
      subject,
      message,
    });
    await sendAppEmail({
      to: "admin@dockosha.com",
      subject: contactEmail.subject,
      html: contactEmail.html,
      text: contactEmail.text,
    });
    const res = NextResponse.json({ ok: true }, { status: 200 });
    // Gate resubmission for 24 hours; readable on client for UI logic
    res.cookies.set(CookieKeys.ContactFormSubmitted, "1", {
      maxAge: 60 * 60 * 24,
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (error) {
    console.error("[contact] failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
