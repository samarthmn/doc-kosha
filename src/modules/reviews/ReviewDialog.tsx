"use client";

import React, { useEffect, useRef } from "react";
import { ArrowSquareOut, Star, X } from "@phosphor-icons/react";
import { capturePostHogEvent } from "@/lib/analytics/posthog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildReviewAnalyticsProperties } from "@/modules/reviews/analytics";
import {
  REVIEW_SITES,
  type ReviewSite,
  type ReviewSiteId,
} from "@/modules/reviews/config";

const getPrimarySites = (): ReviewSite[] =>
  [...REVIEW_SITES].sort((left, right) => left.priority - right.priority);

const trackReviewEvent = (
  event: string,
  options: {
    pathname?: string | null;
    reviewSource?: string | null;
    siteId?: ReviewSiteId;
  },
): void => {
  void capturePostHogEvent({
    event,
    properties: buildReviewAnalyticsProperties(options),
  });
};

type ReviewDialogProps = {
  open: boolean;
  pathname?: string | null;
  reviewSource?: string | null;
  onOpenChange: (open: boolean) => void;
};

const ReviewSiteCard: React.FC<{
  site: ReviewSite;
  onSelect: (siteId: ReviewSiteId) => void;
}> = ({ site, onSelect }) => {
  return (
    <Card className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--dk-shadow-card)] transition-[border-color,background-color] duration-150 hover:border-primary/45 hover:bg-primary/[0.03]">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
      <CardHeader className="relative z-10 flex flex-1 flex-col gap-2 p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-4">
            <div className="min-w-0">
              <CardTitle className="text-base font-medium tracking-[-0.01em]">
                {site.label}
              </CardTitle>
            </div>
          </div>
        </div>
        <CardDescription className="text-sm leading-relaxed text-muted-foreground/90">
          {site.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 p-4">
        <Button
          asChild
          className="h-9 w-full justify-between rounded-md border border-primary bg-transparent text-primary shadow-none hover:bg-primary/10 hover:text-primary"
          variant="outline"
        >
          <a
            href={site.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onSelect(site.id)}
            aria-label={`Write a review on ${site.label}`}
          >
            Write a Review
            <ArrowSquareOut
              className="h-4 w-4 opacity-70 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden
            />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};

export const ReviewDialog: React.FC<ReviewDialogProps> = ({
  open,
  pathname,
  reviewSource,
  onOpenChange,
}) => {
  const previousOpenRef = useRef(open);
  const primarySites = getPrimarySites();

  useEffect(() => {
    if (!previousOpenRef.current && open) {
      trackReviewEvent("review_modal_opened", {
        pathname,
        reviewSource,
      });
    }

    if (previousOpenRef.current && !open) {
      trackReviewEvent("review_modal_closed", {
        pathname,
        reviewSource,
      });
    }

    previousOpenRef.current = open;
  }, [open, pathname, reviewSource]);

  const handleSiteSelect = (siteId: ReviewSiteId): void => {
    trackReviewEvent("review_site_clicked", {
      pathname,
      reviewSource,
      siteId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-[14px] border border-border bg-[var(--dk-surface-overlay)] p-0 shadow-[var(--dk-shadow-dialog)] sm:max-h-[86vh]">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
          <DialogHeader className="relative shrink-0 border-b border-border px-5 pt-5 pb-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/8 text-primary">
                    <Star className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="space-y-2">
                    <DialogTitle className="text-xl font-medium tracking-[-0.015em] text-balance">
                      Review DocKosha
                    </DialogTitle>
                    <DialogDescription className="max-w-2xl text-sm leading-6">
                      Share an honest review on the platform you trust most.
                      Each option opens in a new tab.
                    </DialogDescription>
                  </div>
                </div>
              </div>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md border border-border bg-background/60 shadow-none hover:bg-background"
                  aria-label="Close review modal"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          <div
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-7 sm:pb-8"
            data-review-scroll-area
          >
            <section className="pt-5 sm:pt-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium tracking-[-0.01em]">
                    Review Sites
                  </h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Choose the platform you trust most for sharing feedback
                    about DocKosha.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {primarySites.map((site) => (
                  <ReviewSiteCard
                    key={site.id}
                    site={site}
                    onSelect={handleSiteSelect}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
