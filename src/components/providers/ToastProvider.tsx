"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ToastContainer, type Theme } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { dkToastTransition } from "@/lib/toast";

const mapToToastifyTheme = (effective: "light" | "dark"): Theme => {
  return effective === "dark" ? "dark" : "light";
};

const ToastProvider: React.FC = () => {
  const theme = useGlobalStore((s) => s.theme);
  const [effective, setEffective] = useState<"light" | "dark">("dark");

  // Derive an actual light/dark value from our theme system (including "system").
  useEffect(() => {
    if (theme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      setEffective(prefersDark ? "dark" : "light");
      return;
    }
    setEffective(theme === "dark" || theme === "midnight" ? "dark" : "light");
  }, [theme]);

  // Tailwind classes use CSS variables defined per theme; these will adapt automatically.
  const classNames = useMemo(
    () => ({
      toast:
        "bg-card text-card-foreground border border-border shadow-lg rounded-lg " +
        "[&_button.Toastify__close-button]:text-muted-foreground [&_button.Toastify__close-button:hover]:text-foreground",
      container: "!z-[1000]",
    }),
    [],
  );

  return (
    <ToastContainer
      position="bottom-right"
      autoClose={3000}
      transition={dkToastTransition}
      closeOnClick
      pauseOnHover
      newestOnTop
      draggable
      hideProgressBar={false}
      theme={mapToToastifyTheme(effective)}
      toastClassName={() => classNames.toast}
      className={classNames.container}
    />
  );
};

export default ToastProvider;
