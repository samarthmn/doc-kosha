"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { fadeIn } from "@/lib/motion";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { showError, showSuccess } from "@/lib/toast";
import { Bell, DeviceMobile, ShieldCheck } from "@phosphor-icons/react";

type NotificationPreferences = {
  securityLoginAlertsEnabled: boolean;
  securityWorkspaceEmailsEnabled: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  securityLoginAlertsEnabled: true,
  securityWorkspaceEmailsEnabled: true,
};

const NotificationSettings: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [baseline, setBaseline] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  const isDirty = useMemo(
    () =>
      preferences.securityLoginAlertsEnabled !==
        baseline.securityLoginAlertsEnabled ||
      preferences.securityWorkspaceEmailsEnabled !==
        baseline.securityWorkspaceEmailsEnabled,
    [baseline, preferences],
  );

  const loadPreferences = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/settings/notifications");
      const payload = (await res.json().catch(() => null)) as {
        preferences?: NotificationPreferences;
        error?: string;
      } | null;

      if (!res.ok || !payload?.preferences) {
        throw new Error(payload?.error || "Failed to load notifications.");
      }

      setPreferences(payload.preferences);
      setBaseline(payload.preferences);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load notifications.";
      setLoadError(message);
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPreferences();
  }, []);

  const savePreferences = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const payload = (await res.json().catch(() => null)) as {
        preferences?: NotificationPreferences;
        error?: string;
      } | null;

      if (!res.ok || !payload?.preferences) {
        throw new Error(payload?.error || "Failed to update notifications.");
      }

      setPreferences(payload.preferences);
      setBaseline(payload.preferences);
      showSuccess("Notification preferences updated");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update notifications.";
      showError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsSection
      kicker="Inbox preferences"
      title="Notifications"
      description="Choose which product and security emails you want to receive."
    >
      <SurfaceCard className="overflow-hidden bg-card/45 [box-shadow:none]">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <span className="flex size-8 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
              <Bell size={17} aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <CardTitle className="font-medium">Email Notifications</CardTitle>
              <CardDescription className="text-sm">
                Security alerts are recommended to keep your account protected.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          ) : loadError ? (
            <InlineError
              title="Unable to load preferences"
              description={loadError}
              onRetry={loadPreferences}
            />
          ) : (
            // Fades in rather than replacing the skeletons in one frame. The
            // wrapper carries `space-y-3` because it now sits between
            // `CardContent` and the rows that were relying on that spacing.
            <motion.div className="space-y-3" {...fadeIn}>
              <div className="flex items-start justify-between gap-4 rounded border border-border/70 bg-background/25 p-4">
                <div className="flex items-start gap-3">
                  <DeviceMobile
                    size={18}
                    className="mt-0.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <Label htmlFor="notif-login-alerts" className="font-medium">
                      Sign-in alerts
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sends an email for each sign-in after your first session,
                      including on familiar devices.
                    </p>
                  </div>
                </div>
                <Switch
                  id="notif-login-alerts"
                  checked={preferences.securityLoginAlertsEnabled}
                  onCheckedChange={(checked) =>
                    setPreferences((prev) => ({
                      ...prev,
                      securityLoginAlertsEnabled: checked,
                    }))
                  }
                  aria-label="Toggle sign-in alerts"
                />
              </div>

              <div className="flex items-start justify-between gap-4 rounded border border-border/70 bg-background/25 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={18}
                    className="mt-0.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <Label
                      htmlFor="notif-workspace-security"
                      className="font-medium"
                    >
                      Workspace security updates
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sends an email when your workspace access changes or is
                      removed.
                    </p>
                  </div>
                </div>
                <Switch
                  id="notif-workspace-security"
                  checked={preferences.securityWorkspaceEmailsEnabled}
                  onCheckedChange={(checked) =>
                    setPreferences((prev) => ({
                      ...prev,
                      securityWorkspaceEmailsEnabled: checked,
                    }))
                  }
                  aria-label="Toggle workspace security update emails"
                />
              </div>
            </motion.div>
          )}

          {!loadError && (
            <div className="flex justify-end border-t border-border/60 pt-4">
              <Button
                type="button"
                onClick={savePreferences}
                disabled={isLoading || isSaving || !isDirty}
              >
                {isSaving ? "Saving..." : "Save Preferences"}
              </Button>
            </div>
          )}
        </CardContent>
      </SurfaceCard>
    </SettingsSection>
  );
};

export default NotificationSettings;
