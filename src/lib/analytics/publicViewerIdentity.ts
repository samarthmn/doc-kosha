type PublicViewTrackingIdentityInput = {
  linkId?: string | null;
  resourceId?: string | null;
  resourceType?: string | null;
  sessionId?: string | null;
};

export const buildPublicViewTrackingIdentity = (
  context: PublicViewTrackingIdentityInput | null,
): string | null => {
  if (!context?.linkId || !context.resourceId) return null;
  return [
    context.sessionId ?? "no-session",
    context.linkId,
    context.resourceType ?? "document",
    context.resourceId,
  ].join(":");
};
