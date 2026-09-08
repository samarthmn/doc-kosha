type PublicLinkAvailability = {
  open_once: boolean;
  revoked_at: string | null;
  expires_at: string | null;
};

type PublicLinkAvailabilityError = {
  status: 410;
  error: "Link revoked" | "Link expired";
  code: "REVOKED" | "EXPIRED";
};

export const getPublicLinkAvailabilityError = (
  link: PublicLinkAvailability,
  now = new Date(),
): PublicLinkAvailabilityError | null => {
  if (link.revoked_at && !link.open_once) {
    return { status: 410, error: "Link revoked", code: "REVOKED" };
  }

  if (link.expires_at && new Date(link.expires_at).getTime() < now.getTime()) {
    return { status: 410, error: "Link expired", code: "EXPIRED" };
  }

  return null;
};
