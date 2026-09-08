import React, { Suspense } from "react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { cn } from "@/lib/utils";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { LinkedInInsight } from "@/components/analytics/LinkedInInsight";
import { clientEnv } from "@/lib/env";
import { APOLLO_TRACKER_APP_ID } from "@/lib/deployment";
import { PostHogMarketing } from "@/components/analytics/PostHogMarketing";
import { ApolloTracker } from "@/components/analytics/ApolloTracker";
import { MetaPixel } from "@/components/analytics/MetaPixel";

interface MarketingShellProps {
  children: React.ReactNode;
  className?: string;
  hideFooter?: boolean;
}

const MarketingShell: React.FC<MarketingShellProps> = ({
  children,
  className,
  hideFooter = false,
}) => {
  const shellContent = (
    <>
      <MarketingHeader />

      <main className={cn("relative flex-1", className)}>{children}</main>
    </>
  );

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-clip bg-background">
      <Suspense fallback={null}>
        <GoogleAnalytics gaId={clientEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        <LinkedInInsight
          partnerId={clientEnv.NEXT_PUBLIC_LINKEDIN_PARTNER_ID}
        />
        <MetaPixel pixelId={clientEnv.NEXT_PUBLIC_META_PIXEL_ID} />
        <ApolloTracker appId={APOLLO_TRACKER_APP_ID} />
      </Suspense>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[-1] h-[36rem] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_68%)]" />
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,color-mix(in_srgb,var(--border)_35%,transparent)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_36rem)] [background-size:96px_100%] opacity-30" />
      </div>

      <Suspense fallback={shellContent}>
        <PostHogMarketing>{shellContent}</PostHogMarketing>
      </Suspense>

      {!hideFooter && <MarketingFooter />}
    </div>
  );
};

export default MarketingShell;
