"use client";

import { PropsWithChildren, useEffect, useMemo, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { initialFetch } from "@/server/initialFetch";

const InitializeStore: React.FC<PropsWithChildren> = ({ children }) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const {
    isAuthenticated,
    authUser,
    setAuthUser,
    setIsAuthenticated,
    setIsLoading,
    setUserProfile,
    setIsUserOnboarded,
    setWorkspaces,
    setCurrentWorkspaceId,
    setShouldFetchInitialData,
    shouldFetchInitialData,
    setCurrentWorkspaceSubscription,
    setCheckoutPending,
  } = useGlobalStore((s) => s);

  const hasHydratedOnceRef = useRef(false);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const authUserRef = useRef(authUser);
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);
  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  useEffect(() => {
    let active = true;
    const initialCalls = async () => {
      // Avoid flashing the full-app skeleton for background refreshes
      // (e.g., auth token refreshes or internal revalidation).
      if (!hasHydratedOnceRef.current) {
        setIsLoading(true);
      }
      try {
        const {
          authUser,
          isAuthenticated,
          profile,
          workspaces,
          currentWorkspaceId,
          isUserOnboarded,
          workspaceSubscription,
        } = await initialFetch({ supabase });

        if (!active) return;
        setAuthUser(authUser);
        setIsAuthenticated(isAuthenticated);
        setUserProfile(profile);
        setWorkspaces(workspaces || []);
        // Always write the workspace id (including null) so stale values
        // from prior sessions/users are cleared.
        setCurrentWorkspaceId(currentWorkspaceId);
        setCurrentWorkspaceSubscription(workspaceSubscription ?? null);
        setIsUserOnboarded(isUserOnboarded);
      } catch {
        // console.error("Failed to fetch initial data:", error);
      } finally {
        if (active) {
          hasHydratedOnceRef.current = true;
          setShouldFetchInitialData(false);
          setIsLoading(false);
        }
      }
    };
    if (shouldFetchInitialData) {
      initialCalls();
    }
    return () => {
      active = false;
    };
  }, [
    supabase,
    setAuthUser,
    setIsAuthenticated,
    setIsLoading,
    setIsUserOnboarded,
    setUserProfile,
    setWorkspaces,
    setCurrentWorkspaceId,
    setCurrentWorkspaceSubscription,
    shouldFetchInitialData,
    setShouldFetchInitialData,
  ]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        const wasAuthenticated = isAuthenticatedRef.current;
        setIsAuthenticated(true);
        setAuthUser(session?.user ?? null);
        void fetch("/api/auth/login-activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ occurredAt: new Date().toISOString() }),
        }).catch((error: unknown) => {
          console.warn("[initialize-store] login activity hook failed", error);
        });
        // Ensure we (re)hydrate profile/workspaces/subscription after auth settles,
        // especially for OAuth + magic-link redirects where the first fetch can run too early.
        if (!wasAuthenticated) {
          // Clear any stale workspace state before we re-hydrate for the new session.
          // This prevents the onboarding flow from incorrectly thinking a brand-new user
          // already has a workspace.
          if (
            session?.user?.id &&
            authUserRef.current?.id !== session.user.id
          ) {
            setUserProfile(null);
            setIsUserOnboarded(false);
            setWorkspaces([]);
            setCurrentWorkspaceId(null);
            setCurrentWorkspaceSubscription(null);
            setCheckoutPending(false);
          }
          setShouldFetchInitialData(true);
        }
      }
      if (event === "SIGNED_OUT") {
        setIsAuthenticated(false);
        setAuthUser(null);
        setUserProfile(null);
        setIsUserOnboarded(false);
        setWorkspaces([]);
        setCurrentWorkspaceId(null);
        setCurrentWorkspaceSubscription(null);
        setCheckoutPending(false);
      }
      if (event === "TOKEN_REFRESHED") {
        // Keep the in-memory user up to date without triggering a full re-hydration
        // (which can look like a page refresh when switching tabs).
        setIsAuthenticated(true);
        setAuthUser(session?.user ?? null);
      }
      if (event === "USER_UPDATED") {
        setAuthUser(session?.user ?? null);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [
    supabase,
    setIsAuthenticated,
    setAuthUser,
    setUserProfile,
    setIsUserOnboarded,
    setWorkspaces,
    setCurrentWorkspaceId,
    setCurrentWorkspaceSubscription,
    setCheckoutPending,
    setShouldFetchInitialData,
  ]);
  return children;
};

export default InitializeStore;
