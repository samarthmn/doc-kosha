import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canReadWorkspace,
  isWorkspaceOwner,
  requireAuthenticatedUser,
} from "@/modules/document-versioning/server/access";
import { isDocumentVersioningError } from "@/modules/document-versioning/server/errors";
import {
  ensureWorkspacePublicSettings,
  updateWorkspaceDefaultPublicLanguage,
} from "@/modules/public-links/server/settings";
import {
  PUBLIC_LANGUAGE_VALUES,
  type PublicLanguage,
} from "@/modules/public-links/types";

const PublicLinksSettingsQuerySchema = z.object({
  workspaceId: z.string().uuid(),
});

const PublicLinksSettingsPatchSchema = z.object({
  workspaceId: z.string().uuid(),
  defaultPublicLanguage: z.enum(PUBLIC_LANGUAGE_VALUES),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const parsed = PublicLinksSettingsQuerySchema.safeParse({
      workspaceId: req.nextUrl.searchParams.get("workspaceId"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const canRead = await canReadWorkspace(parsed.data.workspaceId, user.id);
    if (!canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const owner = await isWorkspaceOwner(parsed.data.workspaceId, user.id);
    const settings = await ensureWorkspacePublicSettings(
      parsed.data.workspaceId,
    );

    return NextResponse.json({
      defaultPublicLanguage: settings.default_public_language as PublicLanguage,
      ownerCapable: owner,
    });
  } catch (error) {
    if (isDocumentVersioningError(error) && error.code === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[settings.public-links.get] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await req.json().catch(() => ({}));
    const parsed = PublicLinksSettingsPatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const owner = await isWorkspaceOwner(parsed.data.workspaceId, user.id);
    if (!owner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const settings = await updateWorkspaceDefaultPublicLanguage({
      workspaceId: parsed.data.workspaceId,
      defaultPublicLanguage: parsed.data.defaultPublicLanguage,
      updatedBy: user.id,
    });

    return NextResponse.json({
      defaultPublicLanguage: settings.default_public_language as PublicLanguage,
      ownerCapable: true,
    });
  } catch (error) {
    if (isDocumentVersioningError(error) && error.code === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[settings.public-links.patch] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
