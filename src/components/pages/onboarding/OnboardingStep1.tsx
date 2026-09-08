"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "@phosphor-icons/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INDUSTRY_OPTIONS, ROLE_OPTIONS } from "@/lib/constants";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";

export type OnboardingStep1Data = {
  fullName: string;
  role: string;
  workspaceName: string;
  industry: string;
};

type OnboardingStep1Props = {
  onContinue: (data: OnboardingStep1Data) => void;
  onCancel: () => void;
  initialData: OnboardingStep1Data;
  workspaceLocked?: boolean;
  lockedWorkspaceName?: string | null;
  isSubmitting?: boolean;
};

const LETTERS_AND_SPACES_REGEX = /^[A-Za-z ]+$/;

const sanitizeWorkspaceName = (value: string): string =>
  value ? value.replace(/[^A-Za-z ]/gi, "").replace(/\s+/g, " ") : "";

const resolveSelectValue = (
  value: string,
  options: readonly string[],
): string => {
  const existing = value.trim();
  if (!existing) return "";
  const match = options.find(
    (option) => option.toLowerCase() === existing.toLowerCase(),
  );
  return match ?? "Other";
};

const OnboardingStep1: React.FC<OnboardingStep1Props> = ({
  onContinue,
  onCancel,
  initialData,
  workspaceLocked = false,
  lockedWorkspaceName,
  isSubmitting = false,
}) => {
  const [fullName, setFullName] = useState<string>(initialData.fullName);
  const [role, setRole] = useState<string>(() =>
    resolveSelectValue(initialData.role, ROLE_OPTIONS),
  );
  const [workspaceName, setWorkspaceName] = useState<string>(
    sanitizeWorkspaceName(initialData.workspaceName),
  );
  const [industry, setIndustry] = useState<string>(() =>
    resolveSelectValue(initialData.industry, INDUSTRY_OPTIONS),
  );

  useEffect(() => {
    if (!workspaceLocked || !lockedWorkspaceName) return;
    setWorkspaceName(sanitizeWorkspaceName(lockedWorkspaceName));
  }, [lockedWorkspaceName, workspaceLocked]);

  const workspaceNameError = useMemo(() => {
    if (workspaceLocked) return null;
    const trimmed = workspaceName.trim();
    if (!trimmed) return null;
    if (!LETTERS_AND_SPACES_REGEX.test(trimmed)) {
      return "Workspace name can include letters (A-Z) and spaces only.";
    }
    if (trimmed.length < 3) {
      return "Workspace name must be at least 3 letters.";
    }
    return null;
  }, [workspaceLocked, workspaceName]);

  const isContinueDisabled =
    isSubmitting ||
    !fullName.trim() ||
    !role.trim() ||
    (!workspaceLocked && !workspaceName.trim()) ||
    (!workspaceLocked && workspaceName.trim().length < 3) ||
    Boolean(workspaceNameError);

  return (
    <div className="animate-in space-y-7 duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
      <OnboardingStepHeader
        title="Welcome to DocKosha"
        description="Let’s get your profile and workspace set up."
        leading={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            onClick={onCancel}
          >
            <X className="size-4" aria-hidden="true" />
            Cancel
          </Button>
        }
      />

      <div className="space-y-5 border-t border-border pt-6">
        <div className="space-y-2.5">
          <Label htmlFor="fullName" className="text-xs font-medium">
            Full Name
          </Label>
          <Input
            id="fullName"
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className="h-11"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2.5">
            <Label htmlFor="role" className="text-xs font-medium">
              Role
            </Label>
            <Select value={role || undefined} onValueChange={setRole}>
              <SelectTrigger id="role" className="h-11">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                align="start"
                avoidCollisions={false}
                sideOffset={4}
              >
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="industry" className="text-xs font-medium">
              Industry
            </Label>
            <Select
              value={industry || undefined}
              onValueChange={(value) => setIndustry(value)}
            >
              <SelectTrigger id="industry" className="h-11">
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                align="start"
                avoidCollisions={false}
                sideOffset={4}
              >
                {INDUSTRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="company" className="text-xs font-medium">
            Workspace Name (Company)
          </Label>
          <Input
            id="company"
            placeholder="Acme Corp"
            value={workspaceName}
            minLength={3}
            onChange={(e) =>
              setWorkspaceName(sanitizeWorkspaceName(e.target.value))
            }
            className="h-11"
            disabled={workspaceLocked}
            aria-readonly={workspaceLocked}
          />
          <div className="min-h-5 border-l border-border pl-3 text-xs leading-5 text-muted-foreground">
            {workspaceLocked ? (
              <span>
                Workspace provided by your invite
                {lockedWorkspaceName ? ` (${lockedWorkspaceName})` : ""}.
              </span>
            ) : workspaceNameError ? (
              <span className="text-destructive">{workspaceNameError}</span>
            ) : (
              "Workspace names may include letters (A-Z) and spaces."
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button
          onClick={() =>
            onContinue({
              fullName: fullName.trim(),
              role: role.trim(),
              workspaceName: workspaceName.trim(),
              industry: industry.trim(),
            })
          }
          disabled={isContinueDisabled}
          className="h-10 w-full sm:w-auto"
          size="lg"
        >
          {isSubmitting ? "Finishing…" : "Continue"}
        </Button>
      </div>
    </div>
  );
};

export default OnboardingStep1;
