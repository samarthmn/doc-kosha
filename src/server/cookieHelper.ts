import { createHmac } from "crypto";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import type { PublicResourceType } from "@/server/cookieConstants";

export interface CookiePayload {
  exp: number; // Unix timestamp
  [key: string]: unknown;
}

/**
 * Sign a payload and return a cookie value: `payload.signature`
 */
export function signCookie(payload: CookiePayload): string {
  const payloadStr = JSON.stringify(payload);
  const signature = createHmac("sha256", serverEnv.COOKIE_SECRET)
    .update(payloadStr)
    .digest("base64url");
  return `${Buffer.from(payloadStr).toString("base64url")}.${signature}`;
}

/**
 * Verify and decode a signed cookie value
 */
export function verifyCookie<TPayload extends CookiePayload = CookiePayload>(
  cookieValue: string,
): TPayload | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  try {
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const expectedSignature = createHmac("sha256", serverEnv.COOKIE_SECRET)
      .update(payloadStr)
      .digest("base64url");
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(payloadStr) as CookiePayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null; // expired or invalid exp
    }
    return payload as TPayload;
  } catch {
    return null;
  }
}

const verifiedEmailCookiePayloadSchema = z.object({
  email: z.string().trim().email(),
  exp: z.number(),
  resourceType: z.enum(["document", "data_room"]),
  resourceId: z.string().trim().min(1),
  linkId: z.string().trim().min(1),
});

type VerifiedEmailCookiePayload = z.infer<
  typeof verifiedEmailCookiePayloadSchema
>;

type PublicResourceScope = {
  resourceType: PublicResourceType;
  resourceId: string;
  linkId: string;
};

export const signVerifiedEmailCookie = (
  payload: VerifiedEmailCookiePayload,
): string => signCookie(verifiedEmailCookiePayloadSchema.parse(payload));

export const verifyVerifiedEmailCookie = (
  cookieValue: string,
  expectedScope: PublicResourceScope,
): VerifiedEmailCookiePayload | null => {
  const verified = verifyCookie(cookieValue);
  const parsed = verifiedEmailCookiePayloadSchema.safeParse(verified);
  if (!parsed.success) return null;

  const payload = parsed.data;
  if (payload.resourceType !== expectedScope.resourceType) return null;
  if (payload.resourceId !== expectedScope.resourceId) return null;
  if (payload.linkId !== expectedScope.linkId) return null;
  return payload;
};
