"use client";

import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
} from "react";

import {
  createSidebarLayoutTransitionCoordinator,
  type SidebarLayoutTransitionCoordinator,
} from "@/components/layouts/sidebarLayoutTransition";

const SidebarLayoutTransitionContext =
  createContext<SidebarLayoutTransitionCoordinator | null>(null);

export const SidebarLayoutTransitionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [coordinator] = useState(createSidebarLayoutTransitionCoordinator);

  // React StrictMode replays layout effects without recreating state. Pairing
  // activation with disposal keeps that probe usable while still closing all
  // sessions and listeners when the authenticated shell truly unmounts.
  useLayoutEffect(() => {
    coordinator.activate();
    return () => {
      coordinator.dispose();
    };
  }, [coordinator]);

  return (
    <SidebarLayoutTransitionContext.Provider value={coordinator}>
      {children}
    </SidebarLayoutTransitionContext.Provider>
  );
};

export const useSidebarLayoutTransitionCoordinator =
  (): SidebarLayoutTransitionCoordinator => {
    const coordinator = useContext(SidebarLayoutTransitionContext);
    if (!coordinator) {
      throw new Error(
        "Sidebar layout transition coordinator requires the authenticated shell provider",
      );
    }
    return coordinator;
  };

export const useOptionalSidebarLayoutTransitionCoordinator =
  (): SidebarLayoutTransitionCoordinator | null =>
    useContext(SidebarLayoutTransitionContext);
