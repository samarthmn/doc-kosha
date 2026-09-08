import React from "react";
import Logo from "@/components/ui/logo";

const ScreenLoader: React.FC = () => (
  <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-6">
    <div className="dk-nocturne-surface relative flex min-w-40 flex-col items-center justify-center gap-4 rounded-lg px-8 py-7">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="motion-safe:animate-pulse motion-safe:duration-[2000ms]">
        <Logo className="h-10 w-10 text-primary" aria-hidden />
      </div>

      <div className="flex flex-col items-center gap-1">
        <h3 className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
          Loading
        </h3>
      </div>
    </div>
  </div>
);

export default ScreenLoader;
