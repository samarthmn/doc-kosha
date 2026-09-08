"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { Input } from "@/components/ui/input";
import { SurfaceCard } from "@/components/ui/surface-card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { showError, showInfo, showSuccess } from "@/lib/toast";
import { formatBytes } from "@/lib/format";
import { Warning } from "@phosphor-icons/react";

type SettingsResponse = {
  maxPreviousVersions: number;
  ownerCapable: boolean;
  upgradeRequired?: boolean;
};

type ImpactSummary = {
  affectedDocuments: number;
  affectedVersions: number;
  affectedBytes: number;
};

const DocumentVersioningSettings: React.FC = () => {
  const workspaceId = useGlobalStore((state) => state.currentWorkspaceId);
  const { role: workspaceRole } = useWorkspaceRole(workspaceId);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentValue, setCurrentValue] = useState(1);
  const [nextValue, setNextValue] = useState(1);
  const [confirmToken, setConfirmToken] = useState("");
  const [serverOwnerCapable, setServerOwnerCapable] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [impactSummary, setImpactSummary] = useState<ImpactSummary | null>(
    null,
  );

  const ownerCanManage = workspaceRole === "owner";
  const canManageRetention =
    ownerCanManage && serverOwnerCapable && !upgradeRequired;

  const loadSettings = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ workspaceId });
      const res = await fetch(
        `/api/settings/document-versioning?${params.toString()}`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) {
        throw new Error("Failed to load document versioning settings");
      }
      const payload = (await res.json()) as SettingsResponse;
      setCurrentValue(payload.maxPreviousVersions);
      setNextValue(payload.maxPreviousVersions);
      setServerOwnerCapable(payload.ownerCapable);
      setUpgradeRequired(Boolean(payload.upgradeRequired));
    } catch (error) {
      console.error("[settings.document-versioning] load failed", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const isDecrease = nextValue < currentValue;
  const hasChanges = nextValue !== currentValue;

  const helperCopy = useMemo(() => {
    if (upgradeRequired) {
      return "Version-history retention and restore controls require a paid plan. Upgrade to Essential to retain and restore previous versions.";
    }
    if (isDecrease) {
      return "Lowering retention can prune older previous versions after confirmation.";
    }
    if (nextValue > currentValue) {
      const billablePrevious = Math.max(0, nextValue - 1);
      return `Increasing to ${nextValue} keeps ${billablePrevious} additional previous version${billablePrevious === 1 ? "" : "s"} billed to storage. The newest previous version remains free, and changes apply only to future replacements.`;
    }
    return "Keep 1 to 20 previous versions. The newest previous version is included and does not count toward storage.";
  }, [currentValue, isDecrease, nextValue, upgradeRequired]);

  const runDryRun = async (): Promise<ImpactSummary> => {
    if (!workspaceId) {
      throw new Error("Workspace missing");
    }

    const res = await fetch("/api/settings/document-versioning", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        workspaceId,
        maxPreviousVersions: nextValue,
        dryRun: true,
      }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error ?? "Failed to preview retention changes");
    }

    const payload = (await res.json()) as {
      impactSummary?: ImpactSummary;
    };

    return (
      payload.impactSummary ?? {
        affectedDocuments: 0,
        affectedVersions: 0,
        affectedBytes: 0,
      }
    );
  };

  const handleSave = async () => {
    if (!workspaceId || !hasChanges) return;
    if (!canManageRetention) return;

    setSaving(true);
    try {
      if (isDecrease) {
        if (!impactSummary) {
          // First Save always stops at the impact preview — even if DELETE
          // was pre-typed — so pruning is never confirmed sight unseen.
          const preview = await runDryRun();
          setImpactSummary(preview);

          if (preview.affectedVersions > 0) {
            showInfo("Review the impact and type DELETE to confirm.");
            return;
          }
        } else if (
          impactSummary.affectedVersions > 0 &&
          confirmToken !== "DELETE"
        ) {
          showError("Type DELETE to confirm pruning impacted versions.");
          return;
        }
      }

      const res = await fetch("/api/settings/document-versioning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          maxPreviousVersions: nextValue,
          confirmToken: confirmToken || undefined,
          dryRun: false,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Failed to save settings");
      }

      setCurrentValue(nextValue);
      setConfirmToken("");
      setImpactSummary(null);
      showSuccess("Document versioning settings updated");
    } catch (error) {
      console.error("[settings.document-versioning] save failed", error);
      showError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!workspaceId) {
    return null;
  }

  if (loadError) {
    return (
      <SettingsSection
        kicker="Retention policy"
        title="Document Versioning"
        description="Configure how many previous versions to retain per document."
      >
        <SurfaceCard className="overflow-hidden bg-card/45 [box-shadow:none]">
          <InlineError
            className="m-4 sm:m-5"
            title="Unable to load settings"
            description="We couldn't load document versioning settings. Please try again."
            onRetry={() => void loadSettings()}
          />
        </SurfaceCard>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      kicker="Retention policy"
      title="Document Versioning"
      description="Configure how many previous versions to retain per document."
    >
      <SurfaceCard className="overflow-hidden bg-card/45 [box-shadow:none]">
        <div className="space-y-3 px-4 py-5 sm:px-5">
          <label htmlFor="maxPreviousVersions" className="text-sm font-medium">
            Previous versions to keep (1-20)
          </label>
          <Input
            id="maxPreviousVersions"
            type="number"
            min={1}
            max={20}
            value={nextValue}
            onChange={(event) => {
              const rawValue = Number(event.target.value);
              if (!Number.isFinite(rawValue)) return;
              setNextValue(Math.min(20, Math.max(1, Math.trunc(rawValue))));
              // A changed target must re-run the impact preview.
              setImpactSummary(null);
            }}
            disabled={!canManageRetention || loading || saving}
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">{helperCopy}</p>
          <p className="text-xs text-muted-foreground">
            Converted PDFs do not count toward storage accounting.
          </p>
        </div>

        {upgradeRequired ? (
          <div className="mx-4 flex gap-3 rounded border border-primary/25 bg-primary/[0.04] p-3 text-sm sm:mx-5">
            <Warning
              size={17}
              className="mt-0.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">Upgrade required</p>
              <p className="mt-1 text-muted-foreground">
                Free workspaces keep only the current document version. Upgrade
                to Essential to configure retention and restore previous
                versions.
              </p>
            </div>
          </div>
        ) : null}

        {isDecrease && impactSummary ? (
          <div className="mx-4 space-y-2 rounded border border-border/70 bg-muted/[0.18] p-3 text-xs sm:mx-5">
            <p className="font-medium">Decrease impact preview</p>
            <p>
              {impactSummary.affectedDocuments} document
              {impactSummary.affectedDocuments === 1 ? "" : "s"},{" "}
              {impactSummary.affectedVersions} version
              {impactSummary.affectedVersions === 1 ? "" : "s"},{" "}
              {formatBytes(impactSummary.affectedBytes)} will be pruned.
            </p>
          </div>
        ) : null}

        {isDecrease && impactSummary ? (
          <div className="mx-4 space-y-2 sm:mx-5">
            <label htmlFor="confirmDeleteToken" className="text-sm font-medium">
              Confirmation token
            </label>
            <Input
              id="confirmDeleteToken"
              placeholder="Type DELETE"
              value={confirmToken}
              onChange={(event) => setConfirmToken(event.target.value)}
              disabled={!canManageRetention || loading || saving}
              className="max-w-xs"
            />
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 border-t border-border/60 bg-muted/[0.12] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          {!ownerCanManage ? (
            <p className="text-sm text-muted-foreground">
              Only workspace owners can manage retention.
            </p>
          ) : upgradeRequired ? (
            <p className="text-sm text-muted-foreground">
              Current plan: version-history controls are paid-only.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Current retention: {currentValue} previous version
              {currentValue === 1 ? "" : "s"}.
            </p>
          )}

          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canManageRetention || !hasChanges || loading || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </SurfaceCard>
    </SettingsSection>
  );
};

export default DocumentVersioningSettings;
