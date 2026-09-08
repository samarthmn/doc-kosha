import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { recordCommentAuditEvent } from "@/modules/comments/server/audit";

const BodySchema = z.object({
  threadId: z.string().uuid(),
  action: z.enum(["resolve", "unresolve"]),
});

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

    const actorEmail = user.email?.trim();
    if (!actorEmail) {
      return NextResponse.json(
        { error: "Missing user email" },
        { status: 400 },
      );
    }

    const svc = createSupabaseServiceClient();

    const { data: thread, error: threadError } = await svc
      .from("comment_threads")
      .select("id, workspace_id, link_id, document_id, page_number, anchor")
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

    const nextState = parsed.data.action === "resolve" ? "resolved" : "open";
    const resolvedAt =
      parsed.data.action === "resolve" ? new Date().toISOString() : null;

    const { data: updated, error: updateError } = await svc
      .from("comment_threads")
      .update({
        state: nextState,
        resolved_at: resolvedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id)
      .select("id, state, resolved_at, updated_at")
      .single();

    if (updateError || !updated) {
      console.error("[Comments Resolve API] Update failed", updateError);
      return NextResponse.json(
        { error: "Unable to update thread" },
        { status: 500 },
      );
    }

    const quote = (() => {
      const anchor =
        thread.anchor && typeof thread.anchor === "object"
          ? (thread.anchor as Record<string, unknown>)
          : null;
      const raw = anchor && "quote" in anchor ? anchor.quote : null;
      return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    })();

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
      messageId: null,
      pageNumber: thread.page_number ?? null,
      quote,
      eventType:
        parsed.data.action === "resolve"
          ? "comment_thread_resolved"
          : "comment_thread_unresolved",
      actor: {
        actorType: "workspace_member",
        actorEmail,
        actorUserId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      thread: updated,
    });
  } catch (err) {
    console.error("[Comments Resolve API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
