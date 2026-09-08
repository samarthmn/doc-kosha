"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import {
  appendLandingAttribution,
  LANDING_PAGE_PATH,
  LANDING_PAGE_SOURCE,
  PRICING_PAGE_SOURCE,
} from "@/lib/analytics/landingAttribution";

interface HeaderButtonsProps {
  direction?: "row" | "col";
  className?: string;
}

const HeaderButtons: React.FC<HeaderButtonsProps> = ({
  direction = "row",
  className,
}) => {
  const isAuthenticated = useGlobalStore((s) => s.isAuthenticated);
  const isUserOnboarded = useGlobalStore((s) => s.isUserOnboarded);
  const pathname = usePathname();

  const startFreeHref = (() => {
    const params = new URLSearchParams();
    params.set("redirect", "/onboarding");
    const source =
      pathname === LANDING_PAGE_PATH
        ? LANDING_PAGE_SOURCE
        : pathname === "/pricing" || pathname?.startsWith("/pricing/")
          ? PRICING_PAGE_SOURCE
          : undefined;
    appendLandingAttribution(params, { source });
    return `/auth/sign-in?${params.toString()}`;
  })();

  return (
    <div
      className={cn(
        "flex items-center gap-4",
        direction === "col" ? "flex-col items-stretch" : undefined,
        className,
      )}
    >
      {isAuthenticated ? (
        <Link
          href={isUserOnboarded ? "/dashboard" : "/onboarding"}
          className={cn(buttonVariants({ variant: "default" }))}
        >
          Dashboard
        </Link>
      ) : (
        <>
          <Link href="/auth/sign-in" className="text-sm hover:underline">
            Sign In
          </Link>
          <Link
            href={startFreeHref}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Start free
          </Link>
        </>
      )}
    </div>
  );
};

export default HeaderButtons;
