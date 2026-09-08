import { NextRequest, NextResponse } from "next/server";
import {
  documentVersioningSettingsPatchSchema,
  documentVersioningSettingsQuerySchema,
  getRetentionSettings,
  updateRetentionSettings,
} from "@/modules/document-versioning";
import {
  canReadWorkspace,
  isWorkspaceOwner,
  requireAuthenticatedUser,
} from "@/modules/document-versioning/server/access";
import { isDocumentVersioningError } from "@/modules/document-versioning/server/errors";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();

    const searchParams = req.nextUrl.searchParams;
    const parsed = documentVersioningSettingsQuerySchema.safeParse({
      workspaceId: searchParams.get("workspaceId"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const canRead = await canReadWorkspace(parsed.data.workspaceId, user.id);
    if (!canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const owner = await isWorkspaceOwner(parsed.data.workspaceId, user.id);
    const settings = await getRetentionSettings(parsed.data.workspaceId);

    return NextResponse.json({
      maxPreviousVersions: settings.maxPreviousVersions,
      ownerCapable: owner && !settings.planLocked,
      upgradeRequired: settings.planLocked,
    });
  } catch (error) {
    if (isDocumentVersioningError(error) && error.code === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[settings.document-versioning.get] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();

    const body = await req.json().catch(() => ({}));
    const parsed = documentVersioningSettingsPatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const owner = await isWorkspaceOwner(parsed.data.workspaceId, user.id);
    if (!owner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await updateRetentionSettings({
      workspaceId: parsed.data.workspaceId,
      maxPreviousVersions: parsed.data.maxPreviousVersions,
      updatedBy: user.id,
      dryRun: parsed.data.dryRun,
      confirmToken: parsed.data.confirmToken,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isDocumentVersioningError(error) && error.code === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.name === "CONFIRMATION_REQUIRED") {
      return NextResponse.json(
        { error: "Type DELETE to confirm pruning older versions." },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.name === "PLAN_UPGRADE_REQUIRED") {
      return NextResponse.json(
        {
          error:
            "Version history settings require a paid plan. Upgrade to Essential to retain and restore previous versions.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }

    console.error(
      "[settings.document-versioning.patch] unexpected error",
      error,
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
