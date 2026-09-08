import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  deleteWorkspaceById,
  WorkspaceDeletionError,
} from "@/modules/settings/server/workspaceDeletion";

const RequestSchema = z.object({
  confirmation: z.string().min(1),
});

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expectedConfirmation = user.email?.trim().toLowerCase() || "delete";
    const normalizedConfirmation = parsed.data.confirmation
      .trim()
      .toLowerCase();
    if (normalizedConfirmation !== expectedConfirmation) {
      return NextResponse.json(
        {
          error: user.email
            ? "Confirmation value must match your account email."
            : "Type DELETE to confirm account deletion.",
        },
        { status: 400 },
      );
    }

    const admin = createSupabaseServiceClient();
    const { data: ownedWorkspaces, error: ownedWorkspacesError } = await admin
      .from("workspaces")
      .select("id")
      .eq("created_by", user.id);

    if (ownedWorkspacesError) {
      console.error(
        "[account-delete] Failed to fetch owned workspaces",
        ownedWorkspacesError,
      );
      return NextResponse.json(
        { error: "Failed to prepare account deletion" },
        { status: 500 },
      );
    }

    let deletedWorkspaceCount = 0;
    let deletedStorageObjects = 0;
    const failedWorkspaces: Array<{ workspaceId: string; error: string }> = [];
    for (const workspace of ownedWorkspaces ?? []) {
      try {
        const result = await deleteWorkspaceById({
          workspaceId: workspace.id,
          userEmail: user.email ?? null,
          admin,
          isAccountDeletion: true,
        });
        deletedWorkspaceCount += 1;
        deletedStorageObjects += result.objectsDeleted;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown workspace deletion error";
        failedWorkspaces.push({
          workspaceId: workspace.id,
          error: message,
        });
        console.error(
          "[account-delete] Failed to delete owned workspace",
          { workspaceId: workspace.id },
          err,
        );
      }
    }

    if (failedWorkspaces.length > 0) {
      console.error("[account-delete] Aborting account deletion: failures", {
        userId: user.id,
        failedWorkspaces,
      });
      return NextResponse.json(
        {
          error:
            "Failed to delete all owned workspaces. Account deletion was aborted. Please retry.",
          summary: {
            deletedWorkspaceCount,
            deletedStorageObjects,
          },
          failedWorkspaces: failedWorkspaces.map((f) => f.workspaceId),
        },
        { status: 500 },
      );
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(
      user.id,
    );
    if (deleteUserError) {
      console.error(
        "[account-delete] Failed to delete auth user",
        deleteUserError,
      );
      return NextResponse.json(
        { error: "Failed to delete account. Please retry." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Account deleted successfully",
      summary: {
        deletedWorkspaceCount,
        deletedStorageObjects,
      },
    });
  } catch (err) {
    if (err instanceof WorkspaceDeletionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[account-delete] Unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
