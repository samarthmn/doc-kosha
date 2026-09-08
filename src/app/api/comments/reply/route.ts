import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { notifyThreadCreatorOfWorkspaceReply } from "@/modules/comments/server/notifications";
import { recordCommentAuditEvent } from "@/modules/comments/server/audit";

const BodySchema = z.object({
  threadId: z.string().uuid(),
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

export async function POST(req: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(payload);
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

    const { data: thread, error: threadError } = await svc
      .from("comment_threads")
      .select("id, workspace_id, link_id, document_id, state, page_number")
      .eq("id", parsed.data.threadId)
      .maybeSingle();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const { data: membership, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", thread.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: "Forbidden: Not a workspace member" },
        { status: 403 },
      );
    }

    if (thread.state !== "open") {
      return NextResponse.json(
        { error: "Resolved threads can’t receive replies" },
        { status: 409 },
      );
    }

    const authorKey = `user:${user.id}`;
    const authorColor = toAuthorColor(authorKey);

    const { data: createdMessage, error: messageError } = await svc
      .from("comment_messages")
      .insert({
        workspace_id: thread.workspace_id,
        link_id: thread.link_id,
        thread_id: thread.id,
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
      console.error("[Comments Reply API] Insert failed", messageError);
      return NextResponse.json(
        { error: "Unable to send reply" },
        { status: 500 },
      );
    }

    const { error: touchError } = await svc
      .from("comment_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", thread.id);

    if (touchError) {
      console.error("[Comments Reply API] Touch thread failed", touchError);
    }

    const { data: link } = await svc
      .from("links")
      .select("data_room_id")
      .eq("id", thread.link_id)
      .maybeSingle();

    void recordCommentAuditEvent({
      workspaceId: thread.workspace_id,
      documentId: thread.document_id,
      dataRoomId: link?.data_room_id ?? null,
      linkId: thread.link_id,
      threadId: thread.id,
      messageId: createdMessage.id,
      pageNumber: thread.page_number ?? null,
      bodyPreview: parsed.data.body.trim(),
      eventType: "comment_reply_sent",
      actor: {
        actorType: "workspace_member",
        actorEmail: authorEmail,
        actorUserId: user.id,
      },
    });

    void notifyThreadCreatorOfWorkspaceReply({
      threadId: thread.id,
      documentId: thread.document_id,
      linkId: thread.link_id,
      dataRoomId: link?.data_room_id ?? null,
      replyAuthorEmail: authorEmail,
      replyBody: parsed.data.body.trim(),
    }).catch((err) => {
      console.error("[Comments Reply API] Notify failed", err);
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Comments Reply API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
