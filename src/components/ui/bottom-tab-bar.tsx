"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  bottomTabHrefs,
  filterNavItems,
  navItems,
} from "@/components/ui/nav-config";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useWorkspaceMembership } from "@/hooks/useWorkspaceMembership";

interface BottomTabBarProps {
  className?: string;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ className }) => {
  const pathname = usePathname();
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const { membership } = useWorkspaceMembership(currentWorkspaceId);
  const isOwner = membership?.isOwner ?? false;
  const canAccessDocuments =
    (membership?.documentsAccess ?? "viewer") !== "none";
  const visibleTabs = filterNavItems(navItems, {
    isOwner,
    canAccessDocuments,
  }).filter((item) => bottomTabHrefs.includes(item.href));

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "dk-mobile-bottom-nav z-50 border-t border-border bg-background/92 backdrop-blur-xl lg:hidden",
        "flex items-center justify-around px-2 pt-1.5",
        className,
      )}
    >
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const isBrandingTab = tab.href === "/custom-domain";
        const isActive = isBrandingTab
          ? pathname?.startsWith("/custom-domain") ||
            pathname?.startsWith("/custom-watermarks") ||
            pathname?.startsWith("/branding")
          : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex min-h-12 min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] transition-colors",
              isActive
                ? "bg-primary/10 text-primary shadow-[inset_0_2px_0_var(--primary)]"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span>{tab.mobileLabel ?? tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
