"use client";

import React from "react";
import { Palette } from "@phosphor-icons/react";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { THEMES, type Theme } from "@/types/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BASIC_THEME_VALUES: ReadonlyArray<Theme> = ["system", "light", "dark"];

const basicThemes = THEMES.filter((t) => BASIC_THEME_VALUES.includes(t.value));
const accentThemes = THEMES.filter(
  (t) => !BASIC_THEME_VALUES.includes(t.value),
);

const MarketingThemeToggle: React.FC<{ className?: string }> = ({
  className,
}) => {
  const theme = useGlobalStore((s) => s.theme);
  const setTheme = useGlobalStore((s) => s.setTheme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9 rounded-md", className)}
          aria-label="Change theme"
        >
          <Palette className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(next) => setTheme(next as Theme)}
        >
          {basicThemes.map((t) => (
            <DropdownMenuRadioItem key={t.value} value={t.value}>
              {t.label}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          {accentThemes.map((t) => (
            <DropdownMenuRadioItem key={t.value} value={t.value}>
              {t.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default MarketingThemeToggle;
