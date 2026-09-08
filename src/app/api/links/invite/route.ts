import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { clientEnv } from "@/lib/env";
import { sendAppEmail } from "@/server/emailHelper";
import { buildLinkInviteEmail } from "@/server/emails/templates";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { canUseCustomDomain } from "@/modules/custom-domains/entitlements";
import type { Tables } from "@/types/generated/supabase";
import {
  buildShortSharePath,
  resolveCustomLinkSlug,
} from "@/lib/publicLinkPaths";
import { resolveEffectivePublicLanguage } from "@/modules/public-links/server/settings";

const InviteRequestSchema = z.object({
  linkId: z.string().uuid(),
  resourceType: z.enum(["document", "data_room"]).optional(),
  resourceId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = InviteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const {
      linkId,
      resourceId: inputResourceId,
      resourceType: inputType,
    } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: link, error: linkError } = await supabase
      .from("links")
      .select(
        "id, workspace_id, document_id, data_room_id, name, expires_at, revoked_at, short_code, custom_slug, public_language_override",
      )
      .eq("id", linkId)
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    const { data: canEdit, error: canEditError } = link.data_room_id
      ? await supabase.rpc("can_edit_data_room", {
          ws: link.workspace_id,
          room_id: link.data_room_id,
        })
      : await supabase.rpc("can_edit_workspace_documents", {
          ws: link.workspace_id,
        });

    if (canEditError || !canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = Date.now();
    if (link.revoked_at) {
      return NextResponse.json(
        { error: "Link has been revoked" },
        { status: 410 },
      );
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < now) {
      return NextResponse.json({ error: "Link has expired" }, { status: 410 });
    }

    let resourceType = inputType;
    let resourceId = inputResourceId;
    if (!resourceType || !resourceId) {
      if (link.document_id) {
        resourceType = "document";
        resourceId = link.document_id;
      } else if (link.data_room_id) {
        resourceType = "data_room";
        resourceId = link.data_room_id;
      }
    }
    if (!resourceType || !resourceId) {
      return NextResponse.json(
        { error: "Unable to resolve linked resource" },
        { status: 400 },
      );
    }
    if (resourceType !== "document" && resourceType !== "data_room") {
      return NextResponse.json(
        { error: "Invalid resource type" },
        { status: 400 },
      );
    }
    if (resourceType === "document" && link.document_id !== resourceId) {
      return NextResponse.json({ error: "Resource mismatch" }, { status: 400 });
    }
    if (resourceType === "data_room" && link.data_room_id !== resourceId) {
      return NextResponse.json({ error: "Resource mismatch" }, { status: 400 });
    }

    const [
      { data: blockedEmailRows, error: blockedEmailError },
      { data: blockedGroupRows, error: blockedGroupError },
    ] = await Promise.all([
      supabase
        .from("link_blocked_emails")
        .select("email")
        .eq("link_id", linkId),
      supabase
        .from("link_blocked_groups")
        .select("group_id")
        .eq("link_id", linkId),
    ]);

    if (blockedEmailError || blockedGroupError) {
      console.error("[links.invite] blocklist fetch failed", {
        blockedEmailError,
        blockedGroupError,
      });
      return NextResponse.json(
        { error: "Failed to load link recipients" },
        { status: 500 },
      );
    }

    let normalizedAllowedEmails: string[] = [];
    let allowedGroupIds: string[] = [];
    let usedAlcRecipients = false;

    if (resourceType === "data_room") {
      const [
        { data: alcRoomEmailRows, error: alcRoomEmailError },
        { data: alcRoomGroupRows, error: alcRoomGroupError },
        { data: alcFolderEmailRows, error: alcFolderEmailError },
        { data: alcFolderGroupRows, error: alcFolderGroupError },
        { data: alcDocEmailRows, error: alcDocEmailError },
        { data: alcDocGroupRows, error: alcDocGroupError },
      ] = await Promise.all([
        supabase
          .from("link_alc_allowed_emails")
          .select("email")
          .eq("link_id", linkId),
        supabase
          .from("link_alc_allowed_groups")
          .select("group_id")
          .eq("link_id", linkId),
        supabase
          .from("link_alc_allowed_folders_emails")
          .select("email")
          .eq("link_id", linkId),
        supabase
          .from("link_alc_allowed_folders_groups")
          .select("group_id")
          .eq("link_id", linkId),
        supabase
          .from("link_alc_allowed_documents_emails")
          .select("email")
          .eq("link_id", linkId),
        supabase
          .from("link_alc_allowed_documents_groups")
          .select("group_id")
          .eq("link_id", linkId),
      ]);

      const anyAlcError =
        alcRoomEmailError ||
        alcRoomGroupError ||
        alcFolderEmailError ||
        alcFolderGroupError ||
        alcDocEmailError ||
        alcDocGroupError;

      if (anyAlcError) {
        console.error("[links.invite] ALC recipient fetch failed", {
          alcRoomEmailError,
          alcRoomGroupError,
          alcFolderEmailError,
          alcFolderGroupError,
          alcDocEmailError,
          alcDocGroupError,
        });
        return NextResponse.json(
          { error: "Failed to load link recipients" },
          { status: 500 },
        );
      }

      const alcAllowedEmails = [
        ...((alcRoomEmailRows ?? []) as Array<{ email?: string | null }>),
        ...((alcFolderEmailRows ?? []) as Array<{ email?: string | null }>),
        ...((alcDocEmailRows ?? []) as Array<{ email?: string | null }>),
      ]
        .map((row) => (row.email || "").trim().toLowerCase())
        .filter((email) => !!email);

      const alcAllowedGroupIds = [
        ...((alcRoomGroupRows ?? []) as Array<{ group_id?: string | null }>),
        ...((alcFolderGroupRows ?? []) as Array<{ group_id?: string | null }>),
        ...((alcDocGroupRows ?? []) as Array<{ group_id?: string | null }>),
      ]
        .map((row) => (row.group_id || "").trim())
        .filter((groupId) => !!groupId);

      usedAlcRecipients =
        alcAllowedEmails.length > 0 || alcAllowedGroupIds.length > 0;

      if (usedAlcRecipients) {
        normalizedAllowedEmails = alcAllowedEmails;
        allowedGroupIds = alcAllowedGroupIds;
      }
    }

    if (!usedAlcRecipients) {
      const [
        { data: allowedEmailRows, error: allowedEmailError },
        { data: allowedGroupRows, error: allowedGroupError },
      ] = await Promise.all([
        supabase
          .from("link_allowed_emails")
          .select("email")
          .eq("link_id", linkId),
        supabase
          .from("link_allowed_groups")
          .select("group_id")
          .eq("link_id", linkId),
      ]);

      if (allowedEmailError || allowedGroupError) {
        console.error("[links.invite] allowlist fetch failed", {
          allowedEmailError,
          allowedGroupError,
        });
        return NextResponse.json(
          { error: "Failed to load link recipients" },
          { status: 500 },
        );
      }

      allowedGroupIds = (
        (allowedGroupRows ?? []) as Array<{
          group_id?: string | null;
        }>
      )
        .map((row) => row.group_id ?? "")
        .filter((groupId) => !!groupId);

      normalizedAllowedEmails = (
        (allowedEmailRows ?? []) as Array<{
          email?: string | null;
        }>
      )
        .map((row) => (row.email || "").trim().toLowerCase())
        .filter((email) => !!email);
    }

    const blockedGroupIds = (
      (blockedGroupRows ?? []) as Array<{
        group_id?: string | null;
      }>
    )
      .map((row) => row.group_id ?? "")
      .filter((groupId) => !!groupId);

    let allowedGroupEmailRows: Array<{ email?: string | null }> = [];
    if (allowedGroupIds.length > 0) {
      const { data, error } = await supabase
        .from("workspace_user_group_emails")
        .select("email")
        .eq("workspace_id", link.workspace_id)
        .in("group_id", allowedGroupIds);
      if (error) {
        console.error("[links.invite] allowed group expansion failed", error);
        return NextResponse.json(
          { error: "Failed to expand allowlist groups" },
          { status: 500 },
        );
      }
      allowedGroupEmailRows = (data ?? []) as Array<{ email?: string | null }>;
    }

    let blockedGroupEmailRows: Array<{ email?: string | null }> = [];
    if (blockedGroupIds.length > 0) {
      const { data, error } = await supabase
        .from("workspace_user_group_emails")
        .select("email")
        .eq("workspace_id", link.workspace_id)
        .in("group_id", blockedGroupIds);
      if (error) {
        console.error("[links.invite] blocked group expansion failed", error);
        return NextResponse.json(
          { error: "Failed to expand blocklist groups" },
          { status: 500 },
        );
      }
      blockedGroupEmailRows = (data ?? []) as Array<{ email?: string | null }>;
    }

    normalizedAllowedEmails = [
      ...normalizedAllowedEmails,
      ...allowedGroupEmailRows
        .map((row) => (row.email || "").trim().toLowerCase())
        .filter((email) => !!email),
    ];

    const blockedEmailSet = new Set(
      [
        ...((blockedEmailRows ?? []) as Array<{ email?: string | null }>),
        ...blockedGroupEmailRows,
      ]
        .map((row) => (row.email || "").trim().toLowerCase())
        .filter((email) => !!email),
    );

    const emails = Array.from(new Set(normalizedAllowedEmails)).filter(
      (email) => !blockedEmailSet.has(email),
    );

    if (emails.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    let resourceName = link.name || "DocKosha resource";
    let workspaceName = "";
    let sharePath = "";
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", link.workspace_id)
      .maybeSingle();
    if (workspaceError) {
      console.error("[links.invite] workspace lookup failed", workspaceError);
    } else {
      workspaceName = workspace?.name ?? "";
    }
    if (resourceType === "document") {
      const { data: document, error: docError } = await supabase
        .from("documents")
        .select("title")
        .eq("id", resourceId)
        .maybeSingle();
      if (docError) {
        console.error("[links.invite] document lookup failed", docError);
      }
      if (document?.title) {
        resourceName = document.title;
      }
      sharePath = `/d/${resourceId}/${linkId}`;
    } else {
      const { data: room, error: roomError } = await supabase
        .from("data_rooms")
        .select("name")
        .eq("id", resourceId)
        .maybeSingle();
      if (roomError) {
        console.error("[links.invite] data room lookup failed", roomError);
      }
      if (room?.name) {
        resourceName = room.name;
      }
    }

    const shareSlug = resolveCustomLinkSlug(link);
    if (workspaceName && shareSlug) {
      sharePath = buildShortSharePath(workspaceName, shareSlug);
    } else if (resourceType === "document") {
      sharePath = `/d/${resourceId}/${linkId}`;
    } else {
      sharePath = `/r/${resourceId}/${linkId}`;
    }

    // Determine the base URL - use custom domain if available
    let baseUrl = clientEnv.NEXT_PUBLIC_APP_URL;
    try {
      // Check if workspace has custom domains enabled
      const { data: subscriptionRow } = await supabase
        .from("workspace_subscriptions")
        .select("*")
        .eq("workspace_id", link.workspace_id)
        .maybeSingle();
      const subscription = mapWorkspaceSubscriptionRow(
        subscriptionRow as Tables<"workspace_subscriptions"> | null,
      );

      // Read the workspace's configured active custom domain.
      if (canUseCustomDomain(subscription)) {
        // Load active custom domain
        const { data: ws } = await supabase
          .from("workspaces")
          .select("active_custom_domain_id")
          .eq("id", link.workspace_id)
          .maybeSingle();
        const domainId = (
          ws as { active_custom_domain_id?: string | null } | null
        )?.active_custom_domain_id;

        if (domainId) {
          const { data: cd } = await supabase
            .from("custom_domains")
            .select("domain,status")
            .eq("id", domainId)
            .maybeSingle();
          const row = cd as { domain?: string | null; status?: string } | null;
          if (row?.status === "verified" && row?.domain) {
            baseUrl = `https://${row.domain}`;
          }
        }
      }
    } catch (error) {
      console.error("[links.invite] custom domain lookup failed", error);
      // Fall back to default app URL
    }

    const shareUrl = new URL(sharePath, baseUrl);
    const locale = await resolveEffectivePublicLanguage({
      workspaceId: link.workspace_id,
      linkPublicLanguageOverride: link.public_language_override,
    });
    const inviteEmail = buildLinkInviteEmail({
      resourceName,
      resourceType,
      shareUrl: shareUrl.toString(),
      expiresAt: link.expires_at,
      locale,
    });

    let sent = 0;
    let failed = 0;
    for (const email of emails) {
      try {
        await sendAppEmail({
          to: email,
          subject: inviteEmail.subject,
          html: inviteEmail.html,
          text: inviteEmail.text,
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error("[links.invite] email send failed", { email, error });
      }
    }

    if (sent === 0 && emails.length > 0) {
      return NextResponse.json(
        {
          error: "Failed to send invite emails",
          notified: sent,
          failed,
          total: emails.length,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      notified: sent,
      failed,
      total: emails.length,
    });
  } catch (error) {
    console.error("[links.invite] unexpected error", error);
    return NextResponse.json(
      { error: "Failed to send invite emails" },
      { status: 500 },
    );
  }
}
