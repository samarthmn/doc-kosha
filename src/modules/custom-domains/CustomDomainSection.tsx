"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Badge } from "@/components/ui/badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { showError, showSuccess } from "@/lib/toast";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import { isValidHostname } from "@/lib/validators/customDomain";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Trash as Trash2,
  SpinnerGap as Loader2,
  WarningCircle as AlertCircle,
  Clock,
  Copy,
  Check,
  GlobeHemisphereWest as Globe,
  ArrowRight,
  ShieldCheck,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const DNSRecordRow = ({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) => {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        showSuccess(`Copied ${label}`);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => showError("Failed to copy"));
  };

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/30",
        !isLast && "border-b border-border/50",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-6">
        <span className="w-24 shrink-0 text-xs font-semibold tracking-wider text-muted-foreground/70 uppercase">
          {label}
        </span>
        <div className="relative min-w-0 flex-1">
          <code className="block w-full truncate rounded px-2 py-1 font-mono text-sm font-medium text-foreground">
            {value}
          </code>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground opacity-100 transition-all group-hover:bg-background hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
        onClick={onCopy}
        title="Copy value"
        aria-label={`Copy ${label}`}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </Button>
    </div>
  );
};

type DomainRow = {
  id: string;
  workspace_id: string;
  domain: string;
  verification_token: string;
  status: "pending" | "verified" | "failed";
  created_at: string;
  verified_at: string | null;
  cname_target: string | null;
};

type DnsRecord = {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  purpose: "cname" | "ownership" | "ssl_validation";
};

type CustomDomainSectionProps = {
  workspaceId: string;
  onVerified?: (hostname: string) => void;
  onVerificationStatusChange?: (
    verified: boolean,
    hostname?: string | null,
  ) => void;
};

