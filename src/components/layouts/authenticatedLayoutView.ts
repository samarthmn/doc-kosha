type AuthenticatedLayoutView =
  "booting" | "subscription-checking" | "subscription-error" | "ready";

type ResolveAuthenticatedLayoutViewArgs = {
  isLoading: boolean;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  hasSubscriptionGuardError: boolean;
  hasSubscriptionAccess: boolean;
};

export const resolveAuthenticatedLayoutView = ({
  isLoading,
  isAuthenticated,
  isOnboarded,
  hasSubscriptionGuardError,
  hasSubscriptionAccess,
}: ResolveAuthenticatedLayoutViewArgs): AuthenticatedLayoutView => {
  if (isLoading || !isAuthenticated || !isOnboarded) {
    return "booting";
  }

  if (hasSubscriptionGuardError) return "subscription-error";
  if (!hasSubscriptionAccess) return "subscription-checking";

  return "ready";
};

export type SubscriptionGuardResult = {
  workspaceId: string;
  revision: number;
  status: "allowed" | "redirecting" | "error";
};

/**
 * Recovery routes intentionally bypass entitlement enforcement so a lapsed
 * workspace can restore access. Any verdict obtained before entering that
 * bypass must be discarded: returning to protected content requires a fresh
 * verification even when both tabs share the same pathname.
 */
export const invalidateGuardForSubscriptionRecovery = (
  previous: SubscriptionGuardResult | null,
  isRecoveryRoute: boolean,
): SubscriptionGuardResult | null => (isRecoveryRoute ? null : previous);

export const resolveGuardAfterVerifyError = (
  previous: SubscriptionGuardResult | null,
  workspaceId: string,
  revision: number,
): SubscriptionGuardResult => {
  if (previous?.workspaceId === workspaceId && previous.status === "allowed") {
    return previous;
  }

  return { workspaceId, revision, status: "error" };
};

/**
 * A stored verdict covers every authenticated route in the same workspace.
 * Refocus and navigation checks still run in the background, but they do not
 * unmount the shared shell while a previously approved workspace is verified.
 * Recovery-path exemption remains request-path-specific in the layout.
 */
export const subscriptionGuardCoversWorkspace = (
  guard: SubscriptionGuardResult | null,
  workspaceId: string | null,
): boolean => workspaceId !== null && guard?.workspaceId === workspaceId;
