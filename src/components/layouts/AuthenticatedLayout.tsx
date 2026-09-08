"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import { riseIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { SidebarNav } from "@/components/ui/sidebar";
import { BottomTabBar } from "@/components/ui/bottom-tab-bar";
import { MobileHeader } from "@/components/ui/mobile-header";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { resolvePermissionWithRetry } from "@/lib/permissionCheck";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import {
  buildSubscriptionAccessRedirect,
  isSubscriptionRecoveryPath,
} from "@/modules/billing/subscriptionAccess";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PostHogAuthenticated } from "@/components/analytics/PostHogAuthenticated";
import { ReviewDialog, useReviewModal } from "@/modules/reviews";
import { resolveMobileShellScrollRestoration } from "@/components/layouts/mobileScrollRestoration";
import {
  invalidateGuardForSubscriptionRecovery,
  resolveAuthenticatedLayoutView,
  resolveGuardAfterVerifyError,
  subscriptionGuardCoversWorkspace,
  type SubscriptionGuardResult,
} from "@/components/layouts/authenticatedLayoutView";
import { SidebarLayoutTransitionProvider } from "@/components/layouts/SidebarLayoutTransitionContext";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
  updateOnboardedStatusAsTrue?: boolean;
  workspaceId?: string | null;
}

type PendingScrollRestoration = {
  pathname: string;
  top: number;
};

