const SETTINGS_TAB_VALUES = [
  "profile",
  "appearance",
  "public-links",
  "privacy",
  "notifications",
  "subscription",
] as const;

export type SettingsTab = (typeof SETTINGS_TAB_VALUES)[number];

type SearchParamsLike = Pick<URLSearchParams, "get" | "toString">;

type BuildSettingsTabUrlArgs = {
  pathname: string;
  searchParams: SearchParamsLike;
  nextTab: string;
  hash: string;
};

const isSettingsTab = (value: string | null): value is SettingsTab =>
  SETTINGS_TAB_VALUES.some((tab) => tab === value);

const SETTINGS_RECOVERY_TAB = "subscription" satisfies SettingsTab;

export const coerceSettingsTab = (value: string): SettingsTab =>
  isSettingsTab(value) ? value : "profile";

export const isSettingsRecoveryTab = (tab: string): boolean =>
  tab === SETTINGS_RECOVERY_TAB;

export const resolveSettingsTab = (
  searchParams: SearchParamsLike,
): SettingsTab => {
  const tab = searchParams.get("tab");
  return isSettingsTab(tab) ? tab : "profile";
};

export const buildSettingsTabUrl = ({
  pathname,
  searchParams,
  nextTab,
  hash,
}: BuildSettingsTabUrlArgs): string => {
  const params = new URLSearchParams(searchParams.toString());
  params.set("tab", nextTab);
  return `${pathname}?${params.toString()}${hash}`;
};
