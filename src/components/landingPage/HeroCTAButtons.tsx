"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import {
  appendLandingAttribution,
  type LandingAttribution,
} from "@/lib/analytics/landingAttribution";

interface HeroCTAButtonsProps {
  attribution?: LandingAttribution;
  onPrimaryClick?: () => void;
  label?: string;
  showMicrocopy?: boolean;
}

const HeroCTAButtons: React.FC<HeroCTAButtonsProps> = ({
  attribution = {},
  onPrimaryClick,
  label,
  showMicrocopy = true,
}) => {
  const isAuthenticated = useGlobalStore((s) => s.isAuthenticated);
  const isUserOnboarded = useGlobalStore((s) => s.isUserOnboarded);

  const primaryHref = (() => {
    if (isAuthenticated) {
      return isUserOnboarded ? "/dashboard" : "/onboarding";
    }

    const params = new URLSearchParams();
    params.set("redirect", "/onboarding");
    appendLandingAttribution(params, attribution);
    return `/auth/sign-in?${params.toString()}`;
  })();

  const primaryLabel =
    label ??
    (isAuthenticated
      ? isUserOnboarded
        ? "Go to Dashboard"
        : "Continue Onboarding"
      : "Start free");

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <Button asChild size="lg">
          <Link href={primaryHref} onClick={onPrimaryClick}>
            {primaryLabel}
          </Link>
        </Button>
      </div>
      {!isAuthenticated && showMicrocopy ? (
        <p className="text-center text-sm text-muted-foreground">
          Free forever plan available. Upgrade when you need more capacity.
        </p>
      ) : null}
    </div>
  );
};

export default HeroCTAButtons;
