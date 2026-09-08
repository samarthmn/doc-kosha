"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { THEME_CLASS_NAMES, type Theme } from "@/types/theme";

const ThemeClassApplier: React.FC = () => {
  const theme = useGlobalStore((s) => s.theme);
  const pathname = usePathname();

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(...THEME_CLASS_NAMES);

    // Check if we are on a public share route
    const isPublicRoute =
      pathname?.startsWith("/d/") || pathname?.startsWith("/r/");

    // If public route, force system behavior (light/dark only)
    // Otherwise respect the user's selected theme
    const effectiveTheme = isPublicRoute ? "system" : theme;

    let nextTheme: Theme = effectiveTheme;

    if (effectiveTheme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      nextTheme = prefersDark ? "dark" : "light";
    }

    root.classList.add(nextTheme);
  }, [theme, pathname]);

  return null;
};

export default ThemeClassApplier;
