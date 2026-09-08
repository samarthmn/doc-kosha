type VerifiedViewerEmailPolicy = {
  emailVerification?: boolean | null;
  ndaGate?: boolean | null;
  collectEmailForAnalytics?: boolean | null;
  dynamicWatermarkEmail?: boolean | null;
  allowlistActive?: boolean | null;
};

/** Shared access invariant for every feature that depends on viewer identity. */
export const requiresVerifiedViewerEmail = (
  policy: VerifiedViewerEmailPolicy,
): boolean =>
  Boolean(
    policy.emailVerification ||
    policy.ndaGate ||
    policy.collectEmailForAnalytics ||
    policy.dynamicWatermarkEmail ||
    policy.allowlistActive,
  );

/** Database flag invariant for features that require an OTP-capable session. */
export const resolveStoredEmailVerification = (
  policy: VerifiedViewerEmailPolicy,
): boolean =>
  Boolean(
    policy.emailVerification ||
    policy.collectEmailForAnalytics ||
    policy.dynamicWatermarkEmail,
  );

export const shouldPersistViewerEmail = (input: {
  collectEmailForAnalytics: boolean;
  verifiedEmail: string | null | undefined;
}): boolean => input.collectEmailForAnalytics && Boolean(input.verifiedEmail);
