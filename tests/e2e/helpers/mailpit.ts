import { z } from "zod";
import { getE2EEnv } from "./env";

const AddressSchema = z
  .object({
    Email: z.string().optional(),
    Address: z.string().optional(),
  })
  .transform((addr) => (addr.Email ?? addr.Address ?? "").trim())
  .refine((email) => email.length > 0);

const MessageSummarySchema = z.object({
  ID: z.string().min(1),
  Subject: z.string().optional().default(""),
  Created: z.string().optional(),
  To: z.array(AddressSchema).optional().default([]),
});

const MessagesResponseSchema = z.object({
  messages: z.array(MessageSummarySchema).optional().default([]),
});

const MessageDetailSchema = z.object({
  HTML: z.string().optional().default(""),
  Text: z.string().optional().default(""),
});

type MessageSummary = z.infer<typeof MessageSummarySchema>;

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const mailpitUrl = (path: string): string => {
  const base = getE2EEnv().MAILPIT_BASE_URL.replace(/\/+$/g, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mailpit request failed (${res.status})`);
  return (await res.json()) as unknown;
};

const listMessages = async (): Promise<MessageSummary[]> => {
  const json = await fetchJson(mailpitUrl("/api/v1/messages?limit=200"));
  return MessagesResponseSchema.parse(json).messages;
};

const getMessageContent = async (id: string): Promise<string> => {
  const json = await fetchJson(mailpitUrl(`/api/v1/message/${id}`));
  const detail = MessageDetailSchema.parse(json);
  return `${detail.HTML}\n${detail.Text}`;
};

const matchesMessage = (
  message: MessageSummary,
  args: { to: string; subjectIncludes?: string },
): boolean => {
  const to = args.to.trim().toLowerCase();
  const hasRecipient = message.To.some(
    (email) => email.trim().toLowerCase() === to,
  );
  const subjectOk = args.subjectIncludes
    ? message.Subject.includes(args.subjectIncludes)
    : true;
  return hasRecipient && subjectOk;
};

const newestMatchingMessage = (
  messages: MessageSummary[],
  args: { to: string; subjectIncludes?: string },
): MessageSummary | null => {
  const matchingMessages = messages
    .filter((message) => matchesMessage(message, args))
    .sort((a, b) => {
      const aTime = a.Created ? Date.parse(a.Created) : 0;
      const bTime = b.Created ? Date.parse(b.Created) : 0;
      return bTime - aTime;
    });
  return matchingMessages[0] ?? null;
};

export const getNewestMailpitMessageId = async (args: {
  to: string;
  subjectIncludes?: string;
}): Promise<string | null> => {
  const message = newestMatchingMessage(await listMessages(), args);
  return message?.ID ?? null;
};

const extractSixDigitCode = (content: string): string | null => {
  const normalized = content
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/style="[^"]*"/gi, " ")
    .replace(/#[0-9a-fA-F]{3,6}\b/g, " ");
  return normalized.match(/code[^0-9]{0,20}(\d{6})/i)?.[1] ?? null;
};

const waitForMessageContent = async (args: {
  to: string;
  sinceMs: number;
  subjectIncludes?: string;
  timeoutMs?: number;
  baselineMessageId?: string | null;
}): Promise<string> => {
  const deadline = Date.now() + (args.timeoutMs ?? 45_000);

  while (Date.now() < deadline) {
    const message = newestMatchingMessage(await listMessages(), args);
    const createdAtMs = message?.Created ? Date.parse(message.Created) : 0;
    const isFresh =
      args.baselineMessageId === undefined
        ? createdAtMs === 0 || createdAtMs >= args.sinceMs - 1000
        : message?.ID !== args.baselineMessageId;

    if (message && isFresh) {
      return await getMessageContent(message.ID);
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for Mailpit email to ${args.to}`);
};

export const waitForOtpCode = async (args: {
  to: string;
  sinceMs: number;
  subjectIncludes?: string;
  timeoutMs?: number;
  baselineMessageId?: string | null;
}): Promise<string> => {
  const content = await waitForMessageContent(args);
  const code = extractSixDigitCode(content);
  if (!code) throw new Error("Email arrived but no 6-digit OTP was found");
  return code;
};
