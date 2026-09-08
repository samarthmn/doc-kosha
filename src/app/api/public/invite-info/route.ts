import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

const QuerySchema = z.object({
  invite: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      invite: url.searchParams.get("invite"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
    }

    const admin = createSupabaseServiceClient();
    const { data, error } = await admin
      .from("workspace_invites")
      .select(
        "id, email, expires_at, accepted_at, revoked_at, documents_access, data_rooms_access_all, workspace:workspaces(name)",
      )
      .eq("id", parsed.data.invite)
      .maybeSingle();

    if (error) {
      console.error("[public-invite-info] database error", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (
      data.revoked_at ||
      data.accepted_at ||
      (data.expires_at && new Date(data.expires_at).getTime() < Date.now())
    ) {
      return NextResponse.json(
        { error: "Invite no longer valid" },
        { status: 410 },
      );
    }

    return NextResponse.json({
      inviteId: data.id,
      workspaceName: data.workspace?.name ?? null,
      email: data.email,
      documentsAccess: data.documents_access ?? "none",
      dataRoomsAccessAll: data.data_rooms_access_all ?? "none",
    });
  } catch (err) {
    console.error("[public-invite-info] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
