import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-primary/35 bg-primary/10 text-primary [a&]:hover:bg-primary/20",
        secondary:
          "border-border bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/70",
        destructive:
          "border-destructive/45 bg-destructive/10 text-destructive [a&]:hover:bg-destructive/20 focus-visible:ring-destructive",
        outline:
          "border-border bg-transparent text-foreground [a&]:hover:bg-accent/60 [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant,
  asChild = false,
  ...props
}) => {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
};
