import { cookies } from "next/headers";
import {
  type CookiePayload,
  signCookie,
  verifyCookie,
} from "@/server/cookieHelper";
import type { Enums } from "@/types/generated/supabase";

const ANONYMOUS_USER_COOKIE_PREFIX = "dk_anon_user";
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const ONE_YEAR_IN_MILLISECONDS = ONE_YEAR_IN_SECONDS * 1000;

interface AnonymousUserIdPayload extends CookiePayload {
  anonymousUserId: string;
  exp: number;
}

interface AnonymousUserContext {
  resourceType: Enums<"resource_type">;
  resourceId: string;
  linkId: string;
}

const buildCookieName = ({
  resourceType,
  resourceId,
  linkId,
}: AnonymousUserContext): string => {
  return `${ANONYMOUS_USER_COOKIE_PREFIX}_${resourceType}_${resourceId}_${linkId}`;
};

const signAnonymousCookie = (anonymousUserId: string): string =>
  signCookie({
    anonymousUserId,
    exp: Date.now() + ONE_YEAR_IN_MILLISECONDS,
  });

export const getOrCreateAnonymousUserId = async (
  context: AnonymousUserContext,
): Promise<string> => {
  const cookieStore = await cookies();
  const cookieName = buildCookieName(context);
  const existingCookie = cookieStore.get(cookieName);

  if (existingCookie) {
    const payload =
      verifyCookie<AnonymousUserIdPayload>(existingCookie.value) ?? null;
    if (payload?.anonymousUserId) {
      const refreshed = signAnonymousCookie(payload.anonymousUserId);
      cookieStore.set(cookieName, refreshed, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ONE_YEAR_IN_SECONDS,
        path: "/",
      });
      return payload.anonymousUserId;
    }
  }

  const anonymousUserId = crypto.randomUUID();
  const signedCookie = signAnonymousCookie(anonymousUserId);
  cookieStore.set(cookieName, signedCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_IN_SECONDS,
    path: "/",
  });

  return anonymousUserId;
};
