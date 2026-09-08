"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch: React.FC<React.ComponentProps<typeof SwitchPrimitive.Root>> = ({
  className,
  ...props
}) => {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-input bg-muted transition-colors outline-none focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-[var(--dk-disabled-opacity)] data-[state=checked]:border-primary data-[state=checked]:bg-primary/25",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // The thumb travelling is what confirms the toggle landed, so it is a
          // transform (150ms, Tailwind's default) rather than an instant jump —
          // and it is gated for reduced motion, since it is real movement
          // rather than a colour change.
          "pointer-events-none block size-4 rounded-full bg-card ring-0 [box-shadow:var(--dk-shadow-card)] transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-primary data-[state=unchecked]:translate-x-px motion-reduce:transition-none",
        )}
      />
    </SwitchPrimitive.Root>
  );
};

export { Switch };
