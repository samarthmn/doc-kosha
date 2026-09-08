import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { sendAppEmail } from "@/server/emailHelper";
import {
  buildCommentCreatedEmail,
  buildCommentReplyEmail,
} from "@/server/emails/templates";
import { resolveEffectivePublicLanguage } from "@/modules/public-links/server/settings";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://dockosha.com";

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const buildInternalCommentsUrl = (args: {
  documentId: string;
  dataRoomId: string | null;
}): string => {
  if (args.dataRoomId) {
    return `${APP_URL}/data-rooms/${args.dataRoomId}/documents/view/${args.documentId}/comments`;
  }
  return `${APP_URL}/documents/view/${args.documentId}/comments`;
};

const buildPublicViewerUrl = (args: {
  documentId: string;
  linkId: string;
  dataRoomId: string | null;
}): string => {
  if (args.dataRoomId) {
    return `${APP_URL}/r/${args.dataRoomId}/${args.linkId}/${args.documentId}`;
  }
  return `${APP_URL}/d/${args.documentId}/${args.linkId}`;
};

const listWorkspaceOwnerEmails = async (
  workspaceId: string,
): Promise<string[]> => {
  const supabase = createSupabaseServiceClient();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("created_by")
    .eq("id", workspaceId)
    .maybeSingle();

  const ownerIds = new Set<string>();
  if (workspace?.created_by) {
    ownerIds.add(workspace.created_by);
  }

  const emails: string[] = [];
  for (const ownerId of ownerIds) {
    const { data } = await supabase.auth.admin.getUserById(ownerId);
    const email = data.user?.email?.trim();
    if (email) emails.push(email);
  }

  return Array.from(new Set(emails.map(normalizeEmail)));
};

export const notifyWorkspaceOwnersOfViewerComment = async (args: {
  workspaceId: string;
  documentId: string;
  dataRoomId: string | null;
  viewerEmail: string;
  pageNumber: number;
  quote: string | null;
  commentBody: string;
}): Promise<void> => {
  const supabase = createSupabaseServiceClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("title")
    .eq("id", args.documentId)
    .maybeSingle();

  const documentTitle = doc?.title || "Document";
  const commentsUrl = buildInternalCommentsUrl({
    documentId: args.documentId,
    dataRoomId: args.dataRoomId,
  });

  const emailContent = buildCommentCreatedEmail({
    documentTitle,
    viewerEmail: args.viewerEmail,
    pageNumber: args.pageNumber,
    quote: args.quote,
    commentBody: args.commentBody,
    commentsUrl,
  });

  const recipients = await listWorkspaceOwnerEmails(args.workspaceId);
  const viewerEmail = normalizeEmail(args.viewerEmail);

  await Promise.all(
    recipients
      .filter((recipient) => normalizeEmail(recipient) !== viewerEmail)
      .map(async (recipient) => {
        try {
          await sendAppEmail({
            to: recipient,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });
        } catch (err) {
          console.error(
            `[Comments Notify] Owner email to ${recipient} failed:`,
            err,
          );
        }
      }),
  );
};

export const notifyThreadCreatorOfWorkspaceReply = async (args: {
  threadId: string;
  documentId: string;
  linkId: string;
  dataRoomId: string | null;
  replyAuthorEmail: string;
  replyBody: string;
}): Promise<void> => {
  const supabase = createSupabaseServiceClient();

  const { data: firstMessage } = await supabase
    .from("comment_messages")
    .select("author_email")
    .eq("thread_id", args.threadId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const creatorEmail = firstMessage?.author_email?.trim();
  if (!creatorEmail) return;

  const normalizedCreator = normalizeEmail(creatorEmail);
  const normalizedAuthor = normalizeEmail(args.replyAuthorEmail);
  if (normalizedCreator === normalizedAuthor) return;

  const { data: doc } = await supabase
    .from("documents")
    .select("title")
    .eq("id", args.documentId)
    .maybeSingle();
  const { data: link } = await supabase
    .from("links")
    .select("workspace_id, public_language_override")
    .eq("id", args.linkId)
    .maybeSingle();

  const documentTitle = doc?.title || "Document";
  const viewerUrl = buildPublicViewerUrl({
    documentId: args.documentId,
    linkId: args.linkId,
    dataRoomId: args.dataRoomId,
  });

  const emailContent = buildCommentReplyEmail({
    documentTitle,
    replyAuthorEmail: args.replyAuthorEmail,
    replyBody: args.replyBody,
    viewerUrl,
    locale: link
      ? await resolveEffectivePublicLanguage({
          workspaceId: link.workspace_id,
          linkPublicLanguageOverride: link.public_language_override,
        })
      : "en",
  });

  try {
    await sendAppEmail({
      to: creatorEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  } catch (err) {
    console.error(
      `[Comments Notify] Viewer email to ${creatorEmail} failed:`,
      err,
    );
  }
};
