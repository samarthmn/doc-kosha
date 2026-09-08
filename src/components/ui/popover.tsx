"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      sideOffset={8}
      className={cn(
        // Ensure popover appears above modal (modal uses z-50)
        // and has sensible default surface styles
        // Anchored surface: fades in with a 4px slide from the trigger's side
        // (150ms out, 150ms back) so it reads as emanating from what was
        // clicked. No zoom — a scaling entrance implies the panel is arriving
        // from depth, which nothing here is.
        "z-[60] rounded-lg border bg-popover p-2 text-popover-foreground [box-shadow:var(--dk-shadow-dialog)] outline-none data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:duration-150 data-[state=open]:ease-out data-[state=open]:fade-in-0 motion-reduce:animate-none motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
