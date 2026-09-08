import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { buildBrandingInitials, isSafeLogoSource } from "@/lib/branding";

interface BrandingHeaderProps {
  companyName?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  tagline?: string | null;
  className?: string;
  domainLabel?: string | null;
  domainVerified?: boolean;
  compact?: boolean;
}

const BrandingHeader: React.FC<BrandingHeaderProps> = ({
  companyName,
  websiteUrl: _websiteUrl,
  logoUrl,
  tagline,
  className,
  domainLabel,
  domainVerified,
  compact = false,
}) => {
  const resolvedName = companyName?.trim() || "Your company";
  const initials = buildBrandingInitials(companyName);
  const safeLogoUrl = isSafeLogoSource(logoUrl ?? undefined)
    ? (logoUrl ?? undefined)
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/90 shadow-sm backdrop-blur",
        compact ? "p-3" : "p-5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <Avatar
          className={cn(
            "shrink-0 border border-border/70",
            compact ? "h-10 w-10" : "h-14 w-14",
          )}
        >
          {safeLogoUrl ? (
            <AvatarImage
              src={safeLogoUrl}
              alt={`${resolvedName} logo`}
              className="object-cover"
            />
          ) : null}
          <AvatarFallback
            className={cn(
              "bg-muted font-semibold text-primary uppercase",
              compact ? "text-xs" : "text-base",
            )}
          >
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <p
            className={cn(
              "leading-tight font-semibold text-foreground",
              compact ? "text-sm" : "text-lg",
            )}
          >
            {resolvedName}
          </p>
          {tagline ? (
            <p
              className={cn(
                "text-muted-foreground",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {tagline}
            </p>
          ) : null}
          {domainLabel ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {/* Verified domain indicator */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={cn(
                  "h-3 w-3",
                  domainVerified ? "text-emerald-500" : "text-muted-foreground",
                )}
                aria-hidden="true"
              >
                <path d="M12 22c4.97 0 9-4.03 9-9 0-1.08-.2-2.12-.56-3.08a1 1 0 0 0-.58-.58A8.984 8.984 0 0 0 12 3 8.984 8.984 0 0 0 4.14 9.34a1 1 0 0 0-.58.58A8.99 8.99 0 0 0 3 13c0 4.97 4.03 9 9 9Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span className="truncate">
                {domainLabel}
                {domainVerified ? " • Verified" : ""}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="hidden flex-col items-end text-right md:flex">
        <span className="text-xs tracking-wider text-muted-foreground uppercase">
          Document provided by
        </span>
        <span className="text-sm font-medium text-foreground">
          {resolvedName}
        </span>
      </div>
    </div>
  );
};

export default BrandingHeader;
