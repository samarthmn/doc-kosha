"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

const Avatar: React.FC<React.ComponentProps<typeof AvatarPrimitive.Root>> = ({
  className,
  ...props
}) => {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-10 shrink-0 overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
};

const AvatarImage: React.FC<
  React.ComponentProps<typeof AvatarPrimitive.Image>
> = ({ className, ...props }) => {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
};

const AvatarFallback: React.FC<
  React.ComponentProps<typeof AvatarPrimitive.Fallback>
> = ({ className, ...props }) => {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted",
        className,
      )}
      {...props}
    />
  );
};

export { Avatar, AvatarImage, AvatarFallback };