const CustomDomainSection: React.FC<CustomDomainSectionProps> = ({
  workspaceId,
  onVerified,
  onVerificationStatusChange,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [domainInput, setDomainInput] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<DomainRow | null>(null);
  const [removing, setRemoving] = useState<boolean>(false);
  const [verifyErrors, setVerifyErrors] = useState<Record<string, string>>({});
  const [verifyPendingMessages, setVerifyPendingMessages] = useState<
    Record<string, string>
  >({});
  const [dnsRecords, setDnsRecords] = useState<
    Record<string, { loading: boolean; records: DnsRecord[]; error?: string }>
  >({});

  const isHostnameValidMemo = useMemo(() => {
    const value = domainInput.trim().toLowerCase();
    if (!value) return false;
    return isValidHostname(value);
  }, [domainInput]);

  const verified = useMemo(
    () => domains.find((d) => d.status === "verified") ?? null,
    [domains],
  );
  // const pending = useMemo(
  //   () => domains.find((d) => d.status === "pending") ?? null,
  //   [domains],
  // );

  const hostnameFor = useCallback((row: DomainRow): string | null => {
    if (row.status !== "verified") return null;
    return row.domain;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase
        .from("custom_domains")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDomains((data as DomainRow[]) || []);
    } catch (e) {
      console.error("[domains] load failed", e);
      setLoadError(true);
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Don't report "not verified" off the back of a failed load — the
    // workspace may still have a verified domain we simply couldn't fetch.
    if (loadError) return;
    const host = verified ? hostnameFor(verified) : null;
    if (verified && host && onVerified) {
      onVerified(`https://${host}`);
    }
    if (onVerificationStatusChange) {
      onVerificationStatusChange(
        Boolean(verified),
        host ? `https://${host}` : null,
      );
    }
  }, [
    loadError,
    verified,
    hostnameFor,
    onVerified,
    onVerificationStatusChange,
  ]);

  const handleCreate = async () => {
    const domain = domainInput.trim().toLowerCase();
    if (!domain) return;
    setCreating(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, domain }),
      });
      const json = await res.json();
      if (!res.ok) {
        showError(json?.error || "Failed to add domain");
        return;
      }
      showSuccess("Domain added. Add the TXT record, then click Verify.");
      trackProductEvent("domain_added", {
        workspace_id: workspaceId,
        domain,
      });
      setDomainInput("");
      await load();
    } catch {
      showError("Failed to add domain");
    } finally {
      setCreating(false);
    }
  };

  const loadDnsRecords = useCallback(
    async (domainId: string) => {
      setDnsRecords((prev) => ({
        ...prev,
        [domainId]: { loading: true, records: prev[domainId]?.records ?? [] },
      }));

      try {
        const res = await fetch("/api/domains/dns-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, domainId }),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          const message =
            typeof json?.error === "string" && json.error.length > 0
              ? json.error
              : "Failed to load DNS records";
          setDnsRecords((prev) => ({
            ...prev,
            [domainId]: { loading: false, records: [], error: message },
          }));
          return;
        }

        const nextRecords = Array.isArray(json?.records)
          ? (json.records as DnsRecord[])
          : [];

        setDnsRecords((prev) => ({
          ...prev,
          [domainId]: { loading: false, records: nextRecords },
        }));
      } catch {
        setDnsRecords((prev) => ({
          ...prev,
          [domainId]: {
            loading: false,
            records: [],
            error: "Failed to load DNS records",
          },
        }));
      }
    },
    [workspaceId],
  );

  const handleVerify = async (id: string) => {
    const maxAutoRetries = 4;
    setVerifyingId(id);
    setVerifyErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setVerifyPendingMessages((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      for (let attempt = 0; attempt <= maxAutoRetries; attempt += 1) {
        const res = await fetch("/api/domains/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, domainId: id }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          const raw = String(json?.error || "").toLowerCase();
          let friendly = "Verification failed. Please retry in a few minutes.";

          if (raw.includes("dns lookup failed")) {
            friendly =
              "DNS lookup failed. Confirm the domain exists and try again.";
          } else if (raw.includes("not found") || raw.includes("mismatch")) {
            friendly =
              "Verification record not found yet. DNS may still be propagating.";
          } else if (typeof json?.error === "string" && json.error.length > 0) {
            friendly = json.error;
          }

          setVerifyErrors((prev) => ({ ...prev, [id]: friendly }));
          return;
        }

        if (json?.status === "pending") {
          const pendingMessage =
            typeof json?.message === "string" && json.message.length > 0
              ? json.message
              : "DNS records are still propagating. We'll keep checking automatically.";
          setVerifyPendingMessages((prev) => ({
            ...prev,
            [id]: pendingMessage,
          }));

          if (attempt === maxAutoRetries) {
            setVerifyErrors((prev) => ({
              ...prev,
              [id]: "Verification is still pending. Please retry in a few minutes if DNS propagation has completed.",
            }));
            return;
          }

          const retryAfterMs =
            typeof json?.retry_after_ms === "number" && json.retry_after_ms > 0
              ? json.retry_after_ms
              : 15000;
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
          continue;
        }

        await load();
        setVerifyPendingMessages((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (json?.hostname && onVerified) {
          onVerified(`https://${json.hostname}`);
        }
        showSuccess("Domain verified successfully!");
        trackProductEvent("domain_verified", {
          workspace_id: workspaceId,
          domain_id: id,
          hostname: json?.hostname ?? undefined,
        });
        return;
      }
    } catch {
      setVerifyErrors((prev) => ({
        ...prev,
        [id]: "Verification failed. Please retry in a few minutes.",
      }));
    } finally {
      setVerifyingId(null);
    }
  };

  useEffect(() => {
    const pending = domains.filter((d) => d.status === "pending");
    if (pending.length === 0) return;

    for (const row of pending) {
      const existing = dnsRecords[row.id];
      if (
        !existing ||
        (!existing.loading && !existing.error && existing.records.length === 0)
      ) {
        void loadDnsRecords(row.id);
      }
    }
  }, [dnsRecords, domains, loadDnsRecords]);

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      // Use the server-side delete endpoint to also deprovision from Cloudflare
      const res = await fetch(`/api/domains/${removeTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to remove domain");
      }
      showSuccess("Domain removed");
      trackProductEvent("domain_removed", {
        workspace_id: workspaceId,
        domain_id: removeTarget.id,
        domain: removeTarget.domain,
      });
      setRemoveTarget(null);
      await load();
      // After reload, effect will notify status; as a safeguard, emit not verified
      if (onVerificationStatusChange) {
        onVerificationStatusChange(false, null);
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to remove domain";
      showError(message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <SurfaceCard className="overflow-hidden bg-card/45 [box-shadow:none]">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="dk-nocturne-kicker">Branded delivery host</p>
            <CardTitle className="mt-1 flex items-center gap-2 font-medium tracking-tight">
              <Globe size={17} className="text-primary" aria-hidden="true" />
              Custom Domain
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground/80">
              Serve your documents on your own domain (e.g., docs.example.com).
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {/* Load Error State */}
        {loadError && !loading && (
          <div className="flex flex-col gap-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="font-medium">
                Couldn&apos;t load your custom domain configuration. Any
                existing setup is unaffected.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => void load()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Input Section */}
        {!loadError && domains.length === 0 && (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Input
                  placeholder="docs.yourcompany.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  disabled={creating}
                  className="font-mono text-sm"
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                onClick={() => void handleCreate()}
                disabled={
                  creating || !domainInput.trim() || !isHostnameValidMemo
                }
                className="shrink-0 font-medium"
              >
                {creating ? (
                  <>
                    <Loader2
                      className="mr-2 h-3.5 w-3.5 animate-spin"
                      aria-hidden
                    />
                    Adding...
                  </>
                ) : (
                  <>
                    Add Domain
                    <ArrowRight
                      className="ml-2 h-3.5 w-3.5 opacity-50"
                      aria-hidden
                    />
                  </>
                )}
              </Button>
            </div>
            {domainInput.trim() && !isHostnameValidMemo && (
              <p className="flex animate-in items-center gap-1.5 text-xs text-destructive fade-in slide-in-from-left-1">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                Please enter a valid hostname (e.g., docs.example.com)
              </p>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && domains.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Loader2
              className="h-8 w-8 animate-spin text-primary/30"
              aria-hidden
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Loading configuration...
            </p>
          </div>
        )}

        {/* Domain List */}
        {!loading && domains.length > 0 && (
          <div className="space-y-6">
            {domains.map((d) => {
              // const hostname = hostnameFor(d);
              return (
                <div
                  key={d.id}
                  className="rounded-lg border border-border/70 bg-card/35"
                >
                  {/* Domain Header */}
                  <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded border border-primary/20 bg-primary/[0.06] p-1.5">
                        <Globe className="h-4 w-4 text-primary" aria-hidden />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold">{d.domain}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                            Status:
                          </span>
                          {d.status === "verified" ? (
                            <Badge
                              variant="default"
                              className="h-4 bg-green-500/15 px-1.5 py-0 text-[10px] font-medium text-green-600 hover:bg-green-500/25 dark:bg-green-500/10 dark:text-green-400"
                            >
                              Verified
                            </Badge>
                          ) : d.status === "pending" ? (
                            <Badge
                              variant="secondary"
                              className="h-4 bg-amber-500/15 px-1.5 py-0 text-[10px] font-medium text-amber-600 hover:bg-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400"
                            >
                              Pending Verification
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="h-4 px-1.5">
                              Failed
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoveTarget(d)}
                      aria-label={`Remove domain ${d.domain}`}
                      title={`Remove domain ${d.domain}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Remove domain</span>
                    </Button>
                  </div>

                  {/* Verification Instructions */}
                  {d.status === "pending" && (
                    <div className="p-4">
                      <div className="mb-4 flex items-start gap-3 p-3 text-sm">
                        <ShieldCheck
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            Verification Required
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Add these DNS records to your domain provider to
                            prove ownership.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {dnsRecords[d.id]?.error && (
                          <div className="flex animate-in items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive fade-in slide-in-from-top-1">
                            <AlertCircle
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                            <p className="font-medium">
                              {dnsRecords[d.id]?.error}
                            </p>
                          </div>
                        )}

                        {/* CNAME */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">
                              1
                            </span>
                            CNAME Record
                          </div>
                          <div className="overflow-hidden rounded border border-border/70 bg-background/25">
                            <DNSRecordRow label="Type" value="CNAME" />
                            <DNSRecordRow label="Name" value={d.domain} />
                            <DNSRecordRow
                              label="Target"
                              value={d.cname_target ?? "Unavailable"}
                              isLast
                            />
                          </div>
                        </div>

                        {/* TXT */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">
                              2
                            </span>
                            TXT Record (Ownership Verification)
                          </div>
                          <div className="overflow-hidden rounded border border-border/70 bg-muted/[0.12]">
                            <DNSRecordRow label="Type" value="TXT" />
                            <DNSRecordRow
                              label="Name"
                              value={
                                dnsRecords[d.id]?.records.find(
                                  (r) =>
                                    r.type === "TXT" &&
                                    r.purpose === "ownership",
                                )?.name ?? `_cf-custom-hostname.${d.domain}`
                              }
                            />
                            <DNSRecordRow
                              label="Value"
                              value={
                                dnsRecords[d.id]?.records.find(
                                  (r) =>
                                    r.type === "TXT" &&
                                    r.purpose === "ownership",
                                )?.value ?? d.verification_token
                              }
                              isLast
                            />
                          </div>
                        </div>

                        {dnsRecords[d.id]?.records.some(
                          (r) =>
                            r.type === "TXT" && r.purpose === "ssl_validation",
                        ) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">
                                3
                              </span>
                              TXT Record (SSL Validation)
                            </div>

                            <div className="space-y-2">
                              {dnsRecords[d.id]?.records
                                .filter(
                                  (r) =>
                                    r.type === "TXT" &&
                                    r.purpose === "ssl_validation",
                                )
                                .map((r) => (
                                  <div
                                    key={`${r.name}:${r.value}`}
                                    className="overflow-hidden rounded border border-border/70 bg-muted/[0.12]"
                                  >
                                    <DNSRecordRow label="Type" value="TXT" />
                                    <DNSRecordRow label="Name" value={r.name} />
                                    <DNSRecordRow
                                      label="Value"
                                      value={r.value}
                                      isLast
                                    />
                                  </div>
                                ))}
                            </div>

                            <p className="text-xs text-muted-foreground">
                              Your DNS provider may show this TXT record with a
                              shortened host label. If this record appears in
                              your provider panel, it is required for
                              certificate issuance.
                            </p>
                          </div>
                        )}

                        {/* Action Bar */}
                        <div className="mt-2 flex items-center justify-between border-t pt-4">
                          <div className="text-xs text-muted-foreground">
                            DNS changes can take up to 24-48h to propagate.
                          </div>
                          <Button
                            onClick={() => void handleVerify(d.id)}
                            disabled={verifyingId === d.id}
                            size="sm"
                            className={cn(
                              "min-w-[100px]",
                              verifyingId === d.id && "opacity-80",
                            )}
                          >
                            {verifyingId === d.id ? (
                              <>
                                <Loader2
                                  className="mr-2 h-3.5 w-3.5 animate-spin"
                                  aria-hidden
                                />
                                Verifying...
                              </>
                            ) : (
                              "Verify Records"
                            )}
                          </Button>
                        </div>

                        {/* Error Feedback */}
                        {verifyErrors[d.id] && (
                          <div className="mt-2 flex animate-in items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive fade-in slide-in-from-top-1">
                            <AlertCircle
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                            <p className="font-medium">{verifyErrors[d.id]}</p>
                          </div>
                        )}
                        {verifyPendingMessages[d.id] && !verifyErrors[d.id] && (
                          <div className="mt-2 flex animate-in items-start gap-2 rounded-md bg-muted p-2.5 text-xs text-muted-foreground fade-in slide-in-from-top-1">
                            <Clock
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                            <p>{verifyPendingMessages[d.id]}</p>
                          </div>
                        )}
                        {/* Verify Waiting State */}
                        {verifyingId === d.id && (
                          <div className="mt-2 flex animate-in items-start gap-2 rounded-md bg-muted p-2.5 text-xs text-muted-foreground fade-in slide-in-from-top-1">
                            <Clock
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                            <p>
                              We're checking your DNS records. This might take a
                              few moments...
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Verified State Info */}
                  {d.status === "verified" && (
                    <div className="flex items-center gap-3 p-4 text-sm">
                      <Check
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="text-muted-foreground">
                        Your domain is active. Share links will now use{" "}
                        <span className="font-medium text-foreground underline">
                          {d.domain}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Custom Domain?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.status === "verified"
                ? "This will disconnect your custom domain. Existing links using this domain will stop working immediately."
                : "This will remove the pending domain configuration from your workspace."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
              disabled={removing}
            >
              {removing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Removing...
                </>
              ) : (
                "Remove Domain"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SurfaceCard>
  );
};

export default CustomDomainSection;
