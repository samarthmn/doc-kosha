export const hasCompletedOnboardingProfile = (
  primaryUseCase: string | null | undefined,
): boolean => Boolean(primaryUseCase?.trim());

export const resolveOnboardingFullName = (args: {
  profileFullName: string | null | undefined;
  authEmail: string | null | undefined;
}): string => {
  const candidate = args.profileFullName?.trim() ?? "";
  if (!candidate) return "";

  const normalizedEmail = args.authEmail?.trim().toLowerCase() ?? "";
  if (normalizedEmail && candidate.toLowerCase() === normalizedEmail) {
    return "";
  }

  return candidate;
};
