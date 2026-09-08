type FounderHelpEmailPolicyInput = {
  hasOwnerEmail: boolean;
  onboardingRemindersEnabled: boolean;
  isTrialActive: boolean;
  hasPaidOrCanceledSubscription: boolean;
};

export const shouldSendFounderHelpEmail = ({
  hasOwnerEmail,
  onboardingRemindersEnabled,
  isTrialActive,
  hasPaidOrCanceledSubscription,
}: FounderHelpEmailPolicyInput): boolean => {
  if (!hasOwnerEmail) return false;
  if (!onboardingRemindersEnabled) return false;
  if (!isTrialActive) return false;
  if (hasPaidOrCanceledSubscription) return false;

  return true;
};
