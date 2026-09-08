import { createHash } from "node:crypto";

import { signCookie, verifyCookie } from "@/server/cookieHelper";

const VIEW_NOTIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;

type ViewNotificationTokenPayload = {
  purpose: "view_notification";
  linkId: string;
  documentId: string;
  viewerKeyHash: string;
  exp: number;
};

type ViewNotificationScope = {
  linkId: string;
  documentId: string;
};

export const createViewNotificationToken = (
  args: ViewNotificationScope & { viewerKey: string },
): string =>
  signCookie({
    purpose: "view_notification",
    linkId: args.linkId,
    documentId: args.documentId,
    viewerKeyHash: createHash("sha256").update(args.viewerKey).digest("hex"),
    exp: Date.now() + VIEW_NOTIFICATION_TOKEN_TTL_MS,
  } satisfies ViewNotificationTokenPayload);

export const verifyViewNotificationToken = (
  token: string,
  expected: ViewNotificationScope,
): Pick<ViewNotificationTokenPayload, "viewerKeyHash"> | null => {
  const payload = verifyCookie<ViewNotificationTokenPayload>(token);
  if (!payload || payload.purpose !== "view_notification") return null;
  if (payload.linkId !== expected.linkId) return null;
  if (payload.documentId !== expected.documentId) return null;
  if (!/^[a-f0-9]{64}$/.test(payload.viewerKeyHash)) return null;
  return { viewerKeyHash: payload.viewerKeyHash };
};

export const getViewNotificationDedupeKey = (
  args: ViewNotificationScope & {
    viewerKeyHash: string;
    recipientUserId: string;
  },
): string =>
  [
    "document-viewed",
    args.linkId,
    args.documentId,
    args.viewerKeyHash,
    args.recipientUserId,
  ].join(":");
