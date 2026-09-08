import React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  maxWidth?: "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" | "full";
}

const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className,
  maxWidth = "full",
  ...props
}) => {
  const maxWidthClass = {
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-full",
  }[maxWidth];

  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-5 sm:px-6 md:px-8 md:py-7",
        maxWidthClass,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export { PageContainer };
