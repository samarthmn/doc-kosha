import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

const BodySchema = z.object({
  inviteId: z.string().uuid(),
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseServiceClient();
    const now = new Date().toISOString();
    const normalizedEmail = normalizeEmail(user.email);

    const { data, error } = await admin
      .from("workspace_invites")
      .update({
        rejected_at: now,
        rejected_by: user.id,
      })
      .eq("id", parsed.data.inviteId)
      .eq("email", normalizedEmail)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .is("rejected_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[onboarding-reject-invite] update failed", error);
      return NextResponse.json(
        { error: "Failed to reject invite" },
        { status: 500 },
      );
    }

    if (!data?.id) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[onboarding-reject-invite] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
