"use client";

import { Theme } from "@/types/theme";
import React, { createContext, useContext, useRef } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { persist, createJSONStorage } from "zustand/middleware";
import { User } from "@supabase/supabase-js";
import { Tables } from "@/types/generated/supabase";
import { StorageKeys } from "@/types/storage";
import { WorkspaceSubscriptionLike } from "@/modules/billing/types";

type GlobalState = {
  isSidebarCollapsed: boolean;
  theme: Theme;
  isLoading: boolean;
  isAuthenticated: boolean;
  isUserOnboarded: boolean;
  authUser: User | null;
  userProfile: Tables<"profiles"> | null;
  currentWorkspaceId: string | null;
  workspaces: Tables<"workspaces">[];
  shouldFetchInitialData: boolean;
  currentWorkspaceSubscription: WorkspaceSubscriptionLike | null;
  checkoutPending: boolean;
};

type GlobalActions = {
  toggleSidebarCollapsed: () => void;
  setTheme: (theme: Theme) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsAuthenticated: (isAuthenticated: boolean) => void;
  setIsUserOnboarded: (isUserOnboarded: boolean) => void;
  setAuthUser: (authUser: User | null) => void;
  setUserProfile: (userProfile: Tables<"profiles"> | null) => void;
  setCurrentWorkspaceId: (id: string | null) => void;
  setWorkspaces: (ws: Tables<"workspaces">[]) => void;
  setShouldFetchInitialData: (shouldFetchInitialData: boolean) => void;
  setCurrentWorkspaceSubscription: (
    subscription: WorkspaceSubscriptionLike | null,
  ) => void;
  setCheckoutPending: (pending: boolean) => void;
};

type GlobalStore = GlobalState & GlobalActions;

const defaultGlobalState: GlobalState = {
  isSidebarCollapsed: false,
  theme: "system",
  isLoading: true,
  isAuthenticated: false,
  isUserOnboarded: false,
  authUser: null,
  userProfile: null,
  currentWorkspaceId: null,
  workspaces: [],
  shouldFetchInitialData: true,
  currentWorkspaceSubscription: null,
  checkoutPending: false,
};

const createGlobalStore = (initState: GlobalState = defaultGlobalState) => {
  return createStore<GlobalStore>()(
    persist(
      (set) => ({
        ...initState,
        toggleSidebarCollapsed: () =>
          set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
        setTheme: (theme: Theme) => set({ theme }),
        setIsLoading: (isLoading: boolean) => set({ isLoading }),
        setAuthUser: (authUser: User | null) => set({ authUser }),
        setIsAuthenticated: (isAuthenticated: boolean) =>
          set({ isAuthenticated }),
        setIsUserOnboarded: (isUserOnboarded: boolean) =>
          set({ isUserOnboarded }),
        setUserProfile: (userProfile: Tables<"profiles"> | null) =>
          set({ userProfile }),
        setCurrentWorkspaceId: (id: string | null) =>
          set({ currentWorkspaceId: id }),
        setWorkspaces: (ws: Tables<"workspaces">[]) => set({ workspaces: ws }),
        setShouldFetchInitialData: (shouldFetchInitialData: boolean) =>
          set({ shouldFetchInitialData }),
        setCurrentWorkspaceSubscription: (subscription) =>
          set({ currentWorkspaceSubscription: subscription }),
        setCheckoutPending: (pending: boolean) =>
          set({ checkoutPending: pending }),
      }),
      {
        name: StorageKeys.GlobalStore,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          isSidebarCollapsed: state.isSidebarCollapsed,
          theme: state.theme,
        }),
      },
    ),
  );
};

type GlobalStoreApi = ReturnType<typeof createGlobalStore>;

const GlobalStoreContext = createContext<GlobalStoreApi | undefined>(undefined);

interface GlobalStoreProviderProps {
  children: React.ReactNode;
}

export const GlobalStoreProvider: React.FC<GlobalStoreProviderProps> = ({
  children,
}) => {
  const storeRef = useRef<GlobalStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createGlobalStore();
  }
  return React.createElement(
    GlobalStoreContext.Provider,
    { value: storeRef.current },
    children,
  );
};

export const useGlobalStore = <T>(selector: (store: GlobalStore) => T): T => {
  const globalStoreContext = useContext(GlobalStoreContext);

  if (!globalStoreContext) {
    throw new Error("useGlobalStore must be used within GlobalStoreProvider");
  }

  return useStore(globalStoreContext, selector);
};
