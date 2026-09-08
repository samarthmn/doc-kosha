"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Copy } from "@phosphor-icons/react";
import type { LinkFeatureBadge } from "./linkFeatures";

interface LinkListItemProps {
  linkId: string;
  title: string;
  createdAtLabel?: string;
  shareUrl: string;
  badges: LinkFeatureBadge[];
  actions?: React.ReactNode;
  onCopy?: () => void | Promise<void>;
  copyButtonAriaLabel?: string;
}

const LinkListItem: React.FC<LinkListItemProps> = ({
  linkId,
  title,
  createdAtLabel,
  shareUrl,
  badges,
  actions,
  onCopy,
  copyButtonAriaLabel,
}) => {
  const copyLabel = copyButtonAriaLabel || "Copy link";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm leading-tight font-medium break-words sm:text-base">
            {title}
          </p>
          {createdAtLabel ? (
            <p className="text-xs text-muted-foreground">{createdAtLabel}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="text"
          value={shareUrl}
          readOnly
          className="min-w-0 flex-1 text-xs sm:text-sm"
          aria-label="Share link"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onCopy?.()}
          aria-label={copyLabel}
        >
          <Copy className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {badges.length ? (
          badges.map((feature) => {
            const descriptionId = `link-feature-${linkId}-${feature.key}`;
            return (
              <HoverCard key={descriptionId}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-describedby={descriptionId}
                  >
                    <feature.icon className="h-3.5 w-3.5" aria-hidden />
                    {feature.label}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-64">
                  <p
                    className="text-sm leading-relaxed text-popover-foreground"
                    id={descriptionId}
                  >
                    {feature.description}
                  </p>
                </HoverCardContent>
              </HoverCard>
            );
          })
        ) : (
          <span className="text-xs text-muted-foreground">
            No additional controls enabled.
          </span>
        )}
      </div>
    </div>
  );
};

export default LinkListItem;
