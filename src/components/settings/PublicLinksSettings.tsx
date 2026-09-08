"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SurfaceCard } from "@/components/ui/surface-card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { showError, showSuccess } from "@/lib/toast";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import {
  getPublicLanguageLabel,
  PUBLIC_LANGUAGE_VALUES,
  type PublicLanguage,
} from "@/modules/public-links/types";

type SettingsResponse = {
  defaultPublicLanguage: PublicLanguage;
  ownerCapable: boolean;
};

const PublicLinksSettings: React.FC = () => {
  const workspaceId = useGlobalStore((state) => state.currentWorkspaceId);
  const { role: workspaceRole } = useWorkspaceRole(workspaceId);
  const ownerCanManage = workspaceRole === "owner";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentValue, setCurrentValue] = useState<PublicLanguage>("en");
  const [nextValue, setNextValue] = useState<PublicLanguage>("en");

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ workspaceId });
        const res = await fetch(
          `/api/settings/public-links?${params.toString()}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          throw new Error("Failed to load public link settings");
        }

        const payload = (await res.json()) as SettingsResponse;
        if (cancelled) return;
        setCurrentValue(payload.defaultPublicLanguage);
        setNextValue(payload.defaultPublicLanguage);
      } catch (error) {
        if (!cancelled) {
          console.error("[settings.public-links] load failed", error);
          showError("Failed to load public link settings");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const hasChanges = nextValue !== currentValue;
  const helperCopy = useMemo(() => {
    return "This sets the default language for public viewer pages, gate screens, and recipient-facing public emails. Individual links can still override it, so you can keep multilingual sharing consistent at the workspace level.";
  }, []);

  const handleSave = async () => {
    if (!workspaceId || !hasChanges) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings/public-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          defaultPublicLanguage: nextValue,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ?? "Failed to save public link settings",
        );
      }

      setCurrentValue(nextValue);
      showSuccess("Public link settings updated");
    } catch (error) {
      console.error("[settings.public-links] save failed", error);
      showError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!workspaceId) {
    return null;
  }

  return (
    <SettingsSection
      kicker="Recipient experience"
      title="Public Links"
      description="Set the default language for public-facing links and enable multilingual public sharing across your workspace."
    >
      <SurfaceCard className="overflow-hidden bg-card/45 [box-shadow:none]">
        <div className="space-y-3 px-4 py-5 sm:px-5">
          <label
            htmlFor="defaultPublicLanguage"
            className="text-sm font-medium"
          >
            Default public language
          </label>
          <Select
            value={nextValue}
            onValueChange={(value: PublicLanguage) => setNextValue(value)}
            disabled={!ownerCanManage || loading || saving}
          >
            <SelectTrigger
              id="defaultPublicLanguage"
              aria-label="Default public language"
              className="max-w-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_LANGUAGE_VALUES.map((language) => (
                <SelectItem key={language} value={language}>
                  {getPublicLanguageLabel(language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {helperCopy}
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/[0.12] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          {!ownerCanManage ? (
            <p className="text-sm text-muted-foreground">
              Only workspace owners can manage the default public language.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Current default: {getPublicLanguageLabel(currentValue)}.
            </p>
          )}

          <Button
            onClick={() => void handleSave()}
            disabled={!ownerCanManage || loading || saving || !hasChanges}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </SurfaceCard>
    </SettingsSection>
  );
};

export default PublicLinksSettings;
