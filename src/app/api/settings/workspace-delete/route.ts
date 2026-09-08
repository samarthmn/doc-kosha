import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  deleteWorkspaceById,
  WorkspaceDeletionError,
} from "@/modules/settings/server/workspaceDeletion";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  confirmationName: z.string().min(1),
});

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, confirmationName } = parsed.data;

    // 1. Authenticate user
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify user has owner-level access for this workspace
    const { data: isOwner, error: ownerCheckError } = await supabase.rpc(
      "has_workspace_role",
      { ws: workspaceId, roles: ["owner", "co-owner"] },
    );
    if (ownerCheckError || !isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createSupabaseServiceClient();

    // 3. Get workspace name for confirmation check
    const { data: workspace, error: wsError } = await admin
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle();

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 },
      );
    }

    // 4. Verify confirmation name matches (case-insensitive trim comparison)
    const normalizedWorkspaceName = workspace.name.trim().toLowerCase();
    const normalizedConfirmation = confirmationName.trim().toLowerCase();
    if (normalizedWorkspaceName !== normalizedConfirmation) {
      return NextResponse.json(
        { error: "Confirmation name does not match workspace name" },
        { status: 400 },
      );
    }

    const result = await deleteWorkspaceById({
      workspaceId,
      userEmail: user.email ?? null,
      admin,
    });

    return NextResponse.json({
      success: true,
      message: "Workspace deleted successfully",
      storage: {
        objectsDeleted: result.objectsDeleted,
      },
    });
  } catch (err) {
    if (err instanceof WorkspaceDeletionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[workspace-delete] Unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
