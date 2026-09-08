"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { List, SignOut, Sparkle } from "@phosphor-icons/react";
import Logo from "@/components/ui/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  bottomTabHrefs,
  filterNavItems,
  navItems,
  routeTitle,
} from "@/components/ui/nav-config";
import { getTrialBadge } from "@/components/ui/trial-badge";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useWorkspaceMembership } from "@/hooks/useWorkspaceMembership";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
  className?: string;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ className }) => {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const currentWorkspaceSubscription = useGlobalStore(
    (s) => s.currentWorkspaceSubscription,
  );
  const { membership } = useWorkspaceMembership(currentWorkspaceId);
  const isOwner = membership?.isOwner ?? false;
  const canAccessDocuments =
    (membership?.documentsAccess ?? "viewer") !== "none";
  // Destinations that don't fit in the bottom tab bar live in this menu.
  const menuItems = filterNavItems(navItems, {
    isOwner,
    canAccessDocuments,
  }).filter((item) => !bottomTabHrefs.includes(item.href));
  const trialBadge = getTrialBadge(currentWorkspaceSubscription);
  const title = routeTitle(pathname);

  const handleLogout = async () => {
    await signOut();
    router.replace("/");
  };

  return (
    <header
      role="banner"
      className={cn(
        "dk-mobile-header z-40 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center border-b border-border bg-background/92 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden",
        className,
      )}
    >
      <div className="flex flex-1 items-center gap-2">
        <Logo className="h-6 w-6 text-foreground" aria-hidden />
        <span className="text-sm font-medium tracking-[-0.01em]">{title}</span>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-md border border-border"
            aria-label="Open menu"
          >
            <List className="h-5 w-5" aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="w-80 max-w-[88vw] border-l border-border bg-[var(--dk-surface-overlay)]"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Logo className="h-6 w-6" aria-hidden />
              DocKosha
            </SheetTitle>
          </SheetHeader>
          {menuItems.length > 0 && (
            <nav aria-label="More" className="mt-4 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "h-9 w-full justify-start rounded-lg text-[13.5px] font-normal",
                      isActive &&
                        "bg-primary/10 text-primary shadow-[inset_2px_0_0_var(--primary)] hover:bg-primary/15 hover:text-primary",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="ml-3 flex-1 text-left">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
          {trialBadge ? (
            <div
              className="mt-6 rounded-lg border border-border bg-primary/8 p-3"
              title={`${trialBadge.title} ${trialBadge.subtitle}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Sparkle className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">Free Trial</p>
                  <p className="text-xs">{trialBadge.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {trialBadge.subtitle}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="mt-6 h-9 w-full justify-start rounded-lg text-[13.5px] text-destructive"
          >
            <SignOut className="mr-2 h-4 w-4" aria-hidden />
            Log out
          </Button>
        </SheetContent>
      </Sheet>
    </header>
  );
};
