"use client";

import React, { useEffect, useRef, useState } from "react";
import { Shield } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface ScreenshotShieldProps {
  enabled: boolean;
  className?: string;
  children: React.ReactNode;
}

const SCREENSHOT_HOTKEY_DURATION_MS = 1500;

const isScreenshotHotkey = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();
  // NOTE: Browsers can't truly block OS-level screenshots.
  // On Windows, `PrintScreen` key events arrive *after* the OS has already captured the screen.
  // We can only show a best-effort shield overlay to deter casual capture.
  if (event.key === "PrintScreen") return true;
  if (event.metaKey && event.shiftKey && ["3", "4", "5", "s"].includes(key))
    return true;
  return false;
};

const ScreenshotShield: React.FC<ScreenshotShieldProps> = ({
  enabled,
  className,
  children,
}) => {
  const [shieldActive, setShieldActive] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setShieldActive(false);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        setShieldActive(true);
      } else {
        setShieldActive(false);
      }
    };

    const handleBlur = () => setShieldActive(true);
    const handleFocus = () => setShieldActive(false);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (!isScreenshotHotkey(event)) return;
      setShieldActive(true);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        setShieldActive(false);
        timeoutRef.current = null;
      }, SCREENSHOT_HOTKEY_DURATION_MS);
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled]);

  return (
    <div className={cn("relative", className)} data-dk-screenshot-shield>
      {children}
      {enabled && shieldActive ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-md">
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Shield aria-hidden className="h-5 w-5" />
            <span>Screenshot protection enabled</span>
            <span className="max-w-88 text-center text-xs text-muted-foreground/80">
              Best-effort only. OS-level screenshots (for example, Windows{" "}
              <span className="font-medium">PrintScreen</span>) can’t be fully
              blocked in the browser.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ScreenshotShield;
