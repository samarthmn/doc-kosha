import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import type { Json } from "@/types/generated/supabase";

type CommentAuditEventType =
  | "comment_thread_created"
  | "comment_reply_sent"
  | "comment_thread_resolved"
  | "comment_thread_unresolved";

type CommentAuditActor =
  | {
      actorType: "viewer";
      actorEmail: string;
      actorUserId?: null;
      actorName?: string | null;
    }
  | {
      actorType: "workspace_member";
      actorEmail: string;
      actorUserId: string;
      actorName?: string | null;
    };

const toPreview = (value: string | null | undefined, maxChars: number) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
};

export const recordCommentAuditEvent = async (args: {
  workspaceId: string;
  documentId: string;
  dataRoomId: string | null;
  linkId: string;
  threadId: string;
  messageId?: string | null;
  pageNumber?: number | null;
  quote?: string | null;
  bodyPreview?: string | null;
  eventType: CommentAuditEventType;
  actor: CommentAuditActor;
}): Promise<void> => {
  const supabase = createSupabaseServiceClient();

  const resourceType =
    args.eventType === "comment_reply_sent"
      ? "comment_messages"
      : "comment_threads";
  const resourceId =
    args.eventType === "comment_reply_sent"
      ? (args.messageId ?? null)
      : args.threadId;

  const metadata: Json = {
    actor_type: args.actor.actorType,
    link_id: args.linkId,
    thread_id: args.threadId,
    ...(args.messageId ? { message_id: args.messageId } : {}),
    ...(typeof args.pageNumber === "number"
      ? { page_number: args.pageNumber }
      : {}),
    ...(args.quote ? { quote: toPreview(args.quote, 280) } : {}),
    ...(args.bodyPreview
      ? { body_preview: toPreview(args.bodyPreview, 280) }
      : {}),
  } as Json;

  const { error } = await supabase.from("audit_events").insert({
    workspace_id: args.workspaceId,
    actor_user_id:
      args.actor.actorType === "workspace_member"
        ? args.actor.actorUserId
        : null,
    actor_name: args.actor.actorName ?? null,
    actor_email: args.actor.actorEmail,
    event_type: args.eventType,
    resource_type: resourceType,
    resource_id: resourceId,
    data_room_id: args.dataRoomId,
    document_id: args.documentId,
    metadata,
  });

  if (error) {
    console.error("[Comments][audit] Failed to record audit event", {
      eventType: args.eventType,
      workspaceId: args.workspaceId,
      documentId: args.documentId,
      linkId: args.linkId,
      threadId: args.threadId,
      messageId: args.messageId ?? null,
      error,
    });
  }
};