const AuthenticatedLayout: React.FC<AuthenticatedLayoutProps> = ({
  children,
  updateOnboardedStatusAsTrue,
  workspaceId,
}) => {
  const isLoading = useGlobalStore((s) => s.isLoading);
  const isAuthenticated = useGlobalStore((s) => s.isAuthenticated);
  const isUserOnboarded = useGlobalStore((s) => s.isUserOnboarded);
  const setIsUserOnboarded = useGlobalStore((s) => s.setIsUserOnboarded);
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const isSidebarCollapsed = useGlobalStore((s) => s.isSidebarCollapsed);
  const setCurrentWorkspaceSubscription = useGlobalStore(
    (s) => s.setCurrentWorkspaceSubscription,
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    isOpen: isReviewModalOpen,
    reviewSource,
    closeReviewModal,
  } = useReviewModal();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  /**
   * A subscription verdict covers one workspace. Navigation and focus still
   * revalidate it, but a previously approved workspace keeps the authenticated
   * shell mounted while that check runs. Workspace changes and recovery routes
   * invalidate the verdict before protected content can render.
   */
  const [subscriptionGuard, setSubscriptionGuard] =
    useState<SubscriptionGuardResult | null>(null);
  const [subscriptionGuardRevision, setSubscriptionGuardRevision] = useState(0);
  const subscriptionVerificationGenerationRef = useRef(0);

  useEffect(() => {
    if (updateOnboardedStatusAsTrue) {
      setIsUserOnboarded(true);
    }
  }, [updateOnboardedStatusAsTrue, isUserOnboarded, setIsUserOnboarded]);

  const effectiveWorkspaceId = currentWorkspaceId ?? workspaceId ?? null;
  const isEffectivelyOnboarded =
    isUserOnboarded || Boolean(updateOnboardedStatusAsTrue);
  const search = searchParams?.toString() ?? "";
  const guardPathname = pathname ?? "/";
  const requestPath = `${guardPathname}${search ? `?${search}` : ""}`;
  const isSubscriptionRecoveryRoute = isSubscriptionRecoveryPath(requestPath);

  // A recovery tab is an intentional entitlement bypass. Clear any older
  // workspace-wide allow before paint so returning to another /settings tab
  // cannot render protected content while its fresh check is pending. The
  // generation also prevents a verification that began before recovery from
  // restoring the stale verdict between layout and passive-effect cleanup.
  useLayoutEffect(() => {
    if (!isSubscriptionRecoveryRoute) return;
    subscriptionVerificationGenerationRef.current += 1;
    setSubscriptionGuard((previous) =>
      invalidateGuardForSubscriptionRecovery(previous, true),
    );
  }, [isSubscriptionRecoveryRoute]);

  const requiresSubscriptionGuard =
    isAuthenticated && isEffectivelyOnboarded && !isSubscriptionRecoveryRoute;
  const guardCoversWorkspace = subscriptionGuardCoversWorkspace(
    subscriptionGuard,
    effectiveWorkspaceId,
  );
  const hasCurrentSubscriptionAccess =
    !requiresSubscriptionGuard ||
    (guardCoversWorkspace && subscriptionGuard?.status === "allowed");
  const hasSubscriptionGuardError =
    requiresSubscriptionGuard &&
    ((!effectiveWorkspaceId && !isLoading) ||
      (guardCoversWorkspace && subscriptionGuard?.status === "error"));
  const layoutView = resolveAuthenticatedLayoutView({
    isLoading,
    isAuthenticated,
    isOnboarded: isEffectivelyOnboarded,
    hasSubscriptionGuardError,
    hasSubscriptionAccess: hasCurrentSubscriptionAccess,
  });
  const mainRef = useRef<HTMLElement>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const historyNavigationPathnameRef = useRef<string | null>(null);
  const pendingScrollRestorationRef = useRef<PendingScrollRestoration | null>(
    null,
  );
  const currentScrollKey = pathname ?? "/";

  /**
   * Identity of the enter animation below — the top-level section, NOT the full
   * pathname.
   *
   * Re-keying on the full pathname remounts everything under this wrapper on
   * every navigation. That is wrong for any section whose sub-routes are
   * children of a persistent nested layout: `documents/view/[id]/layout.tsx`
   * owns the PDF viewer and is shared by the Document / Comments / Share /
   * Analytics tabs, so a full-pathname key tore the viewer down and reloaded
   * the document on every tab click, and left the shell's `layout` animation
   * with no previous position to interpolate from. Keying on the section lets
   * React reconcile sub-route changes normally and keeps that layout alive.
   */
  const sectionKey = currentScrollKey.split("/")[1] ?? "";

  useEffect(() => {
    const markHistoryNavigation = (): void => {
      historyNavigationPathnameRef.current = window.location.pathname;
    };

    window.addEventListener("popstate", markHistoryNavigation);
    return () => {
      window.removeEventListener("popstate", markHistoryNavigation);
    };
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const scrollPositions = scrollPositionsRef.current;
    const restoration = resolveMobileShellScrollRestoration(
      historyNavigationPathnameRef.current,
      currentScrollKey,
      scrollPositions.get(currentScrollKey),
      main.scrollHeight - main.clientHeight,
    );
    historyNavigationPathnameRef.current = null;
    pendingScrollRestorationRef.current =
      restoration.pendingTop === null
        ? null
        : {
            pathname: currentScrollKey,
            top: restoration.pendingTop,
          };
    main.scrollTo({ top: restoration.scrollTop, left: 0 });
  }, [currentScrollKey]);

  useEffect(() => {
    if (layoutView !== "ready") return;

    const main = mainRef.current;
    const pendingRestoration = pendingScrollRestorationRef.current;
    if (!main || !pendingRestoration) return;

    pendingScrollRestorationRef.current = null;
    if (pendingRestoration.pathname !== currentScrollKey) {
      return;
    }

    main.scrollTo({ top: pendingRestoration.top, left: 0 });
  }, [currentScrollKey, layoutView]);

  useEffect(() => {
    if (isLoading) return;

    switch (true) {
      case !isAuthenticated:
        router.replace("/");
        return;
      case isAuthenticated && !isEffectivelyOnboarded:
        router.replace("/onboarding");
        return;
      default:
        break;
    }

    if (isSubscriptionRecoveryRoute) {
      return;
    }

    if (!effectiveWorkspaceId) {
      return;
    }

    let active = true;
    const verificationGeneration =
      subscriptionVerificationGenerationRef.current + 1;
    subscriptionVerificationGenerationRef.current = verificationGeneration;

    const verifySubscriptionAccess = async (): Promise<void> => {
      const [entitlementResolution, subscriptionResult] = await Promise.all([
        resolvePermissionWithRetry(async () => {
          return await supabase.rpc("workspace_has_entitlement", {
            ws: effectiveWorkspaceId,
          });
        }),
        supabase
          .from("workspace_subscriptions")
          .select("*")
          .eq("workspace_id", effectiveWorkspaceId)
          .maybeSingle(),
      ]);

      if (
        !active ||
        verificationGeneration !== subscriptionVerificationGenerationRef.current
      ) {
        return;
      }

      if (!subscriptionResult.error) {
        const mapped = subscriptionResult.data
          ? mapWorkspaceSubscriptionRow(subscriptionResult.data)
          : null;
        setCurrentWorkspaceSubscription(mapped);
      } else {
        console.warn(
          "[auth-layout] subscription cache refresh failed",
          subscriptionResult.error,
        );
      }

      if (entitlementResolution.status === "error") {
        console.warn(
          "[auth-layout] subscription access verification failed",
          entitlementResolution.error,
        );
        // A transient background failure must not unmount verified content;
        // first entry still fails closed because it has no allowed verdict.
        setSubscriptionGuard((prev) =>
          resolveGuardAfterVerifyError(
            prev,
            effectiveWorkspaceId,
            subscriptionGuardRevision,
          ),
        );
        return;
      }

      if (entitlementResolution.status === "denied") {
        setSubscriptionGuard({
          workspaceId: effectiveWorkspaceId,
          revision: subscriptionGuardRevision,
          status: "redirecting",
        });
        router.replace(buildSubscriptionAccessRedirect(requestPath));
        return;
      }

      setSubscriptionGuard({
        workspaceId: effectiveWorkspaceId,
        revision: subscriptionGuardRevision,
        status: "allowed",
      });
    };

    void verifySubscriptionAccess();

    return () => {
      active = false;
    };
  }, [
    effectiveWorkspaceId,
    isAuthenticated,
    isEffectivelyOnboarded,
    isLoading,
    isSubscriptionRecoveryRoute,
    requestPath,
    router,
    setCurrentWorkspaceSubscription,
    subscriptionGuardRevision,
    supabase,
  ]);

  useEffect(() => {
    const requestRecheck = (): void => {
      setSubscriptionGuardRevision((revision) => revision + 1);
    };
    const requestRecheckWhenVisible = (): void => {
      if (document.visibilityState === "visible") {
        requestRecheck();
      }
    };

    window.addEventListener("focus", requestRecheck);
    document.addEventListener("visibilitychange", requestRecheckWhenVisible);
    return () => {
      window.removeEventListener("focus", requestRecheck);
      document.removeEventListener(
        "visibilitychange",
        requestRecheckWhenVisible,
      );
    };
  }, []);

  if (layoutView === "booting") {
    return (
      <div className="min-h-screen bg-background lg:flex">
        {/* Sidebar skeleton. Tracks the persisted collapse preference: the rail
            width is a discrete change, so a skeleton that always drew the
            expanded width would visibly re-lay-out the page on every load for
            anyone who works with the rail collapsed. */}
        <div
          className={cn(
            "hidden h-screen flex-col border-r border-sidebar-border px-3.5 py-5 lg:flex",
            isSidebarCollapsed ? "w-[68px]" : "w-[232px]",
          )}
        >
          <Skeleton
            className={cn("mb-7 h-7", isSidebarCollapsed ? "w-7" : "w-28")}
          />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        </div>
        {/* Main Content Skeleton */}
        <div className="flex-1">
          <div className="flex h-14 items-center border-b border-border px-4 lg:hidden">
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="p-4 sm:p-6 lg:p-8">
            <Skeleton className="mb-4 h-8 w-48" />
            <Skeleton className="mb-8 h-4 w-full max-w-96" />
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarLayoutTransitionProvider>
      <div className="dk-authenticated-shell min-h-screen bg-background lg:flex">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-sm focus:border focus:border-primary focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-[var(--dk-shadow-card)]"
        >
          Skip to content
        </a>
        <PostHogAuthenticated />
        <SidebarNav currentPath={pathname ?? undefined} />
        <div className="dk-authenticated-frame min-h-screen min-w-0 flex-1">
          <MobileHeader />
          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className="dk-authenticated-main min-h-screen min-w-0 flex-1 lg:pt-0 lg:pb-0"
            role="main"
            onScroll={(event) => {
              scrollPositionsRef.current.set(
                currentScrollKey,
                event.currentTarget.scrollTop,
              );
            }}
          >
            {layoutView === "subscription-error" ? (
              <div className="flex min-h-screen items-center justify-center px-4">
                <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-center shadow-[var(--dk-shadow-card)]">
                  <div className="space-y-2">
                    <h1 className="text-lg font-semibold">
                      Unable to verify your subscription
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      We couldn’t confirm workspace access. Check your
                      connection and try again.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      setSubscriptionGuardRevision((revision) => revision + 1);
                    }}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            ) : layoutView === "subscription-checking" ? (
              <div
                className="p-4 sm:p-6 lg:p-8"
                role="status"
                aria-live="polite"
              >
                <span className="sr-only">Checking subscription access…</span>
                <Skeleton className="mb-4 h-8 w-48" />
                <Skeleton className="mb-8 h-4 w-full max-w-96" />
                <div className="grid gap-4 md:grid-cols-3">
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <Skeleton className="h-32 w-full rounded-lg" />
                </div>
              </div>
            ) : (
              /* One enter transition per section change (see `sectionKey`), and
               deliberately enter-only: the App Router unmounts the outgoing page
               immediately, so there is no window in which an exit animation
               could play. Children are not animated individually — a single rise
               per navigation, never a cascade. */
              <motion.div key={sectionKey} {...riseIn}>
                {children}
              </motion.div>
            )}
          </main>
          <BottomTabBar />
        </div>
        <ReviewDialog
          open={isReviewModalOpen}
          pathname={pathname}
          reviewSource={reviewSource}
          onOpenChange={(open) => {
            if (!open) {
              closeReviewModal();
            }
          }}
        />
      </div>
    </SidebarLayoutTransitionProvider>
  );
};

export default AuthenticatedLayout;
