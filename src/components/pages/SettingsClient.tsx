"use client";

import React, { useEffect, useState } from "react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProfileSettings from "@/components/settings/ProfileSettings";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import PublicLinksSettings from "@/components/settings/PublicLinksSettings";
import SubscriptionUsage from "@/components/settings/SubscriptionUsage";
import PrivacySettings from "@/components/settings/PrivacySettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import {
  buildSettingsTabUrl,
  coerceSettingsTab,
  isSettingsRecoveryTab,
  resolveSettingsTab,
  type SettingsTab,
} from "@/components/pages/settingsTabNavigation";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { layoutTween } from "@/lib/motion";
import {
  Bell,
  Eye,
  GlobeHemisphereWest,
  Palette,
  Receipt,
  UserCircle,
} from "@phosphor-icons/react";

type SettingsTabDefinition = {
  value: SettingsTab;
  label: string;
  icon: typeof UserCircle;
  Panel: React.ComponentType;
};

const SETTINGS_TABS = [
  {
    value: "profile",
    label: "Profile",
    icon: UserCircle,
    Panel: ProfileSettings,
  },
  {
    value: "appearance",
    label: "Appearance",
    icon: Palette,
    Panel: AppearanceSettings,
  },
  {
    value: "public-links",
    label: "Public Links",
    icon: GlobeHemisphereWest,
    Panel: PublicLinksSettings,
  },
  { value: "privacy", label: "Privacy", icon: Eye, Panel: PrivacySettings },
  {
    value: "notifications",
    label: "Notifications",
    icon: Bell,
    Panel: NotificationSettings,
  },
  {
    value: "subscription",
    label: "Subscription & Usage",
    icon: Receipt,
    Panel: SubscriptionUsage,
  },
] as const satisfies ReadonlyArray<SettingsTabDefinition>;

/**
 * One shared underline slides between triggers rather than each trigger fading
 * its own bar in and out, so the indicator reads as a single object tracking
 * the selection. Scoped to this strip by its `layoutId`: other tab groups keep
 * the static CSS bar, and two groups sharing an id would animate the underline
 * between unrelated strips.
 */
const TAB_UNDERLINE_LAYOUT_ID = "settings-tab-underline";

/**
 * Next.js 16 patches `window.history.replaceState`. Passing a state object
 * without `__NA` dispatches ACTION_RESTORE, which can hard-navigate. Passing
 * the current `__NA` state skips that restore, so `useSearchParams` stays
 * stale. Ordinary tab clicks therefore update local selection and the native
 * History prototype; recovery tab changes still go through the patched API so
 * the layout guard can see `tab=subscription`.
 */
const commitSettingsTabUrl = (
  nextUrl: string,
  shouldSyncAppRouter: boolean,
): void => {
  if (shouldSyncAppRouter) {
    window.history.replaceState(null, "", nextUrl);
    return;
  }

  History.prototype.replaceState.call(
    window.history,
    window.history.state,
    "",
    nextUrl,
  );
};

const SettingsClient: React.FC = () => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const urlTab = resolveSettingsTab(searchParams);
  const [selectedTab, setSelectedTab] = useState(urlTab);

  useEffect(() => {
    setSelectedTab(urlTab);
  }, [urlTab]);

  const handleTabChange = (next: string): void => {
    const nextTab = coerceSettingsTab(next);
    const nextUrl = buildSettingsTabUrl({
      pathname,
      searchParams,
      nextTab,
      hash: window.location.hash,
    });
    setSelectedTab(nextTab);
    commitSettingsTabUrl(
      nextUrl,
      isSettingsRecoveryTab(urlTab) || isSettingsRecoveryTab(nextTab),
    );
  };

  return (
    <PageContainer className="mx-auto max-w-6xl pb-16">
      <PageHeader
        title="Settings"
        description="Manage your account and application preferences"
        className="mb-5"
      />

      <Tabs
        value={selectedTab}
        onValueChange={handleTabChange}
        className="gap-0"
      >
        {/* The strip wraps instead of scrolling: a horizontal scroll container
            (overflow-x-auto) also computes overflow-y to auto, which clipped the
            active-tab underline (after:bottom-[-1px]) and the focus outline, and
            hid off-screen tabs with no affordance above the sm breakpoint. */}
        <div className="mb-6 border-b border-border/60">
          <TabsList
            className="h-auto w-full flex-wrap justify-start gap-0 border-0"
            aria-label="Settings sections"
          >
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  // The static `after:` bar is suppressed here: the sliding
                  // `motion.span` below is this strip's only indicator, and
                  // drawing both would show two underlines mid-slide.
                  className="mt-1 h-11 flex-none rounded-none px-3 text-xs data-[state=active]:bg-primary/[0.04] data-[state=active]:after:bg-transparent sm:text-sm"
                  value={tab.value}
                >
                  <Icon size={16} aria-hidden="true" />
                  {tab.label}
                  {selectedTab === tab.value ? (
                    <motion.span
                      layoutId={TAB_UNDERLINE_LAYOUT_ID}
                      className="absolute inset-x-2 -bottom-px h-0.5 bg-primary"
                      transition={layoutTween}
                      aria-hidden="true"
                    />
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {SETTINGS_TABS.map(({ value, Panel }) => (
          <TabsContent key={value} value={value} className="space-y-6">
            <Panel />
          </TabsContent>
        ))}
      </Tabs>
    </PageContainer>
  );
};

export default SettingsClient;
