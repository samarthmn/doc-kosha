import { z } from "zod";

const COMMENT_ANCHOR_RECTS_MAX_INPUT = 512;
const COMMENT_ANCHOR_RECTS_MAX_STORED = 128;
const COMMENT_ANCHOR_QUOTE_MAX_INPUT = 20_000;
const COMMENT_ANCHOR_QUOTE_MAX_STORED = 1000;

const commentAnchorRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().gt(0).max(1),
  h: z.number().gt(0).max(1),
});

const commentAnchorSchema = z.object({
  rects: z
    .array(commentAnchorRectSchema)
    .min(1)
    .max(COMMENT_ANCHOR_RECTS_MAX_INPUT)
    .transform((rects) => rects.slice(0, COMMENT_ANCHOR_RECTS_MAX_STORED)),
  quote: z
    .string()
    .trim()
    .max(COMMENT_ANCHOR_QUOTE_MAX_INPUT)
    .transform((quote) => quote.slice(0, COMMENT_ANCHOR_QUOTE_MAX_STORED))
    .optional(),
});

export const listCommentThreadsQuerySchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
});

export const getCommentThreadQuerySchema = z.object({
  linkId: z.string().uuid(),
  threadId: z.string().uuid(),
});

export const createCommentThreadBodySchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
  pageNumber: z.number().int().min(1),
  anchor: commentAnchorSchema,
  body: z.string().trim().min(1).max(1000),
});

export const replyCommentBodySchema = z.object({
  linkId: z.string().uuid(),
  threadId: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
});

export const resolveCommentBodySchema = z.object({
  linkId: z.string().uuid(),
  threadId: z.string().uuid(),
  action: z.enum(["resolve", "unresolve"]),
});

export const deleteCommentMessageBodySchema = z.object({
  linkId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export type CommentAnchor = z.infer<typeof commentAnchorSchema>;
