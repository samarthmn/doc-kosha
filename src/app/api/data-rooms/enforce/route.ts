import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { syncWorkspaceDataRoomLimits } from "@/modules/billing/workspaceLimitEnforcer";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId } = parsed.data;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("created_by")
      .eq("id", workspaceId)
      .maybeSingle();

    if (workspaceError || !workspace || workspace.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await syncWorkspaceDataRoomLimits(workspaceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[data-rooms/enforce] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
