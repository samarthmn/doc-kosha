"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import { riseIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Whether the user has switched tabs since this group mounted.
 *
 * Panel content rises in when a tab is *clicked* — that movement is what
 * confirms the click landed. It must not rise on first paint: arriving on the
 * page already plays one rise in `AuthenticatedLayout`, and animating the panel
 * again on top of it would stack two transforms into a cascade. Radix applies
 * the same first-paint suppression to its own CSS animations
 * (`isMountAnimationPreventedRef`); this mirrors it for Motion.
 */
const TabsSwitchedContext = React.createContext(false);

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, onValueChange, ...props }, ref) => {
  const [hasSwitchedTab, setHasSwitchedTab] = React.useState(false);

  const handleValueChange = React.useCallback(
    (next: string): void => {
      setHasSwitchedTab(true);
      onValueChange?.(next);
    },
    [onValueChange],
  );

  return (
    <TabsSwitchedContext.Provider value={hasSwitchedTab}>
      <TabsPrimitive.Root
        data-slot="tabs"
        ref={ref}
        className={cn("flex flex-col gap-2", className)}
        onValueChange={handleValueChange}
        {...props}
      />
    </TabsSwitchedContext.Provider>
  );
});

Tabs.displayName = "Tabs";

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    data-slot="tabs-list"
    ref={ref}
    className={cn(
      "inline-flex h-9 w-fit items-center justify-center gap-1 border-b border-border bg-transparent text-muted-foreground",
      className,
    )}
    {...props}
  />
));

TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    data-slot="tabs-trigger"
    ref={ref}
    className={cn(
      "relative inline-flex h-full flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-t px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none after:absolute after:inset-x-1 after:bottom-[-1px] after:h-px after:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:pointer-events-none disabled:opacity-[var(--dk-disabled-opacity)] data-[state=active]:text-foreground data-[state=active]:after:bg-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      className,
    )}
    {...props}
  />
));

TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & {
    animateOnSwitch?: boolean;
  }
>(({ className, children, animateOnSwitch = true, ...props }, ref) => {
  const hasSwitchedTab = React.useContext(TabsSwitchedContext);

  // `asChild` so the panel *is* the animated element. A nested wrapper would
  // absorb the `space-y-*` call sites pass through `className`, collapsing the
  // spacing between the panel's own children.
  return (
    <TabsPrimitive.Content
      asChild
      data-slot="tabs-content"
      ref={ref}
      className={cn("flex-1 outline-none", className)}
      {...props}
    >
      <motion.div
        initial={animateOnSwitch && hasSwitchedTab ? riseIn.initial : false}
        animate={riseIn.animate}
        transition={riseIn.transition}
      >
        {children}
      </motion.div>
    </TabsPrimitive.Content>
  );
});

TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
