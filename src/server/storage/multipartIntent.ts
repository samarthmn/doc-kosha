import "server-only";

import { z } from "zod";
import {
  signCookie,
  verifyCookie,
  type CookiePayload,
} from "@/server/cookieHelper";
import type { LogicalBucket } from "./r2Keys";

const MultipartAssetKindSchema = z.enum([
  "document",
  "data-room-document",
  "branding",
]);

const MultipartUploadIntentPayloadSchema = z.object({
  exp: z.number(),
  kind: z.literal("multipart-upload-intent"),
  version: z.literal(1),
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  assetKind: MultipartAssetKindSchema,
  logicalBucket: z.string().min(1),
  storagePath: z.string().min(1).max(2048),
  uploadId: z.string().min(1).max(2048),
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  partSizeBytes: z.number().int().positive(),
  totalParts: z.number().int().min(1).max(10_000),
  replaceDocumentId: z.string().uuid().nullable(),
  currentDocumentSizeBytes: z.number().int().nonnegative().nullable(),
});

type MultipartAssetKind = z.infer<typeof MultipartAssetKindSchema>;

type MultipartUploadIntent = {
  userId: string;
  workspaceId: string;
  assetKind: MultipartAssetKind;
  logicalBucket: LogicalBucket;
  storagePath: string;
  uploadId: string;
  filename: string;
  sizeBytes: number;
  partSizeBytes: number;
  totalParts: number;
  replaceDocumentId: string | null;
  currentDocumentSizeBytes: number | null;
};

type IntentMatchParams = {
  userId: string;
  workspaceId: string;
  logicalBucket: LogicalBucket;
  storagePath: string;
  uploadId: string;
};

type IntentMatchResult =
  { ok: true } | { ok: false; message: string; status: number };

const INTENT_TTL_MS = 24 * 60 * 60 * 1000;

export const signMultipartUploadIntent = (
  intent: MultipartUploadIntent,
): string => {
  const payload: CookiePayload = {
    ...intent,
    kind: "multipart-upload-intent",
    version: 1,
    exp: Date.now() + INTENT_TTL_MS,
  };

  return signCookie(payload);
};

export const verifyMultipartUploadIntent = (
  intentToken: string,
): MultipartUploadIntent | null => {
  const payload = verifyCookie(intentToken);
  if (!payload) return null;

  const parsed = MultipartUploadIntentPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  return {
    userId: parsed.data.userId,
    workspaceId: parsed.data.workspaceId,
    assetKind: parsed.data.assetKind,
    logicalBucket: parsed.data.logicalBucket as LogicalBucket,
    storagePath: parsed.data.storagePath,
    uploadId: parsed.data.uploadId,
    filename: parsed.data.filename,
    sizeBytes: parsed.data.sizeBytes,
    partSizeBytes: parsed.data.partSizeBytes,
    totalParts: parsed.data.totalParts,
    replaceDocumentId: parsed.data.replaceDocumentId,
    currentDocumentSizeBytes: parsed.data.currentDocumentSizeBytes,
  };
};

export const assertMultipartIntentMatches = (
  intent: MultipartUploadIntent | null,
  params: IntentMatchParams,
): IntentMatchResult => {
  if (!intent) {
    return {
      ok: false,
      message: "Invalid or expired multipart upload intent",
      status: 400,
    };
  }

  if (intent.userId !== params.userId) {
    return {
      ok: false,
      message: "Multipart upload intent belongs to another user",
      status: 403,
    };
  }

  if (
    intent.workspaceId !== params.workspaceId ||
    intent.logicalBucket !== params.logicalBucket ||
    intent.storagePath !== params.storagePath ||
    intent.uploadId !== params.uploadId
  ) {
    return {
      ok: false,
      message: "Multipart upload intent does not match this upload",
      status: 400,
    };
  }

  return { ok: true };
};

export const isDocumentMultipartIntent = (
  intent: MultipartUploadIntent,
): boolean =>
  intent.assetKind === "document" || intent.assetKind === "data-room-document";
