import type { CookiePayload } from "@/server/cookieHelper";

const ACCESS_COOKIE_PREFIX = "dk_acc" as const;
const EMAIL_COOKIE_PREFIX = "dk_ev" as const;
const VERSION_COOKIE_PREFIX = "dk_dv" as const;

export type PublicResourceType = "document" | "data_room";

export interface AccessCookiePayload extends CookiePayload {
  resourceType: PublicResourceType;
  resourceId: string;
  linkId: string;
}

const normalizeId = (value: string): string => value.trim().toLowerCase();

const toKey = (
  prefix: string,
  resourceType: PublicResourceType,
  resourceId: string,
  linkId: string,
) =>
  `${prefix}_${resourceType}_${normalizeId(resourceId)}_${normalizeId(linkId)}`;

export const getAccessCookieKey = (
  resourceType: PublicResourceType,
  resourceId: string,
  linkId: string,
) => toKey(ACCESS_COOKIE_PREFIX, resourceType, resourceId, linkId);

export const getEmailCookieKey = (
  resourceType: PublicResourceType,
  resourceId: string,
  linkId: string,
) => toKey(EMAIL_COOKIE_PREFIX, resourceType, resourceId, linkId);

export const getVersionCookieKey = (
  resourceType: PublicResourceType,
  resourceId: string,
  linkId: string,
) => toKey(VERSION_COOKIE_PREFIX, resourceType, resourceId, linkId);
