"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { THEMES, type Theme } from "@/types/theme";
import { Badge } from "@/components/ui/badge";
import { Check, Desktop, Moon, Sun } from "@phosphor-icons/react";

/**
 * Which palette(s) each theme option previews. Values are the palette scopes
 * from `src/app/globals.css` — never colours. The swatch is painted with
 * `bg-background` / `bg-card` / `bg-sidebar` / `bg-primary` / `border-border`
 * inside the scope, so editing a palette in globals.css updates the preview
 * automatically and the two can no longer drift apart.
 *
 * `system` previews both halves of what the OS may resolve to.
 */
const THEME_PREVIEW_SCOPES = {
  system: ["light", "dark"],
  light: ["light"],
  dark: ["dark"],
  copper: ["copper"],
  forest: ["forest"],
  lavender: ["lavender"],
  midnight: ["midnight"],
  ocean: ["ocean"],
  sunset: ["sunset"],
} as const satisfies Record<Theme, readonly string[]>;

/**
 * The Sun/Moon affordance is picked by the palette's own `color-scheme`
 * declaration: both glyphs are rendered inside the palette-scoped element and
 * `light-dark()` resolves against that scope. `--dk-scheme-ink` is captured
 * outside the scope so the visible glyph keeps the *ambient* muted-foreground
 * colour instead of the previewed palette's. Where `light-dark()` is
 * unsupported the `text-transparent` base wins and neither glyph paints, which
 * is why every option also carries a visible text label.
 */
const SCHEME_INK_STYLE: React.CSSProperties = {
  "--dk-scheme-ink": "var(--muted-foreground)",
} as React.CSSProperties;
const LIGHT_SCHEME_ICON_STYLE: React.CSSProperties = {
  color: "light-dark(var(--dk-scheme-ink), transparent)",
};
const DARK_SCHEME_ICON_STYLE: React.CSSProperties = {
  color: "light-dark(transparent, var(--dk-scheme-ink))",
};

const AppearanceSettings: React.FC = () => {
  const theme = useGlobalStore((s) => s.theme);
  const setTheme = useGlobalStore((s) => s.setTheme);

  const themes = THEMES;

  return (
    <SettingsSection
      kicker="Workspace display"
      title="Appearance"
      description="Customize the look and feel of your workspace."
    >
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="group"
        aria-label="Theme selection"
      >
        {themes.map((t) => {
          const isActive = theme === t.value;
          const scopes = THEME_PREVIEW_SCOPES[t.value];
          const iconScope = scopes[0];

          return (
            <Card
              key={t.value}
              className={cn(
                "group relative bg-card/45 [box-shadow:none] transition-[border-color,background-color] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background motion-reduce:transition-none",
                isActive
                  ? "border-primary bg-primary/[0.035]"
                  : "border-border/70 hover:border-primary/35 hover:bg-card/70",
              )}
            >
              <button
                type="button"
                onClick={() => setTheme(t.value)}
                aria-pressed={isActive}
                aria-label={`Select ${t.label} theme`}
                className="w-full rounded-lg text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <div className="flex h-20 border-b border-border/60 bg-background/35 p-3">
                  <div className="flex w-full overflow-hidden rounded border border-border/70 shadow-sm">
                    {scopes.map((scope) => (
                      <div key={scope} className={cn("flex flex-1", scope)}>
                        <div className="w-[28%] bg-sidebar" />
                        <div className="relative flex-1 bg-background">
                          <span className="absolute top-3 left-[12%] h-1.5 w-[38%] rounded-full bg-primary" />
                          <span className="absolute top-7 left-[12%] h-1 w-[46%] rounded-full bg-muted-foreground/45" />
                          <span className="absolute right-[10%] bottom-3 h-5 w-[26%] rounded-sm border border-border bg-card" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <CardHeader className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 pb-1">
                  {t.value === "system" ? (
                    <Desktop
                      size={17}
                      className="text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className="text-muted-foreground"
                      style={SCHEME_INK_STYLE}
                    >
                      <span
                        className={cn(
                          "grid size-[17px] place-items-center",
                          iconScope,
                        )}
                      >
                        <Sun
                          size={17}
                          className="col-start-1 row-start-1 text-transparent"
                          style={LIGHT_SCHEME_ICON_STYLE}
                          aria-hidden="true"
                        />
                        <Moon
                          size={17}
                          className="col-start-1 row-start-1 text-transparent"
                          style={DARK_SCHEME_ICON_STYLE}
                          aria-hidden="true"
                        />
                      </span>
                    </span>
                  )}
                  <CardTitle className="text-sm font-medium">
                    {t.label}
                  </CardTitle>
                  {isActive ? (
                    <Badge className="gap-1 border-primary/25 bg-primary/10 text-[10px] tracking-[0.08em] text-primary uppercase">
                      <Check size={11} weight="bold" aria-hidden="true" />
                      Active
                    </Badge>
                  ) : null}
                </CardHeader>
                <CardContent className="pt-0 pl-9">
                  <CardDescription className="text-xs">
                    {t.description}
                  </CardDescription>
                </CardContent>
              </button>
            </Card>
          );
        })}
      </div>
    </SettingsSection>
  );
};

export default AppearanceSettings;
