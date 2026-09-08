import React from "react";
import { cn } from "@/lib/utils";
import { Lightning, Lock, Shield } from "@phosphor-icons/react/ssr";

const PricingWhyChoose: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("py-8", className)}>
      <div className="mb-12">
        <h3 className="mb-4 text-3xl font-medium tracking-[-0.03em]">
          Why teams choose DocKosha
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="flex flex-col items-start rounded-lg border bg-card p-6 [box-shadow:var(--dk-shadow-card)]">
          <div className="mb-5 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-primary">
            <Shield aria-hidden className="size-5" />
          </div>
          <h4 className="mb-2 text-xl font-medium">
            Predictable Room Economics
          </h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Workspace-based pricing helps lean teams avoid per-user or
            per-viewer creep as sensitive workflows move externally.
          </p>
        </div>

        <div className="flex flex-col items-start rounded-lg border bg-card p-6 [box-shadow:var(--dk-shadow-card)]">
          <div className="mb-5 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-primary">
            <Lightning aria-hidden className="size-5" />
          </div>
          <h4 className="mb-2 text-xl font-medium">Faster Deal Setup</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Get a clean room live quickly with high-fidelity viewing, bulk
            uploads, and controls that do not require a heavyweight rollout.
          </p>
        </div>

        <div className="flex flex-col items-start rounded-lg border bg-card p-6 [box-shadow:var(--dk-shadow-card)]">
          <div className="mb-5 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-primary">
            <Lock aria-hidden className="size-5" />
          </div>
          <h4 className="mb-2 text-xl font-medium">
            Serious Controls, Less Drag
          </h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Apply watermarking, gates, permissions, and analytics in a workflow
            that fits repeated secure sharing, not one giant enterprise rollout.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingWhyChoose;
