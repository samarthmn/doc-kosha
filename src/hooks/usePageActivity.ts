"use client";

import { useEffect, useState } from "react";

const getInitialActivityState = (): boolean => {
  if (typeof document === "undefined") {
    return true;
  }
  const isVisible = document.visibilityState !== "hidden";
  const hasFocus =
    typeof document.hasFocus === "function" ? document.hasFocus() : true;
  return isVisible && hasFocus;
};

export const usePageActivity = (): boolean => {
  const [isActive, setIsActive] = useState<boolean>(getInitialActivityState);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const update = () => {
      setIsActive(getInitialActivityState());
    };
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);

  return isActive;
};
