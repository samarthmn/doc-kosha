"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion, type MotionProps } from "motion/react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { CaretLeft, SignOut, Sparkle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useWorkspaceMembership } from "@/hooks/useWorkspaceMembership";
import { filterNavItems, navItems } from "@/components/ui/nav-config";
import { getTrialBadge } from "@/components/ui/trial-badge";
import Logo from "@/components/ui/logo";
import {
  resolveSidebarMotionState,
  resolveSidebarTransition,
} from "@/components/ui/sidebarMotion";
import { useSidebarLayoutTransitionCoordinator } from "@/components/layouts/SidebarLayoutTransitionContext";
import type { SidebarLayoutTransitionSession } from "@/components/layouts/sidebarLayoutTransition";

interface SidebarProps {
  className?: string;
  currentPath?: string;
}

export const SidebarNav: React.FC<SidebarProps> = ({
  className,
  currentPath,
}) => {
  const router = useRouter();
  const { signOut } = useAuth();
  const authUser = useGlobalStore((s) => s.authUser);
  const userProfile = useGlobalStore((s) => s.userProfile);
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const currentWorkspaceSubscription = useGlobalStore(
    (s) => s.currentWorkspaceSubscription,
  );
  const { membership } = useWorkspaceMembership(currentWorkspaceId);
  const isOwner = membership?.isOwner ?? false;
  const canAccessDocuments =
    (membership?.documentsAccess ?? "viewer") !== "none";
  const navWithIcons = filterNavItems(navItems, {
    isOwner,
    canAccessDocuments,
  });
  const isSidebarCollapsed = useGlobalStore((s) => s.isSidebarCollapsed);
  const toggleSidebarCollapsed = useGlobalStore(
    (s) => s.toggleSidebarCollapsed,
  );

  const handleLogout = async () => {
    await signOut();
    router.replace("/");
  };

  const prefetchRoute = useCallback(
    (href: string) => {
      if (!href) return;
      router.prefetch(href);
    },
    [router],
  );

  const displayName = userProfile?.full_name ?? "";
  const displayEmail = authUser?.email ?? "";

  const initials = displayName
    .split(" ")
    .map((s: string) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const trialBadge = useMemo(
    () => getTrialBadge(currentWorkspaceSubscription),
    [currentWorkspaceSubscription],
  );

  const [hasToggledRail, setHasToggledRail] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const sidebarLayoutTransition = useSidebarLayoutTransitionCoordinator();
  const transitionSessionRef = useRef<SidebarLayoutTransitionSession | null>(
    null,
  );

  const handleToggleRail = useCallback((): void => {
    setHasToggledRail(true);
    const targetWidth = resolveSidebarMotionState(!isSidebarCollapsed).width;
    if (prefersReducedMotion) {
      const currentSession = transitionSessionRef.current;
      if (currentSession) {
        sidebarLayoutTransition.cancel(currentSession);
        transitionSessionRef.current = null;
      }
    } else {
      transitionSessionRef.current = sidebarLayoutTransition.begin(targetWidth);
    }
    toggleSidebarCollapsed();
  }, [
    isSidebarCollapsed,
    prefersReducedMotion,
    sidebarLayoutTransition,
    toggleSidebarCollapsed,
  ]);

  const handleRailAnimationComplete = useCallback<
    NonNullable<MotionProps["onAnimationComplete"]>
  >(
    (definition) => {
      if (
        typeof definition !== "object" ||
        definition === null ||
        Array.isArray(definition) ||
        !("width" in definition) ||
        typeof definition.width !== "number"
      ) {
        return;
      }

      const currentSession = transitionSessionRef.current;
      if (!currentSession) return;
      const completedWidth = definition.width;
      if (sidebarLayoutTransition.complete(currentSession, completedWidth)) {
        transitionSessionRef.current = null;
      }
    },
    [sidebarLayoutTransition],
  );

  useEffect(() => {
    if (!prefersReducedMotion) return;
    const currentSession = transitionSessionRef.current;
    if (!currentSession) return;
    sidebarLayoutTransition.cancel(currentSession);
    transitionSessionRef.current = null;
  }, [prefersReducedMotion, sidebarLayoutTransition]);

  useEffect(
    () => () => {
      const currentSession = transitionSessionRef.current;
      if (!currentSession) return;
      sidebarLayoutTransition.cancel(currentSession);
      transitionSessionRef.current = null;
    },
    [sidebarLayoutTransition],
  );

  // Persisted state can hydrate after the first render. Until the user clicks,
  // both states land at their final width without a startup tween. Reduced
  // motion keeps the click response equally immediate.
  const sidebarTransition = resolveSidebarTransition({
    hasToggledRail,
    prefersReducedMotion,
  });
  const sidebarMotionState = resolveSidebarMotionState(isSidebarCollapsed);
  const sidebarLabelMotion: Pick<
    MotionProps,
    "initial" | "animate" | "transition"
  > = {
    initial: false,
    animate: {
      opacity: sidebarMotionState.labelOpacity,
      maxWidth: sidebarMotionState.labelMaxWidth,
    },
    transition: sidebarTransition,
  };
  const sidebarTrialLabelMotion: Pick<
    MotionProps,
    "initial" | "animate" | "transition"
  > = {
    initial: false,
    animate: {
      opacity: sidebarMotionState.labelOpacity,
      maxWidth: sidebarMotionState.labelMaxWidth,
      maxHeight: isSidebarCollapsed ? 0 : 96,
    },
    transition: sidebarTransition,
  };

  return (
    <motion.aside
      data-testid="desktop-sidebar"
      initial={false}
      animate={{ width: sidebarMotionState.width }}
      transition={sidebarTransition}
      onAnimationComplete={handleRailAnimationComplete}
      className={cn(
        "sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex",
        className,
      )}
    >
      <div className="relative px-2.5 pt-5 pb-4">
        <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center">
          <Logo
            className="h-[22px] w-[22px] shrink-0 justify-self-center text-sidebar-foreground"
            aria-hidden
          />
          <motion.span
            className="min-w-0 overflow-hidden pr-2 text-base font-medium tracking-[-0.015em] whitespace-nowrap text-sidebar-foreground"
            aria-hidden={isSidebarCollapsed}
            {...sidebarLabelMotion}
          >
            DocKosha
          </motion.span>
          {/* Pinned to the divider in both states. It used to sit inside the
              rail when expanded and straddle the edge when collapsed, so the
              control jumped 12px at the very moment it was clicked — the one
              thing a toggle should never do. */}
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-1/2 -right-3 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-[var(--dk-shadow-card)] hover:bg-sidebar-accent!"
            onClick={handleToggleRail}
            aria-label={
              isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            aria-expanded={!isSidebarCollapsed}
          >
            {/* One caret that turns, rather than two that swap: the rotation is
                the same gesture the folder tree uses for the same meaning. */}
            <motion.span
              className="flex"
              initial={false}
              animate={{ rotate: sidebarMotionState.caretRotation }}
              transition={sidebarTransition}
            >
              <CaretLeft className="h-3.5 w-3.5" aria-hidden />
            </motion.span>
          </Button>
        </div>
      </div>

      <div className="mx-3.5 h-px bg-[image:var(--dk-rule-fade)]" />

      <nav aria-label="Primary" className="flex-1 space-y-0.5 px-2.5 py-4">
        {navWithIcons.map((item) => {
          const isActive = currentPath?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onMouseEnter={() => prefetchRoute(item.href)}
              onFocus={() => prefetchRoute(item.href)}
              title={isSidebarCollapsed ? item.label : undefined}
              aria-label={isSidebarCollapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "relative grid h-8 w-full cursor-pointer grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-0 overflow-hidden rounded-lg px-0 text-[13.5px] font-normal transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive &&
                  "bg-sidebar-primary/10 text-sidebar-primary shadow-[inset_2px_0_0_var(--sidebar-primary)] hover:bg-sidebar-primary/15 hover:text-sidebar-primary",
              )}
            >
              <Icon
                className="absolute top-1/2 left-4 h-4 w-4 shrink-0 -translate-y-1/2"
                data-dk-primary-nav-icon
                aria-hidden
              />
              <motion.span
                className="col-start-2 min-w-0 overflow-hidden pr-2 text-left whitespace-nowrap"
                aria-hidden={isSidebarCollapsed}
                {...sidebarLabelMotion}
              >
                {item.label}
              </motion.span>
              {item.badge ? (
                <motion.span
                  className="col-start-3 mr-2 inline-flex justify-self-end overflow-hidden rounded-md bg-sidebar-accent px-2 py-0.5 text-xs whitespace-nowrap text-secondary-foreground"
                  aria-hidden={isSidebarCollapsed}
                  {...sidebarLabelMotion}
                >
                  {item.badge}
                </motion.span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-2.5">
        {trialBadge ? (
          <div
            className="mb-3 grid grid-cols-[48px_minmax(0,1fr)] items-start overflow-hidden rounded-lg border border-sidebar-border bg-sidebar-primary/8 py-2"
            title={`${trialBadge.title} ${trialBadge.subtitle}`}
          >
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center justify-self-center rounded-md bg-sidebar-primary/15 text-sidebar-primary">
              <Sparkle className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="sr-only" aria-hidden={!isSidebarCollapsed}>
              Free Trial {trialBadge.title} {trialBadge.subtitle}
            </span>
            <motion.div
              className="min-w-0 overflow-hidden pr-2"
              aria-hidden={isSidebarCollapsed}
              {...sidebarTrialLabelMotion}
            >
              <p className="text-xs font-semibold text-sidebar-foreground">
                Free Trial
              </p>
              <p className="text-xs text-sidebar-foreground/90">
                {trialBadge.title}
              </p>
              <p className="text-[11px] text-sidebar-foreground/65">
                {trialBadge.subtitle}
              </p>
            </motion.div>
          </div>
        ) : null}

        <div
          className="grid grid-cols-[48px_minmax(0,1fr)] items-center rounded-lg py-2 hover:bg-sidebar-accent/60"
          title={
            !isSidebarCollapsed ? `${displayName} • ${displayEmail}` : undefined
          }
        >
          <div
            className="grid h-7 w-7 shrink-0 place-items-center justify-self-center rounded-full bg-sidebar-primary/12 text-[11px] font-medium text-sidebar-primary"
            title={
              isSidebarCollapsed
                ? `${displayName} • ${displayEmail}`
                : undefined
            }
          >
            {initials}
          </div>
          <motion.div
            className="min-w-0 overflow-hidden pr-2"
            aria-hidden={isSidebarCollapsed}
            {...sidebarLabelMotion}
          >
            <p
              className="truncate text-sm font-medium text-sidebar-foreground"
              title={displayName}
            >
              {displayName}
            </p>
            <p
              className="truncate text-xs text-sidebar-foreground/70"
              title={displayEmail}
            >
              {displayEmail}
            </p>
          </motion.div>
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          aria-label="Log out"
          className={cn(
            "mt-2 grid h-8 w-full cursor-pointer grid-cols-[48px_minmax(0,1fr)] items-center gap-0 rounded-lg px-0 text-[13.5px] text-destructive",
          )}
        >
          <SignOut className="h-4 w-4 justify-self-center" aria-hidden />
          <motion.span
            className="min-w-0 overflow-hidden pr-2 text-left whitespace-nowrap"
            aria-hidden={isSidebarCollapsed}
            {...sidebarLabelMotion}
          >
            Log out
          </motion.span>
        </Button>
      </div>
    </motion.aside>
  );
};
