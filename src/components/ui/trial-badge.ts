type TrialSubscriptionLike = {
  status?: string | null;
  trialEndsAt?: string | null;
};

/**
 * Trial status copy shared by the desktop sidebar and the mobile menu.
 */
export const getTrialBadge = (
  subscription: TrialSubscriptionLike | null | undefined,
): { title: string; subtitle: string } | null => {
  if (subscription?.status !== "trialing") return null;
  if (!subscription.trialEndsAt) return null;

  const trialEndsAt = Date.parse(subscription.trialEndsAt);
  if (!Number.isFinite(trialEndsAt)) return null;

  const remainingMs = trialEndsAt - Date.now();
  if (remainingMs <= 0) {
    return {
      title: "Free Trial Ended",
      subtitle: "Upgrade to restore access.",
    };
  }

  const daysLeft = Math.max(1, Math.ceil(remainingMs / 86_400_000));
  return {
    title: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in trial`,
    subtitle: `Ends ${new Date(trialEndsAt).toLocaleDateString()}`,
  };
};
