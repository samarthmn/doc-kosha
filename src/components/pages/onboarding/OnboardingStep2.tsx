"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { THEMES, type Theme } from "@/types/theme";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import {
  Check,
  Desktop,
  Moon,
  Sun,
  Palette,
  Briefcase,
  Lock,
  Database,
  Users,
  DotsThree,
  ArrowLeft,
} from "@phosphor-icons/react";

// Picker-only presentation metadata; the theme list itself is canonical in THEMES.
const THEME_SWATCHES: Record<
  Theme,
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  system: {
    icon: Desktop,
    color: "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
  },
  light: {
    icon: Sun,
    color: "bg-white text-yellow-500 border-zinc-200 border",
  },
  dark: {
    icon: Moon,
    color: "bg-zinc-950 text-indigo-400 border-zinc-800 border",
  },
  copper: {
    icon: Palette,
    color:
      "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
  },
  forest: {
    icon: Palette,
    color:
      "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
  },
  lavender: {
    icon: Palette,
    color:
      "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
  },
  midnight: {
    icon: Palette,
    color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
  ocean: {
    icon: Palette,
    color: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  },
  sunset: {
    icon: Palette,
    color: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
  },
};

type OnboardingStep2Props = {
  onBack: () => void;
  onComplete: (args: {
    primaryUseCase: string | null;
    redirectPath: string;
  }) => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  initialPrimaryUseCase?: string | null;
};

const OnboardingStep2: React.FC<OnboardingStep2Props> = ({
  onBack,
  onComplete,
  isSubmitting,
  errorMessage,
  initialPrimaryUseCase = null,
}) => {
  const theme = useGlobalStore((s) => s.theme);
  const setTheme = useGlobalStore((s) => s.setTheme);
  const [primaryUseCase, setPrimaryUseCase] = useState<string | null>(
    initialPrimaryUseCase,
  );

  useEffect(() => {
    setPrimaryUseCase(initialPrimaryUseCase ?? null);
  }, [initialPrimaryUseCase]);

  const primaryUseCaseOptions = useMemo(
    () => [
      {
        value: "sales_engagement",
        label: "Sales Engagement",
        description: "Track proposals & decks",
        icon: Briefcase,
      },
      {
        value: "secure_sharing",
        label: "Secure Sharing",
        description: "Client & investor sharing",
        icon: Lock,
      },
      {
        value: "data_room",
        label: "Data Room",
        description: "Due diligence & deals",
        icon: Database,
      },
      {
        value: "collaboration",
        label: "Team Collaboration",
        description: "Internal docs & wikis",
        icon: Users,
      },
      {
        value: "other",
        label: "Other",
        description: "Something else",
        icon: DotsThree,
      },
    ],
    [],
  );

  const themes = useMemo(
    () => THEMES.map((t) => ({ ...t, ...THEME_SWATCHES[t.value] })),
    [],
  );

  const handleFinish = () => {
    const target = getRedirectFromUseCase(primaryUseCase);
    onComplete({ primaryUseCase, redirectPath: target });
  };

  const getRedirectFromUseCase = (goal: string | null) => {
    switch (goal) {
      case "data_room":
        return "/data-rooms?getting_started=1";
      case "sales_engagement":
      case "secure_sharing":
      case "collaboration":
        return "/documents?getting_started=1";
      default:
        return "/dashboard";
    }
  };
  return (
    <div className="animate-in space-y-7 duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
      <OnboardingStepHeader
        title="Personalize Experience"
        description="Customize your workspace look and feel."
        leading={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        }
      />

      <div className="space-y-7 border-t border-border pt-6">
        <div className="space-y-3">
          <Label className="text-xs font-medium">Theme</Label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {themes.map((t) => {
              const isSelected = theme === (t.value as Theme);
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setTheme(t.value as Theme)}
                  className={cn(
                    "group relative flex min-h-24 flex-col items-start justify-between gap-3 rounded-lg border bg-card/45 p-3.5 text-left transition-colors outline-none hover:border-primary/40 hover:bg-primary/[0.035] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    isSelected
                      ? "border-primary/65 bg-primary/[0.06] ring-1 ring-primary/25"
                      : "border-border",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded border border-border/70 transition-colors",
                      t.color,
                    )}
                  >
                    <t.icon className="size-4" aria-hidden />
                  </div>
                  <span className="text-sm font-medium">{t.label}</span>
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <Check
                        className="size-3.5 text-primary"
                        weight="bold"
                        aria-hidden
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-xs font-medium">Primary Goal</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {primaryUseCaseOptions.map((opt) => {
              const isSelected = primaryUseCase === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setPrimaryUseCase(opt.value)}
                  className={cn(
                    "relative flex items-start gap-3 rounded-lg border bg-card/45 p-4 text-left transition-colors outline-none hover:border-primary/40 hover:bg-primary/[0.035] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    isSelected
                      ? "border-primary/65 bg-primary/[0.06] ring-1 ring-primary/25"
                      : "border-border",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded border",
                      isSelected
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-muted/50 text-muted-foreground",
                    )}
                  >
                    <opt.icon className="size-[18px]" aria-hidden />
                  </div>
                  <div className="flex flex-col">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isSelected ? "text-primary" : "text-foreground",
                      )}
                    >
                      {opt.label}
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {opt.description}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 right-3">
                      <Check
                        className="size-4 text-primary"
                        weight="bold"
                        aria-hidden
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button
          onClick={handleFinish}
          disabled={!primaryUseCase || isSubmitting}
          className="h-10 w-full sm:w-auto"
          size="lg"
        >
          {isSubmitting ? "Finishing…" : "Continue"}
        </Button>
      </div>

      {errorMessage ? (
        <p className="text-center text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
};

export default OnboardingStep2;
