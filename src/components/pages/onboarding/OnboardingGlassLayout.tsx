import React, { ReactNode } from "react";
import Logo from "@/components/ui/logo";

interface OnboardingGlassLayoutProps {
  children: ReactNode;
  stepIndicator?: string;
  maxWidth?: string;
}

const OnboardingGlassLayout: React.FC<OnboardingGlassLayoutProps> = ({
  children,
  stepIndicator,
  maxWidth = "max-w-xl",
}) => (
  <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-background">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_48%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_56%)] [background-size:96px_100%] opacity-25" />
    </div>

    <div className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Logo className="h-[22px] w-[22px] text-foreground" aria-hidden />
        <span className="text-base font-medium tracking-[-0.015em] text-foreground">
          DocKosha
        </span>
      </div>
      {stepIndicator ? (
        <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-[var(--dk-shadow-card)]">
          Step {stepIndicator}
        </span>
      ) : null}
    </div>

    <main className="relative z-10 flex flex-1 items-center justify-center p-4 sm:p-6">
      <div
        className={`w-full ${maxWidth} animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none`}
      >
        <div className="dk-nocturne-surface relative rounded-lg p-6 sm:p-8">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
          {children}
        </div>
      </div>
    </main>
  </div>
);

export default OnboardingGlassLayout;
