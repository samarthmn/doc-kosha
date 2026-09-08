import React, { ReactNode } from "react";
import Link from "next/link";
import {
  ChartBar,
  Lightning,
  Lock,
  ShieldCheck,
  Users,
} from "@phosphor-icons/react";
import Logo from "@/components/ui/logo";

const AuthGlassLayout = ({ children }: { children: ReactNode }) => (
  <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-background lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)]">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,color-mix(in_srgb,var(--primary)_9%,transparent),transparent_34%)]" />
    {/* Left Panel: Form */}
    <div className="relative z-10 flex flex-col px-6 py-7 sm:px-10 lg:justify-center lg:px-[clamp(3rem,7vw,7rem)]">
      <div className="mb-12 lg:absolute lg:top-7 lg:left-8 lg:mb-0">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-sm transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Logo className="h-[22px] w-[22px]" aria-hidden />
          <span className="text-base font-medium tracking-[-0.015em]">
            DocKosha
          </span>
        </Link>
      </div>

      <div className="mx-auto w-full max-w-[23rem]">{children}</div>
    </div>

    {/* Right Panel: Visual / Branding (Hidden on mobile) */}
    <div className="relative hidden w-full flex-col items-center justify-center overflow-hidden border-l border-border bg-muted/25 p-12 lg:flex">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_62%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(circle_at_center,black,transparent_72%)] [background-size:48px_48px] opacity-35" />

      {/* Content wrapper */}
      <div className="relative z-10 max-w-[31rem]">
        <div className="dk-nocturne-surface relative rounded-lg p-8">
          <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
          <div className="mb-6 space-y-3">
            <h2 className="text-3xl leading-[1.1] font-medium tracking-[-0.015em] text-balance text-foreground">
              Secure document sharing for modern teams.
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Stop sending attachments. Start sharing tracked, watermarked links
              that you control.
            </p>
          </div>

          {/* Feature Icons */}
          <div className="mt-7 grid grid-cols-5 gap-2 border-t border-border pt-6">
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-md border border-primary/25 bg-primary/8 p-2 text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                Secure
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-md border border-primary/25 bg-primary/8 p-2 text-primary">
                <Lightning className="h-4 w-4" aria-hidden />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                Fast
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-md border border-primary/25 bg-primary/8 p-2 text-primary">
                <Lock className="h-4 w-4" aria-hidden />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                Control
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-md border border-primary/25 bg-primary/8 p-2 text-primary">
                <ChartBar className="h-4 w-4" aria-hidden />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                Analytics
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-md border border-primary/25 bg-primary/8 p-2 text-primary">
                <Users className="h-4 w-4" aria-hidden />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                Teams
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default AuthGlassLayout;
