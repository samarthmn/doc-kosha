"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BrandingHeader } from "@/components/branding";
import WatermarkTemplatesManager from "@/components/branding/WatermarkTemplatesManager";
import { canUseCustomDomain } from "@/modules/custom-domains/entitlements";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { showError, showSuccess } from "@/lib/toast";
import {
  BRANDING_ASSETS_BUCKET_NAME,
  BRANDING_LOGO_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants";
import type { BrandingRecord } from "@/lib/branding";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Buildings,
  Image as ImageIcon,
  LockKey,
  ShieldCheck,
} from "@phosphor-icons/react";

const ALLOWED_LOGO_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
]);
const DUMMY_PDF_DATA_URL = "/dummy-pdf.pdf";

const CustomDomainSection = React.lazy(
  () => import("@/modules/custom-domains/CustomDomainSection"),
);

type BrandingSettingsSection = "identity" | "watermark";

type BaselineState = {
  companyName: string;
  websiteUrl: string;
  logoStoragePath: string | null;
};

const DEFAULT_BASELINE: BaselineState = {
  companyName: "",
  websiteUrl: "",
  logoStoragePath: null,
};

interface BrandingSettingsClientProps {
  section: BrandingSettingsSection;
}

const BrandingSettingsClient: React.FC<BrandingSettingsClientProps> = ({
  section,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const workspaceId = useGlobalStore((state) => state.currentWorkspaceId);
  const currentWorkspaceSubscription = useGlobalStore(
    (state) => state.currentWorkspaceSubscription,
  );
  const { role: workspaceRole, isLoading: isRoleLoading } =
    useWorkspaceRole(workspaceId);
  const isIdentitySection = section === "identity";

  const [loading, setLoading] = useState<boolean>(isIdentitySection);
  const [saving, setSaving] = useState<boolean>(false);

  const canManageWorkspaceSettings = workspaceRole === "owner";
  const [companyName, setCompanyName] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState<string>("");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState<boolean>(false);
  const [logoStoragePath, setLogoStoragePath] = useState<string | null>(null);
  const [isHeaderPreviewOpen, setIsHeaderPreviewOpen] =
    useState<boolean>(false);
  const [websiteLocked, setWebsiteLocked] = useState<boolean>(false);
  const [domainVerified, setDomainVerified] = useState<boolean>(false);
  const customDomainsEnabled = useMemo(
    () => canUseCustomDomain(currentWorkspaceSubscription),
    [currentWorkspaceSubscription],
  );

  useEffect(() => {
    if (!customDomainsEnabled) {
      setDomainVerified(false);
      setWebsiteLocked(false);
    }
  }, [customDomainsEnabled]);

  const baselineRef = useRef<BaselineState>(DEFAULT_BASELINE);
  const [baselineState, setBaselineState] =
    useState<BaselineState>(DEFAULT_BASELINE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const existingLogoPathRef = useRef<string | null>(null);

  const cleanupObjectUrl = useCallback(() => {
    if (objectUrlRef.current && objectUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = null;
  }, []);

  const updatePreview = useCallback(
    (url: string | null, opts?: { isObjectUrl?: boolean }) => {
      cleanupObjectUrl();
      if (opts?.isObjectUrl && url) {
        objectUrlRef.current = url;
      }
      setLogoPreviewUrl(url);
    },
    [cleanupObjectUrl],
  );

  useEffect(() => () => cleanupObjectUrl(), [cleanupObjectUrl]);

  const setBaseline = useCallback((state: BaselineState) => {
    baselineRef.current = state;
    setBaselineState(state);
  }, []);

  const applyDefaultBrandingState = useCallback(() => {
    setCompanyName(DEFAULT_BASELINE.companyName);
    setWebsiteUrl(DEFAULT_BASELINE.websiteUrl);
    setLogoStoragePath(DEFAULT_BASELINE.logoStoragePath);
    setLogoFile(null);
    setLogoRemoved(false);
    existingLogoPathRef.current = DEFAULT_BASELINE.logoStoragePath;
    updatePreview(null);
  }, [updatePreview]);

  const loadBranding = useCallback(async () => {
    if (!workspaceId) {
      applyDefaultBrandingState();
      setBaseline(DEFAULT_BASELINE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("branding")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("[branding] failed to fetch", error);
        showError("Failed to load branding settings");
        applyDefaultBrandingState();
        setBaseline(DEFAULT_BASELINE);
        return;
      }

      const branding = (data as BrandingRecord | null) || null;
      const nextCompanyName = branding?.company_name ?? "";
      const nextWebsiteUrl = branding?.website_url ?? "";
      const nextLogoStoragePath = branding?.logo_storage_path ?? null;

      setCompanyName(nextCompanyName);
      setWebsiteUrl(nextWebsiteUrl);
      setLogoStoragePath(nextLogoStoragePath);
      setLogoFile(null);
      setLogoRemoved(false);
      existingLogoPathRef.current = nextLogoStoragePath;

      if (nextLogoStoragePath) {
        // Use proxy endpoint for logo preview
        const queryParams = new URLSearchParams({
          bucket: BRANDING_ASSETS_BUCKET_NAME,
          path: nextLogoStoragePath,
          workspaceId,
        });
        updatePreview(`/api/storage/file?${queryParams.toString()}`);
      } else {
        updatePreview(null);
      }

      setBaseline({
        companyName: nextCompanyName,
        websiteUrl: nextWebsiteUrl,
        logoStoragePath: nextLogoStoragePath,
      });
    } finally {
      setLoading(false);
    }
  }, [
    supabase,
    updatePreview,
    setBaseline,
    workspaceId,
    applyDefaultBrandingState,
  ]);

  useEffect(() => {
    if (!isIdentitySection) return;
    void loadBranding();
  }, [isIdentitySection, loadBranding]);

  const handleLogoSelection = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (!ALLOWED_LOGO_MIME_TYPES.has(file.type)) {
        showError("Logo must be PNG, JPG, SVG, or WebP");
        return;
      }
      if (file.size > BRANDING_LOGO_MAX_FILE_SIZE_BYTES) {
        showError("Logo must be 2MB or smaller");
        return;
      }
      setLogoFile(file);
      setLogoRemoved(false);
      const objectUrl = URL.createObjectURL(file);
      updatePreview(objectUrl, { isObjectUrl: true });
    },
    [updatePreview],
  );

  const triggerLogoPicker = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoRemoved(true);
    setLogoStoragePath(null);
    updatePreview(null);
  };

  const isDirty = useMemo(() => {
    const baseline = baselineState;
    return (
      baseline.companyName !== companyName ||
      baseline.websiteUrl !== websiteUrl ||
      Boolean(logoFile) ||
      (logoRemoved && Boolean(baseline.logoStoragePath))
    );
  }, [companyName, websiteUrl, logoFile, logoRemoved, baselineState]);

  const handleSave = async () => {
    if (!workspaceId || saving || (!isDirty && !logoRemoved)) return;
    if (!canManageWorkspaceSettings) {
      showError("Only workspace owners can update branding settings.");
      return;
    }
    setSaving(true);
    let newLogoPath: string | null = logoStoragePath;
    const previousLogoPath = existingLogoPathRef.current;
    let uploadedLogoPath: string | null = null;

    try {
      if (logoFile) {
        const extension = (
          logoFile.name.split(".").pop() || "png"
        ).toLowerCase();
        const sanitizedExt = extension.replace(/[^a-z0-9]/g, "");
        const filename = `logo-${Date.now()}.${sanitizedExt || "png"}`;

        // Get presigned upload URL from server
        const presignRes = await fetch("/api/storage/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            assetKind: "branding",
            workspaceId,
            filename,
            contentType: logoFile.type,
            brandingSubpath: "logo",
          }),
        });

        if (!presignRes.ok) {
          const data = await presignRes.json().catch(() => ({}));
          throw new Error(
            data?.error || `Failed to get upload URL (${presignRes.status})`,
          );
        }

        const presignData = await presignRes.json();
        const { uploadUrl, storagePath } = presignData;
        if (!uploadUrl || !storagePath) {
          throw new Error("Invalid response from upload URL endpoint");
        }

        // Upload directly to R2
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: logoFile,
          headers: {
            "Content-Type": logoFile.type,
          },
        });

        if (!uploadRes.ok) {
          throw new Error("Logo upload failed");
        }

        uploadedLogoPath = storagePath;
        newLogoPath = storagePath;
      }

      const payload = {
        workspace_id: workspaceId,
        company_name: companyName.trim() || null,
        website_url: websiteUrl.trim() || null,
        logo_storage_path: newLogoPath,
        updated_at: new Date().toISOString(),
      } satisfies Partial<BrandingRecord> & { workspace_id: string };

      const upsertBranding = async (
        p: Partial<BrandingRecord> & { workspace_id: string },
      ) =>
        supabase
          .from("branding")
          .upsert(p, { onConflict: "workspace_id" })
          .select("*")
          .single();

      const { data, error } = await upsertBranding(payload);
      if (error) {
        throw error;
      }

      const saved = data as BrandingRecord;
      existingLogoPathRef.current = saved.logo_storage_path ?? null;
      setLogoStoragePath(saved.logo_storage_path ?? null);

      // Clean up old logo if replaced or removed
      const pathsToDelete: string[] = [];
      if (
        uploadedLogoPath &&
        previousLogoPath &&
        previousLogoPath !== uploadedLogoPath
      ) {
        pathsToDelete.push(previousLogoPath);
      }
      if (!logoFile && logoRemoved && previousLogoPath) {
        pathsToDelete.push(previousLogoPath);
      }

      if (pathsToDelete.length > 0) {
        await fetch("/api/storage/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            workspaceId,
            items: pathsToDelete.map((path) => ({
              logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
              path,
            })),
          }),
        }).catch((err) => console.error("Failed to clean up old logos:", err));
      }

      if (saved.logo_storage_path) {
        // Use proxy endpoint for logo preview
        const queryParams = new URLSearchParams({
          bucket: BRANDING_ASSETS_BUCKET_NAME,
          path: saved.logo_storage_path,
          workspaceId,
        });
        updatePreview(`/api/storage/file?${queryParams.toString()}`);
      } else {
        updatePreview(null);
      }

      setLogoFile(null);
      setLogoRemoved(false);
      setBaseline({
        companyName,
        websiteUrl,
        logoStoragePath: saved.logo_storage_path ?? null,
      });

      showSuccess("Branding settings updated");
    } catch (error) {
      console.error("[branding] save failed", error);
      showError("Failed to save branding settings");
      if (uploadedLogoPath) {
        // Clean up uploaded logo on error
        await fetch("/api/storage/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            workspaceId,
            items: [
              {
                logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
                path: uploadedLogoPath,
              },
            ],
          }),
        }).catch((err) =>
          console.error("Failed to clean up uploaded logo:", err),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const headerPreviewLogo = useMemo(
    () => logoPreviewUrl ?? undefined,
    [logoPreviewUrl],
  );

  const canPreviewHeader = useMemo(() => {
    return Boolean(
      (companyName && companyName.trim().length > 0) ||
      (websiteUrl && websiteUrl.trim().length > 0) ||
      logoPreviewUrl,
    );
  }, [companyName, websiteUrl, logoPreviewUrl]);

  const pageTitle = isIdentitySection ? "Custom domain" : "Watermarks";
  const pageDescription = isIdentitySection
    ? "Manage custom domains and brand identity settings."
    : "Create watermark templates to protect shared documents.";

  if (!workspaceId) {
    return (
      <PageContainer className="mx-auto max-w-6xl pb-16">
        <PageHeader
          title={pageTitle}
          description={
            isIdentitySection
              ? "Select or create a workspace to configure custom domains."
              : "Select or create a workspace to manage watermark templates."
          }
          className="mb-6"
        />
        <SurfaceCard className="bg-card/45 [box-shadow:none]">
          <CardHeader>
            <CardTitle>{pageTitle}</CardTitle>
            <CardDescription>
              {isIdentitySection
                ? "Select or create a workspace to configure custom domains."
                : "Select or create a workspace to manage watermark templates."}
            </CardDescription>
          </CardHeader>
        </SurfaceCard>
      </PageContainer>
    );
  }

  if (loading && isIdentitySection) {
    return (
      <PageContainer className="mx-auto max-w-6xl pb-16">
        <PageHeader
          title={pageTitle}
          description={pageDescription}
          className="mb-6"
        />
        <div className="space-y-6">
          <SurfaceCard className="bg-card/45 [box-shadow:none]">
            <CardHeader>
              <CardTitle>{pageTitle}</CardTitle>
              <CardDescription>Loading workspace branding…</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-28 animate-pulse rounded bg-muted/40" />
            </CardContent>
          </SurfaceCard>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="mx-auto max-w-6xl pb-16">
      <PageHeader
        title={pageTitle}
        description={pageDescription}
        className="mb-6"
      />
      {isIdentitySection && isRoleLoading ? (
        <div className="space-y-6 pt-2">
          <SurfaceCard className="bg-card/45 [box-shadow:none]">
            <CardHeader>
              <CardTitle>{pageTitle}</CardTitle>
              <CardDescription>Loading permissions…</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-24 animate-pulse rounded bg-muted/40" />
            </CardContent>
          </SurfaceCard>
        </div>
      ) : isIdentitySection ? (
        <div className="space-y-5 pt-2">
          {!canManageWorkspaceSettings ? (
            <div className="flex items-start gap-3 rounded border border-border/70 bg-muted/[0.14] p-4 text-sm">
              <LockKey
                size={17}
                className="mt-0.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              Only workspace owners can manage branding and custom domains.
            </div>
          ) : null}
          {canManageWorkspaceSettings && !customDomainsEnabled ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-primary/20 bg-primary/[0.035] p-4 text-sm">
              <div>
                <p className="font-medium">
                  Custom domains require an active subscription.
                </p>
                <p className="text-xs text-muted-foreground">
                  Upgrade or restart your subscription to enable branded links.
                </p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link href="/settings?tab=subscription&planPicker=1">
                  View plans
                </Link>
              </Button>
            </div>
          ) : null}
          {workspaceId && canManageWorkspaceSettings && customDomainsEnabled ? (
            <div data-guide="branding-domain-section">
              <React.Suspense
                fallback={
                  <SurfaceCard className="bg-card/45 [box-shadow:none]">
                    <CardHeader>
                      <CardTitle>Custom Domain</CardTitle>
                      <CardDescription>Loading configuration…</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-24 animate-pulse rounded bg-muted/40" />
                    </CardContent>
                  </SurfaceCard>
                }
              >
                <CustomDomainSection
                  workspaceId={workspaceId}
                  onVerificationStatusChange={(verified, host) => {
                    setDomainVerified(verified);
                    if (verified && host) {
                      setWebsiteUrl(host);
                      setWebsiteLocked(true);
                    } else {
                      setWebsiteLocked(false);
                    }
                  }}
                />
              </React.Suspense>
            </div>
          ) : null}
          {/* White-label identity stays locked until the custom-domain flow reports a verified domain. */}
          <SurfaceCard
            data-guide="branding-identity-form"
            className="ph-no-capture overflow-hidden bg-card/45 [box-shadow:none]"
            data-ph-no-capture
          >
            {!domainVerified && customDomainsEnabled ? (
              <div className="mx-3 mt-3 -mb-3 flex items-start gap-2 rounded bg-muted/[0.12] p-3 text-sm text-foreground">
                <LockKey
                  size={16}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>
                  Complete domain verification above to enable company identity.
                </span>
              </div>
            ) : null}
            <CardHeader
              className={cn(
                "border-b border-border/60 pb-4",
                !domainVerified ? "opacity-20" : "",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
                  <Buildings size={17} aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <p className="dk-nocturne-kicker">Recipient branding</p>
                  <CardTitle className="font-medium">
                    Company identity
                  </CardTitle>
                  <CardDescription>
                    Update the company details shown to viewers, then generate a
                    header preview when you are ready.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent
              className={cn(
                "space-y-8 pt-6",
                !domainVerified ? "opacity-20" : "",
              )}
            >
              <div className="flex flex-col gap-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2 pt-1 md:pt-0">
                    <Label htmlFor="companyName">Company name</Label>
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="Acme Corporation"
                      autoComplete="organization"
                      disabled={!domainVerified || !canManageWorkspaceSettings}
                    />
                  </div>

                  <div className="space-y-2 pt-1 md:pt-0">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="websiteUrl">Website</Label>
                      {websiteLocked ? <Badge>Verified</Badge> : null}
                    </div>
                    <Input
                      id="websiteUrl"
                      value={websiteUrl}
                      onChange={(event) => setWebsiteUrl(event.target.value)}
                      placeholder="https://www.example.com"
                      autoComplete="url"
                      disabled={
                        websiteLocked ||
                        !domainVerified ||
                        !canManageWorkspaceSettings
                      }
                    />
                    {!websiteLocked ? (
                      <p className="text-xs text-muted-foreground">
                        Include the protocol (https://) so viewers can open the
                        link directly.
                      </p>
                    ) : null}
                  </div>
                </div>

                <Separator className="dk-nocturne-rule" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/25 text-muted-foreground">
                        <ImageIcon size={16} aria-hidden="true" />
                      </span>
                      <div>
                        <Label>Company logo</Label>
                        <p className="text-xs text-muted-foreground">
                          SVG, PNG, JPG, or WebP. Max 2MB. Use a transparent
                          background where possible.
                        </p>
                      </div>
                    </div>
                    {logoPreviewUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveLogo}
                        type="button"
                        disabled={
                          !domainVerified || !canManageWorkspaceSettings
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <Button
                      type="button"
                      onClick={triggerLogoPicker}
                      disabled={!domainVerified || !canManageWorkspaceSettings}
                    >
                      {logoPreviewUrl ? "Replace logo" : "Upload logo"}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={Array.from(ALLOWED_LOGO_MIME_TYPES).join(",")}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        handleLogoSelection(file);
                        event.target.value = "";
                      }}
                    />
                    {logoPreviewUrl ? (
                      <span className="text-xs text-muted-foreground">
                        {logoFile ? logoFile.name : "Current logo"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No logo uploaded yet
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsHeaderPreviewOpen(true)}
                  disabled={
                    !canPreviewHeader ||
                    !domainVerified ||
                    !canManageWorkspaceSettings
                  }
                  data-guide="branding-preview-header"
                >
                  Preview header
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={
                    saving ||
                    !isDirty ||
                    !domainVerified ||
                    !canManageWorkspaceSettings
                  }
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </CardContent>
          </SurfaceCard>
        </div>
      ) : canManageWorkspaceSettings ? (
        <div className="space-y-8 pt-2">
          <WatermarkTemplatesManager workspaceId={workspaceId} />
        </div>
      ) : isRoleLoading ? (
        <div className="space-y-6 pt-2">
          <SurfaceCard className="bg-card/45 [box-shadow:none]">
            <CardHeader>
              <CardTitle>Watermarks</CardTitle>
              <CardDescription>Loading permissions…</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-24 animate-pulse rounded bg-muted/40" />
            </CardContent>
          </SurfaceCard>
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          <div className="flex items-start gap-3 rounded border border-border/70 bg-muted/[0.14] p-4 text-sm">
            <ShieldCheck
              size={17}
              className="mt-0.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            Only workspace owners can manage watermark templates.
          </div>
        </div>
      )}

      <Dialog open={isHeaderPreviewOpen} onOpenChange={setIsHeaderPreviewOpen}>
        <DialogContent className="ph-no-capture max-w-3xl" data-ph-no-capture>
          <DialogHeader>
            <DialogTitle>Header preview</DialogTitle>
            <DialogDescription>
              This is how your branding appears above shared documents.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto">
            <div className="overflow-hidden rounded-lg border border-border/70">
              <div className="border-b bg-card/95 p-4">
                <BrandingHeader
                  companyName={companyName}
                  websiteUrl={websiteUrl}
                  logoUrl={headerPreviewLogo || null}
                  className="shadow-none"
                />
              </div>
              <div className="relative aspect-[8.5/11] w-full bg-muted">
                <iframe
                  src={`${DUMMY_PDF_DATA_URL}#toolbar=0&navpanes=0&scrollbar=0`}
                  className="absolute inset-0 h-full w-full border-0"
                  title="Branding header preview"
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default BrandingSettingsClient;
