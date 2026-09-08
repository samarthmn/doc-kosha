"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    data-slot="checkbox"
    className={cn(
      "peer size-4 shrink-0 rounded border border-input bg-card text-primary outline-none focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-[var(--dk-disabled-opacity)] data-[state=checked]:border-primary data-[state=checked]:bg-primary/15",
      className,
    )}
    {...props}
  >
    {/* Radix mounts the indicator only when checked, so the tick's arrival is
        a mount — a plain `transition-opacity` would never run. A 120ms fade
        keeps it from snapping in. */}
    <CheckboxPrimitive.Indicator
      className={cn(
        "flex items-center justify-center text-current",
        "animate-in duration-[120ms] ease-out fade-in-0 motion-reduce:animate-none",
      )}
    >
      <Check className="size-3.5" weight="bold" aria-hidden />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
