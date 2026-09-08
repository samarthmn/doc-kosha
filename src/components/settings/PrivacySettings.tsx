"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  buildDefaultAnalyticsConsent,
  inspectAnalyticsConsent,
  saveAnalyticsConsent,
  subscribeToAnalyticsConsent,
  type AnalyticsConsent,
  type ConsentRegion,
} from "@/lib/analytics/consent";
import { showSuccess } from "@/lib/toast";
import { Eye, LockKey } from "@phosphor-icons/react";

const PrivacySettings: React.FC = () => {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [region, setRegion] = useState<ConsentRegion>("EU_EEA_UK");
  const [gpcEnabled, setGpcEnabled] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [replayEnabled, setReplayEnabled] = useState(false);

  useEffect(() => {
    const inspected = inspectAnalyticsConsent();

    setRegion(inspected.region);
    setGpcEnabled(inspected.gpcEnabled);
    setConsent(inspected.consent);
    setAnalyticsEnabled(inspected.consent?.analytics ?? false);
    setReplayEnabled(inspected.consent?.replay ?? false);

    return subscribeToAnalyticsConsent((nextConsent) => {
      setConsent(nextConsent);
      setAnalyticsEnabled(nextConsent?.analytics ?? false);
      setReplayEnabled(nextConsent?.replay ?? false);
    });
  }, []);

  const hasStoredConsent = Boolean(consent);

  const defaultSummary = useMemo(() => {
    const defaults = buildDefaultAnalyticsConsent({
      region,
      gpcSeen: gpcEnabled,
    });

    return {
      analytics: defaults.analytics,
      replay: defaults.replay,
    };
  }, [gpcEnabled, region]);

  const handleSave = () => {
    const next = saveAnalyticsConsent({
      analytics: analyticsEnabled,
      replay: replayEnabled,
      region,
    });

    setConsent(next);
    setAnalyticsEnabled(next.analytics);
    setReplayEnabled(next.replay);
    showSuccess("Privacy settings updated");
  };

  const resetToRegionDefaults = () => {
    const next = saveAnalyticsConsent({
      analytics: defaultSummary.analytics,
      replay: defaultSummary.replay,
      region,
    });

    setConsent(next);
    setAnalyticsEnabled(next.analytics);
    setReplayEnabled(next.replay);
    showSuccess("Defaults restored");
  };

  return (
    <SettingsSection
      kicker="Your data choices"
      title="Privacy"
      description="Control analytics and session recording preferences."
    >
      <SurfaceCard className="overflow-hidden bg-card/45 [box-shadow:none]">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <span className="flex size-8 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
              <Eye size={17} aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <CardTitle className="font-medium">
                Tracking Preferences
              </CardTitle>
              <CardDescription className="text-sm">
                Manage how we collect and use usage insights.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded border border-border/70 bg-background/25 p-4">
            <div>
              <Label htmlFor="privacy-analytics" className="font-medium">
                Analytics
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Helps us understand usage and improve the product.
              </p>
            </div>
            <Switch
              id="privacy-analytics"
              checked={analyticsEnabled}
              onCheckedChange={(checked) => {
                setAnalyticsEnabled(checked);
                if (!checked) setReplayEnabled(false);
              }}
              disabled={gpcEnabled}
              aria-label="Toggle product analytics"
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded border border-border/70 bg-background/25 p-4">
            <div>
              <Label htmlFor="privacy-replay" className="font-medium">
                Session Recording
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Helps diagnose UX issues. Sensitive surfaces are masked and
                blocked from capture.
              </p>
            </div>
            <Switch
              id="privacy-replay"
              checked={replayEnabled}
              onCheckedChange={setReplayEnabled}
              disabled={gpcEnabled || !analyticsEnabled}
              aria-label="Toggle session recording"
            />
          </div>

          {gpcEnabled && (
            <div className="flex gap-3 rounded border border-primary/25 bg-primary/[0.04] p-3 text-sm text-muted-foreground">
              <LockKey
                size={17}
                className="mt-0.5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p>
                Global Privacy Control is enabled in your browser. Analytics and
                session recording remain disabled unless GPC is turned off.
              </p>
            </div>
          )}

          {!hasStoredConsent && (
            <p className="rounded bg-muted/[0.12] p-3 text-sm text-muted-foreground">
              No explicit consent has been saved yet. Save your preferences to
              apply them.
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={resetToRegionDefaults}
            >
              Reset to defaults
            </Button>
            <Button type="button" onClick={handleSave}>
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </SurfaceCard>
    </SettingsSection>
  );
};

export default PrivacySettings;
