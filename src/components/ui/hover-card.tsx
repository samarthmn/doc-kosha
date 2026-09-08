import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/lib/utils";

const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;
const HoverCardPortal = HoverCardPrimitive.Portal;

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(
  (
    { className, align = "center", sideOffset = 8, children, ...props },
    ref,
  ) => (
    <HoverCardPortal>
      <HoverCardPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-64 rounded-lg border bg-popover p-3 text-sm text-popover-foreground [box-shadow:var(--dk-shadow-dialog)] outline-none data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:duration-150 data-[state=open]:ease-out data-[state=open]:fade-in-0 motion-reduce:animate-none motion-reduce:transition-none",
          className,
        )}
        {...props}
      >
        <HoverCardPrimitive.Arrow
          className="fill-popover"
          width={12}
          height={6}
        />
        {children}
      </HoverCardPrimitive.Content>
    </HoverCardPortal>
  ),
);
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
