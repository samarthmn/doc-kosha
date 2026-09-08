const SHARE_SLUG_MAX_LENGTH = 64;
const DEFAULT_SHORT_CODE_LENGTH = 8;
const SHORT_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const WORKSPACE_SLUG_FALLBACK = "workspace";

const SHARE_SLUG_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const RESERVED_WORKSPACE_SEGMENTS = new Set<string>([
  "_next",
  "about",
  "api",
  "auth",
  "blog",
  "branding",
  "cookie-policy",
  "custom-domain",
  "custom-watermarks",
  "d",
  "dashboard",
  "data-rooms",
  "documents",
  "favicon.ico",
  "features",
  "hosted-vs-self-hosted",
  "onboarding",
  "pricing",
  "privacy-policy",
  "r",
  "robots.txt",
  "security",
  "settings",
  "sitemap.xml",
  "terms",
]);

const stripDiacritics = (value: string): string =>
  value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

export const sanitizeShareSlugDraft = (value: string): string =>
  stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+/g, "")
    .replace(/[-_]{2,}/g, (match) => match[0])
    .slice(0, SHARE_SLUG_MAX_LENGTH);

export const normalizeShareSlug = (value: string): string =>
  sanitizeShareSlugDraft(value).replace(/[-_]+$/g, "");

export const isValidShareSlug = (value: string): boolean => {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue || normalizedValue.length > SHARE_SLUG_MAX_LENGTH) {
    return false;
  }
  return SHARE_SLUG_REGEX.test(normalizedValue);
};

export const createWorkspaceSlug = (workspaceName: string): string => {
  const slug = normalizeShareSlug(workspaceName) || WORKSPACE_SLUG_FALLBACK;
  if (!isReservedWorkspaceSegment(slug)) return slug;

  const suffixed = normalizeShareSlug(`${slug}-workspace`);
  if (suffixed && !isReservedWorkspaceSegment(suffixed)) return suffixed;

  const prefixed = normalizeShareSlug(`workspace-${slug}`);
  if (prefixed && !isReservedWorkspaceSegment(prefixed)) return prefixed;

  return WORKSPACE_SLUG_FALLBACK;
};

type WorkspaceScopedLinkSelection<TLink extends { workspace_id: string }> =
  | { status: "resolved"; link: TLink; workspaceName: string }
  | { status: "absent" }
  | { status: "ambiguous" };

export const selectWorkspaceScopedLink = <
  TLink extends { workspace_id: string },
>(args: {
  links: readonly TLink[];
  workspaces: readonly { id: string; name: string }[];
  workspaceSlug: string;
}): WorkspaceScopedLinkSelection<TLink> => {
  const workspaceNames = new Map(
    args.workspaces.map((workspace) => [workspace.id, workspace.name]),
  );
  const candidates = args.links.flatMap((link) => {
    const workspaceName = workspaceNames.get(link.workspace_id);
    return typeof workspaceName === "string" ? [{ link, workspaceName }] : [];
  });
  const scopedMatches = candidates.filter(
    ({ workspaceName }) =>
      createWorkspaceSlug(workspaceName) === args.workspaceSlug,
  );

  if (scopedMatches.length > 1) return { status: "ambiguous" };
  if (scopedMatches.length === 1) {
    return { status: "resolved", ...scopedMatches[0] };
  }

  // Preserve canonical redirects for a globally unique legacy path. When a
  // slug exists in multiple workspaces, only an exact workspace match is safe.
  if (candidates.length === 1) {
    return { status: "resolved", ...candidates[0] };
  }
  return { status: "absent" };
};

const randomInt = (maxExclusive: number): number => {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    cryptoObject.getRandomValues(buffer);
    return buffer[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
};

export const createShortCode = (
  length: number = DEFAULT_SHORT_CODE_LENGTH,
): string => {
  const normalizedLength = Math.max(6, Math.min(20, Math.floor(length)));
  let output = "";
  for (let index = 0; index < normalizedLength; index += 1) {
    const charIndex = randomInt(SHORT_CODE_ALPHABET.length);
    output += SHORT_CODE_ALPHABET[charIndex];
  }
  return output;
};

export const resolveEffectiveLinkSlug = (link: {
  custom_slug?: string | null;
  short_code?: string | null;
}): string => {
  const customSlug = (link.custom_slug ?? "").trim().toLowerCase();
  if (customSlug) return customSlug;
  const shortCode = (link.short_code ?? "").trim().toLowerCase();
  if (shortCode) return shortCode;
  return "";
};

export const resolveCustomLinkSlug = (link: {
  custom_slug?: string | null;
}): string => {
  const customSlug = (link.custom_slug ?? "").trim().toLowerCase();
  if (!customSlug) return "";
  return customSlug;
};

export const buildShortSharePath = (
  workspaceName: string,
  linkSlug: string,
): string => {
  const workspaceSlug = createWorkspaceSlug(workspaceName);
  const normalizedLinkSlug = normalizeShareSlug(linkSlug);
  // Avoid emitting a trailing slash when the provided slug normalizes to empty.
  if (!normalizedLinkSlug) {
    return `/${workspaceSlug}`;
  }
  return `/${workspaceSlug}/${normalizedLinkSlug}`;
};

export const isReservedWorkspaceSegment = (segment: string): boolean =>
  RESERVED_WORKSPACE_SEGMENTS.has(segment.toLowerCase());

export const isPotentialShortSharePath = (pathname: string): boolean => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return false;
  const [workspaceSlug, linkSlug] = segments;
  if (
    !workspaceSlug ||
    !linkSlug ||
    isReservedWorkspaceSegment(workspaceSlug)
  ) {
    return false;
  }
  return isValidShareSlug(workspaceSlug) && isValidShareSlug(linkSlug);
};
