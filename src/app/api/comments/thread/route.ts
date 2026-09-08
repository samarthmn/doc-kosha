import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { recordCommentAuditEvent } from "@/modules/comments/server/audit";
import type { Json } from "@/types/generated/supabase";

const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const AnchorSchema = z.object({
  rects: z.array(RectSchema).min(1),
  quote: z.string().trim().min(1).optional(),
});

const BodySchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
  pageNumber: z.number().int().min(1),
  anchor: AnchorSchema,
  body: z.string().trim().min(1).max(1000),
});

const COLOR_TOKENS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

const toAuthorColor = (authorKey: string): string => {
  const digest = createHash("sha256").update(authorKey).digest("hex");
  const index = parseInt(digest.slice(0, 8), 16) % COLOR_TOKENS.length;
  return COLOR_TOKENS[index];
};

const toAnchorJson = (anchor: z.infer<typeof AnchorSchema>): Json =>
  ({
    rects: anchor.rects.map((rect) => ({
      x: Number(rect.x.toFixed(6)),
      y: Number(rect.y.toFixed(6)),
      w: Number(rect.w.toFixed(6)),
      h: Number(rect.h.toFixed(6)),
    })),
    ...(anchor.quote ? { quote: anchor.quote } : {}),
  }) as Json;

export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authorEmail = user.email?.trim();
    if (!authorEmail) {
      return NextResponse.json(
        { error: "Missing user email" },
        { status: 400 },
      );
    }

    const svc = createSupabaseServiceClient();

    const { data: link, error: linkError } = await svc
      .from("links")
      .select("id, workspace_id, document_id, data_room_id, comments_enabled")
      .eq("id", parsed.data.linkId)
      .eq("document_id", parsed.data.documentId)
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (!link.comments_enabled) {
      return NextResponse.json(
        { error: "Comments are disabled for this link" },
        { status: 409 },
      );
    }

    const { data: membership, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", link.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: "Forbidden: Not a workspace member" },
        { status: 403 },
      );
    }

    const { data: createdThread, error: threadError } = await svc
      .from("comment_threads")
      .insert({
        workspace_id: link.workspace_id,
        link_id: link.id,
        document_id: parsed.data.documentId,
        page_number: parsed.data.pageNumber,
        anchor: toAnchorJson(parsed.data.anchor),
        state: "open",
        resolved_at: null,
      })
      .select("id")
      .single();

    if (threadError || !createdThread) {
      console.error("[Comments Thread API] Insert thread failed", threadError);
      return NextResponse.json(
        { error: "Unable to create comment" },
        { status: 500 },
      );
    }

    const authorKey = `user:${user.id}`;
    const authorColor = toAuthorColor(authorKey);

    const { data: createdMessage, error: messageError } = await svc
      .from("comment_messages")
      .insert({
        workspace_id: link.workspace_id,
        link_id: link.id,
        thread_id: createdThread.id,
        body: parsed.data.body.trim(),
        author_type: "workspace_member",
        author_key: authorKey,
        author_label: authorEmail,
        author_email: authorEmail,
        author_color: authorColor,
        state: "active",
      })
      .select("id")
      .single();

    if (messageError || !createdMessage) {
      console.error(
        "[Comments Thread API] Insert message failed",
        messageError,
      );
      const { error: cleanupError } = await svc
        .from("comment_threads")
        .delete()
        .eq("id", createdThread.id);
      if (cleanupError) {
        console.error(
          "[Comments Thread API] Failed to cleanup orphan thread",
          cleanupError,
        );
        return NextResponse.json(
          { error: "Unable to rollback failed comment creation" },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: "Unable to create comment" },
        { status: 500 },
      );
    }

    void recordCommentAuditEvent({
      workspaceId: link.workspace_id,
      documentId: parsed.data.documentId,
      dataRoomId: link.data_room_id ?? null,
      linkId: link.id,
      threadId: createdThread.id,
      messageId: createdMessage.id,
      pageNumber: parsed.data.pageNumber,
      quote: parsed.data.anchor.quote ?? null,
      bodyPreview: parsed.data.body.trim(),
      eventType: "comment_thread_created",
      actor: {
        actorType: "workspace_member",
        actorEmail: authorEmail,
        actorUserId: user.id,
      },
    });

    return NextResponse.json({ threadId: createdThread.id });
  } catch (err) {
    console.error("[Comments Thread API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
