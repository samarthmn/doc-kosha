"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { exitFade } from "@/lib/motion";
import { useRecentlyAddedRows } from "@/hooks/useRecentlyAddedRows";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import LinkSettingsInline from "@/components/links/LinkSettingsInline";
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
  CircleNotch,
  Link as LinkIcon,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import type { Tables } from "@/types/generated/supabase";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import { useLinks } from "@/hooks/useLinks";
import { type LinkSettings } from "@/components/documents/LinkSettingsPanel";
import {
  DEFAULT_PUBLIC_LANGUAGE,
  normalizePublicLanguage,
  normalizePublicLanguageOverride,
  type PublicLanguage,
} from "@/modules/public-links/types";
import type { WatermarkDefinition } from "@/lib/branding";
import {
  resolveWatermarkDefinition,
  type BrandingRecord,
} from "@/lib/branding";
import {
  materializeWatermark,
  type WatermarkTemplateRow,
} from "@/lib/watermarks";
import { showError, showSuccess, showWarning } from "@/lib/toast";
import { normalizeEmail } from "@/lib/email";
import LinkListItem from "@/components/links/LinkListItem";
import { describeLinkFeatures } from "@/components/links/linkFeatures";
import {
  LinkAccessRuleOverlapError,
  deleteLinkPreset,
  fetchLinkAccessRules,
  fetchLinkPresetDetails,
  fetchLinkPresetSummaries,
  fetchWorkspaceUserGroups,
  replaceLinkAccessRules,
  saveLinkPreset,
  updateLinkPreset,
  type LinkPresetDetails,
  type LinkPresetSummary,
  type WorkspaceUserGroup,
} from "@/lib/linkAllowlistClient";
import {
  fetchLinkAlcRules,
  isLinkAlcRulesActive,
  replaceLinkAlcRules,
  type LinkAlcRules,
} from "@/lib/linkAlcClient";
import {
  buildPresetComparable,
  type PresetComparable,
} from "@/components/links/linkPresetComparable";
import { deriveEmailVerification } from "@/components/links/linkSettingsRules";
import { canUseCustomDomain } from "@/modules/custom-domains/entitlements";
import { prepareAlcRulesApply } from "@/modules/public-links";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { retryDocumentConversion } from "@/components/documents/conversionClient";
import type { InternalViewerDoc } from "@/components/documents/internal/InternalDocumentViewerContext";
import {
  readPrefetchCache,
  runCachedPrefetch,
  writePrefetchCache,
} from "@/modules/performance/prefetchCache";
import {
  createWorkspaceSlug,
  resolveCustomLinkSlug,
  sanitizeShareSlugDraft,
} from "@/lib/publicLinkPaths";

interface LinksManagerCardProps {
  resourceType: "document" | "data_room";
  resourceId: string;
  workspaceId: string;
  resourceName: string;
  defaultLinkName: string;
  document?: InternalViewerDoc | null;
  dataGuideCard?: string;
  dataGuideNewButton?: string;
  dataGuideList?: string;
}

type LinkRow = Tables<"links">;

const defaultSettings: LinkSettings = {
  name: "",
  customSlug: "",
  passwordEnabled: false,
  password: "",
  emailNotifications: false,
  expiration: "",
  downloadEnabled: false,
  emailVerification: false,
  collectEmailsForAnalytics: false,
  screenshotProtection: true,
  watermark: false,
  watermarkTemplateId: null,
  ndaRequired: false,
  ndaTemplateId: null,
  dynamicWatermarkEmail: false,
  dynamicWatermarkIp: false,
  dynamicWatermarkDateTime: false,
  showQnA: false,
  showFeedback: false,
  commentsEnabled: false,
  qaPairs: [],
  allowedEmails: [],
  blockedEmails: [],
  allowedGroupIds: [],
  blockedGroupIds: [],
  sendInviteEmails: false,
  publicLanguageOverride: null,
};

const defaultAlcRules: LinkAlcRules = {
  room: { allowedEmails: [], allowedGroupIds: [] },
  folders: [],
  documents: [],
};

const RESEND_INVITES_BASE_COOLDOWN_SEC = 60;
const RESEND_INVITES_MAX_COOLDOWN_SEC = 15 * 60;
const LINKS_MANAGER_CACHE_TTL_MS = 45_000;

const dedupeStrings = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()))).filter(
    (value) => value.length > 0,
  );

const dedupeEmails = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => normalizeEmail(value)))).filter(
    (value) => value.length > 0,
  );

const parsePresetQAPairs = (
  value: unknown,
): Array<{ question: string; answer: string }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as { question?: unknown; answer?: unknown };
      const question =
        typeof row.question === "string" ? row.question.trim() : "";
      const answer = typeof row.answer === "string" ? row.answer.trim() : "";
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((entry): entry is { question: string; answer: string } =>
      Boolean(entry),
    );
};

const LinksManagerCard: React.FC<LinksManagerCardProps> = ({
  resourceType,
  resourceId,
  workspaceId,
  resourceName,
  defaultLinkName,
  document,
  dataGuideCard,
  dataGuideNewButton,
  dataGuideList,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { createLink, updateLink } = useLinks();
  const [canManageLinks, setCanManageLinks] = useState<boolean>(false);
  const [isCheckingCanManageLinks, setIsCheckingCanManageLinks] =
    useState<boolean>(true);
  const permissionDataRoomId = useMemo(() => {
    if (resourceType === "data_room") return resourceId;
    const maybeRoomId = (
      document as unknown as { data_room_id?: unknown } | null
    )?.data_room_id;
    return typeof maybeRoomId === "string" && maybeRoomId.trim()
      ? maybeRoomId
      : null;
  }, [document, resourceId, resourceType]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!workspaceId) {
        if (!cancelled) {
          setCanManageLinks(false);
          setIsCheckingCanManageLinks(false);
        }
        return;
      }

      setIsCheckingCanManageLinks(true);
      try {
        if (permissionDataRoomId) {
          const { data, error } = await supabase.rpc("can_edit_data_room", {
            ws: workspaceId,
            room_id: permissionDataRoomId,
          });
          if (cancelled) return;
          setCanManageLinks(!error && Boolean(data));
          return;
        }

        const { data, error } = await supabase.rpc(
          "can_edit_workspace_documents",
          {
            ws: workspaceId,
          },
        );
        if (cancelled) return;
        setCanManageLinks(!error && Boolean(data));
      } catch (error) {
        console.error("[LinksManagerCard] failed to check link permission", {
          workspaceId,
          resourceType,
          resourceId,
          permissionDataRoomId,
          error,
        });
        if (!cancelled) setCanManageLinks(false);
      } finally {
        if (!cancelled) setIsCheckingCanManageLinks(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [permissionDataRoomId, resourceId, resourceType, supabase, workspaceId]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const {
    isRecentlyAdded: isRecentlyAddedLink,
    markRecentlyAdded: markRecentlyAddedLink,
  } = useRecentlyAddedRows();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showPanel, setShowPanel] = useState<boolean>(false);
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => {
    editingIdRef.current = editing?.id ?? null;
  }, [editing]);
  const [deleteTarget, setDeleteTarget] = useState<LinkRow | null>(null);
  const [settings, setSettings] = useState<LinkSettings>(defaultSettings);
  const [alcRules, setAlcRules] = useState<LinkAlcRules>(defaultAlcRules);
  const [alcBlocklistOverlapEmails, setAlcBlocklistOverlapEmails] = useState<
    string[]
  >([]);
  const [alcConflictReviewRequest, setAlcConflictReviewRequest] = useState(0);

  const alcActive = useMemo(() => {
    if (resourceType !== "data_room") return false;
    return isLinkAlcRulesActive(alcRules);
  }, [alcRules, resourceType]);

  const sanitizeLinkAlcRules = useCallback(
    (input: LinkAlcRules): LinkAlcRules => {
      const roomAllowedEmails = dedupeEmails(input.room?.allowedEmails ?? []);
      const roomAllowedGroupIds = dedupeStrings(
        input.room?.allowedGroupIds ?? [],
      );

      const folderRulesById = new Map<
        string,
        { folderId: string; allowedEmails: string[]; allowedGroupIds: string[] }
      >();
      for (const rule of input.folders ?? []) {
        const folderId = (rule.folderId ?? "").trim();
        if (!folderId) continue;
        const allowedEmails = dedupeEmails(rule.allowedEmails ?? []);
        const allowedGroupIds = dedupeStrings(rule.allowedGroupIds ?? []);
        if (allowedEmails.length === 0 && allowedGroupIds.length === 0)
          continue;
        const existing = folderRulesById.get(folderId);
        folderRulesById.set(folderId, {
          folderId,
          allowedEmails: dedupeEmails([
            ...(existing?.allowedEmails ?? []),
            ...allowedEmails,
          ]),
          allowedGroupIds: dedupeStrings([
            ...(existing?.allowedGroupIds ?? []),
            ...allowedGroupIds,
          ]),
        });
      }

      const documentRulesById = new Map<
        string,
        {
          documentId: string;
          allowedEmails: string[];
          allowedGroupIds: string[];
        }
      >();
      for (const rule of input.documents ?? []) {
        const documentId = (rule.documentId ?? "").trim();
        if (!documentId) continue;
        const allowedEmails = dedupeEmails(rule.allowedEmails ?? []);
        const allowedGroupIds = dedupeStrings(rule.allowedGroupIds ?? []);
        if (allowedEmails.length === 0 && allowedGroupIds.length === 0)
          continue;
        const existing = documentRulesById.get(documentId);
        documentRulesById.set(documentId, {
          documentId,
          allowedEmails: dedupeEmails([
            ...(existing?.allowedEmails ?? []),
            ...allowedEmails,
          ]),
          allowedGroupIds: dedupeStrings([
            ...(existing?.allowedGroupIds ?? []),
            ...allowedGroupIds,
          ]),
        });
      }

      return {
        room: {
          allowedEmails: roomAllowedEmails,
          allowedGroupIds: roomAllowedGroupIds,
        },
        folders: Array.from(folderRulesById.values()).sort((a, b) =>
          a.folderId.localeCompare(b.folderId),
        ),
        documents: Array.from(documentRulesById.values()).sort((a, b) =>
          a.documentId.localeCompare(b.documentId),
        ),
      };
    },
    [],
  );

  const handleAlcRulesChange = useCallback(
    (next: LinkAlcRules) => {
      setAlcRules(sanitizeLinkAlcRules(next));
    },
    [sanitizeLinkAlcRules],
  );

  const [watermarkDefinition, setWatermarkDefinition] =
    useState<WatermarkDefinition | null>(null);
  const [watermarkTemplates, setWatermarkTemplates] = useState<
    WatermarkTemplateRow[]
  >([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isAccessRulesLoading, setIsAccessRulesLoading] =
    useState<boolean>(false);
  const [accessRulesLoadFailed, setAccessRulesLoadFailed] =
    useState<boolean>(false);
  const [isResendingInvites, setIsResendingInvites] = useState(false);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [resendAttemptCount, setResendAttemptCount] = useState(0);
  const [userGroups, setUserGroups] = useState<WorkspaceUserGroup[]>([]);
  const [linkPresets, setLinkPresets] = useState<LinkPresetSummary[]>([]);
  const [isPresetPending, setIsPresetPending] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [activePresetComparable, setActivePresetComparable] =
    useState<PresetComparable | null>(null);
  const [activeCustomDomain, setActiveCustomDomain] = useState<string | null>(
    null,
  );
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(null);
  const [workspaceDefaultPublicLanguage, setWorkspaceDefaultPublicLanguage] =
    useState<PublicLanguage>(DEFAULT_PUBLIC_LANGUAGE);
  const createInitRef = useRef(false);
  const [customDomainsEnabled, setCustomDomainsEnabled] = useState(false);
  const [docState, setDocState] = useState<InternalViewerDoc | null>(
    document ?? null,
  );
  const basePath = useMemo(() => {
    if (pathname.endsWith("/create")) {
      return pathname.replace(/\/create$/, "");
    }
    return pathname;
  }, [pathname]);
  const isCreateRoute = pathname.endsWith("/share/create");
  const createPath = `${basePath}/create`;
  const showEditor = showPanel;
  const linksCacheKey = useMemo(
    () => `links-manager:links:${resourceType}:${resourceId}`,
    [resourceId, resourceType],
  );
  const brandingCacheKey = useMemo(
    () => `links-manager:branding:${workspaceId}`,
    [workspaceId],
  );
  const customDomainCacheKey = useMemo(
    () => `links-manager:custom-domain:${workspaceId}`,
    [workspaceId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => {
      mql.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    setDocState(document ?? null);
  }, [document]);

  useEffect(() => {
    let active = true;
    const cached = readPrefetchCache<{
      customDomainsEnabled: boolean;
      activeCustomDomain: string | null;
      workspaceSlug: string;
      workspaceDefaultPublicLanguage: PublicLanguage;
    }>(customDomainCacheKey);
    if (cached) {
      setCustomDomainsEnabled(cached.customDomainsEnabled);
      setActiveCustomDomain(cached.activeCustomDomain);
      if (cached.workspaceSlug) {
        setWorkspaceSlug(cached.workspaceSlug);
      }
      setWorkspaceDefaultPublicLanguage(
        normalizePublicLanguage(cached.workspaceDefaultPublicLanguage),
      );
    }
    // Read the workspace's configured active custom domain.
    const loadCustomDomain = async () => {
      try {
        const domainResult = await runCachedPrefetch(
          customDomainCacheKey,
          async () => {
            const { data: workspaceRow, error: workspaceError } = await supabase
              .from("workspaces")
              .select("name, active_custom_domain_id")
              .eq("id", workspaceId)
              .maybeSingle();
            if (workspaceError) {
              throw workspaceError;
            }
            const workspaceName =
              (
                workspaceRow as {
                  name?: string | null;
                  active_custom_domain_id?: string | null;
                } | null
              )?.name ?? "";
            const resolvedWorkspaceSlug = createWorkspaceSlug(workspaceName);
            const { data: publicSettingsRow } = await supabase
              .from("workspace_public_settings")
              .select("default_public_language")
              .eq("workspace_id", workspaceId)
              .maybeSingle();
            const defaultPublicLanguage = normalizePublicLanguage(
              publicSettingsRow?.default_public_language,
            );
            const { data: subscriptionRow } = await supabase
              .from("workspace_subscriptions")
              .select("*")
              .eq("workspace_id", workspaceId)
              .maybeSingle();
            const subscription = mapWorkspaceSubscriptionRow(subscriptionRow);
            const enabled = canUseCustomDomain(subscription);
            if (!enabled) {
              return {
                customDomainsEnabled: false,
                activeCustomDomain: null,
                workspaceSlug: resolvedWorkspaceSlug,
                workspaceDefaultPublicLanguage: defaultPublicLanguage,
              };
            }

            const domainId =
              (
                workspaceRow as {
                  active_custom_domain_id?: string | null;
                } | null
              )?.active_custom_domain_id ?? null;
            if (!domainId) {
              return {
                customDomainsEnabled: true,
                activeCustomDomain: null,
                workspaceSlug: resolvedWorkspaceSlug,
                workspaceDefaultPublicLanguage: defaultPublicLanguage,
              };
            }

            const { data: cd } = await supabase
              .from("custom_domains")
              .select("domain,status")
              .eq("id", domainId)
              .maybeSingle();
            const row = cd as {
              domain?: string | null;
              status?: string;
            } | null;
            return {
              customDomainsEnabled: true,
              activeCustomDomain:
                row?.status === "verified" && row.domain ? row.domain : null,
              workspaceSlug: resolvedWorkspaceSlug,
              workspaceDefaultPublicLanguage: defaultPublicLanguage,
            };
          },
          LINKS_MANAGER_CACHE_TTL_MS,
        );
        if (!active) return;
        setCustomDomainsEnabled(domainResult.customDomainsEnabled);
        setActiveCustomDomain(domainResult.activeCustomDomain);
        setWorkspaceSlug(domainResult.workspaceSlug);
        setWorkspaceDefaultPublicLanguage(
          domainResult.workspaceDefaultPublicLanguage,
        );
      } catch {
        if (active) {
          setActiveCustomDomain(null);
          setCustomDomainsEnabled(false);
          setWorkspaceSlug(null);
          setWorkspaceDefaultPublicLanguage(DEFAULT_PUBLIC_LANGUAGE);
        }
      }
    };
    void loadCustomDomain();
    return () => {
      active = false;
    };
  }, [customDomainCacheKey, supabase, workspaceId]);

  useEffect(() => {
    setResendCooldownSec(0);
    setResendAttemptCount(0);
  }, [editing?.id]);

  useEffect(() => {
    if (resendCooldownSec <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldownSec((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldownSec]);

  const loadAccessRulesForLink = useCallback(
    async (linkId: string, options?: { alcActive?: boolean }) => {
      const rules = await fetchLinkAccessRules(supabase, linkId);
      setSettings((prev) => {
        if (!prev) return prev;
        if (editingIdRef.current && editingIdRef.current !== linkId) {
          return prev;
        }
        const effectiveAlcActive = options?.alcActive ?? alcActive;
        const blockedEmails = dedupeEmails(rules.blockedEmails);
        const allowedEmails = dedupeEmails(rules.allowedEmails).filter(
          (email) => !blockedEmails.includes(email),
        );
        const blockedGroupIds = dedupeStrings(rules.blockedGroupIds);
        const allowedGroupIds = dedupeStrings(rules.allowedGroupIds).filter(
          (groupId) => !blockedGroupIds.includes(groupId),
        );
        const hasInviteRecipients =
          allowedEmails.length > 0 ||
          allowedGroupIds.length > 0 ||
          (resourceType === "data_room" && effectiveAlcActive);
        return {
          ...prev,
          allowedEmails,
          blockedEmails,
          allowedGroupIds,
          blockedGroupIds,
          sendInviteEmails: hasInviteRecipients ? prev.sendInviteEmails : false,
        };
      });
    },
    [alcActive, resourceType, supabase],
  );

  const loadAlcRulesForLink = useCallback(
    async (linkId: string): Promise<LinkAlcRules> => {
      if (resourceType !== "data_room") return defaultAlcRules;
      const rules = await fetchLinkAlcRules(supabase, linkId);
      if (editingIdRef.current && editingIdRef.current !== linkId) {
        return defaultAlcRules;
      }
      handleAlcRulesChange(rules);
      return rules;
    },
    [handleAlcRulesChange, resourceType, supabase],
  );

  // Loads the persisted allow/block + ALC rules for the link being edited.
  // Save stays disabled until this settles so an early Save (or a failed
  // load) can never overwrite the stored rules with the empty defaults the
  // editor is seeded with.
  const loadRulesForEditing = useCallback(
    async (linkId: string) => {
      setIsAccessRulesLoading(true);
      setAccessRulesLoadFailed(false);
      try {
        const loadedAlcRules = await loadAlcRulesForLink(linkId);
        const loadedAlcActive =
          resourceType === "data_room" && isLinkAlcRulesActive(loadedAlcRules);
        await loadAccessRulesForLink(linkId, { alcActive: loadedAlcActive });
      } catch (error) {
        console.error(
          "[links-manager] failed to load link access rules",
          error,
        );
        if (editingIdRef.current === linkId) {
          setAccessRulesLoadFailed(true);
        }
      } finally {
        if (editingIdRef.current === linkId) {
          setIsAccessRulesLoading(false);
        }
      }
    },
    [loadAccessRulesForLink, loadAlcRulesForLink, resourceType],
  );

  type InviteSendResult = {
    notified?: number;
    total?: number;
    failed?: number;
    error?: string;
  };

  const sendAllowlistInvites = useCallback(
    async (linkId: string): Promise<InviteSendResult> => {
      try {
        const res = await fetch("/api/links/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            linkId,
            resourceType:
              resourceType === "document" ? "document" : "data_room",
            resourceId,
          }),
        });
        const payload = (await res
          .json()
          .catch(() => null)) as InviteSendResult | null;
        if (!res.ok) {
          throw new Error(payload?.error || "Invite job failed");
        }
        return payload ?? {};
      } catch (error) {
        console.error("[links-manager] send invites failed", error);
        throw error;
      }
    },
    [resourceId, resourceType],
  );

  const loadWorkspaceGroups = useCallback(async () => {
    try {
      const groups = await fetchWorkspaceUserGroups(supabase, workspaceId);
      setUserGroups(groups);
    } catch (error) {
      console.error("[links-manager] failed to load workspace groups", error);
      setUserGroups([]);
    }
  }, [supabase, workspaceId]);

  const loadLinkPresets = useCallback(async () => {
    try {
      const presets = await fetchLinkPresetSummaries(supabase, workspaceId);
      setLinkPresets(presets);
    } catch (error) {
      console.error("[links-manager] failed to load link presets", error);
      setLinkPresets([]);
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    if (!showEditor || !canManageLinks) return;
    void Promise.all([loadWorkspaceGroups(), loadLinkPresets()]);
  }, [canManageLinks, loadLinkPresets, loadWorkspaceGroups, showEditor]);

  const loadLinks = useCallback(async () => {
    const cachedLinks = readPrefetchCache<LinkRow[]>(linksCacheKey);
    if (cachedLinks) {
      setLinks(cachedLinks);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const column =
        resourceType === "document" ? "document_id" : "data_room_id";
      const data = await runCachedPrefetch<LinkRow[]>(
        linksCacheKey,
        async () => {
          const { data: rows, error } = await supabase
            .from("links")
            .select("*")
            .eq(column, resourceId)
            .order("created_at", { ascending: false });
          if (error) throw error;
          return rows || [];
        },
        LINKS_MANAGER_CACHE_TTL_MS,
      );
      setLinks(data);
    } catch (error) {
      console.error("[links-manager] Failed to load links", error);
      showError("Unable to load links");
    } finally {
      setIsLoading(false);
    }
  }, [linksCacheKey, resourceId, resourceType, supabase]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    let active = true;
    const cachedBranding = readPrefetchCache<{
      watermarkDefinition: WatermarkDefinition | null;
      watermarkTemplates: WatermarkTemplateRow[];
    }>(brandingCacheKey);
    if (cachedBranding) {
      setWatermarkDefinition(cachedBranding.watermarkDefinition);
      setWatermarkTemplates(cachedBranding.watermarkTemplates);
    }

    const fetchBrandingAndWatermarks = async () => {
      try {
        const next = await runCachedPrefetch(
          brandingCacheKey,
          async () => {
            const [brandingRes, watermarksRes] = await Promise.all([
              supabase
                .from("branding")
                .select("*")
                .eq("workspace_id", workspaceId)
                .maybeSingle(),
              supabase
                .from("watermarks")
                .select("*")
                .eq("workspace_id", workspaceId),
            ]);
            if (brandingRes.error) {
              throw brandingRes.error;
            }
            if (watermarksRes.error) {
              throw watermarksRes.error;
            }
            const record = (brandingRes.data as BrandingRecord | null) ?? null;
            return {
              watermarkDefinition: resolveWatermarkDefinition(record),
              watermarkTemplates: (watermarksRes.data ??
                []) as WatermarkTemplateRow[],
            };
          },
          LINKS_MANAGER_CACHE_TTL_MS,
        );
        if (!active) return;
        setWatermarkDefinition(next.watermarkDefinition);
        setWatermarkTemplates(next.watermarkTemplates);
      } catch (error) {
        console.error("Failed to load custom watermarks", error);
        if (active) {
          setWatermarkDefinition(null);
          setWatermarkTemplates([]);
        }
      }
    };
    void fetchBrandingAndWatermarks();
    return () => {
      active = false;
    };
  }, [brandingCacheKey, supabase, workspaceId]);

  const watermarkTemplatesForPanel = useMemo(
    () =>
      watermarkTemplates
        .map((tpl) => {
          const materialized = materializeWatermark(tpl);
          if (!materialized) return null;
          return {
            id: tpl.id,
            name: tpl.name || "Untitled watermark",
            definition: {
              ...materialized.definition,
              pattern: materialized.pattern,
              rotationDeg: materialized.rotationDeg,
              xSpacing: materialized.xSpacing,
              ySpacing: materialized.ySpacing,
              mode: materialized.mode,
              imagePath: materialized.imageStoragePath ?? null,
              imageWidthPt: materialized.imageWidthPt ?? undefined,
              imageHeightPt: materialized.imageHeightPt ?? undefined,
            },
          } satisfies {
            id: string | null;
            name: string;
            definition: WatermarkDefinition;
          };
        })
        .filter(Boolean) as Array<{
        id: string | null;
        name: string;
        definition: WatermarkDefinition;
      }>,
    [watermarkTemplates],
  );
  const watermarkAvailable =
    watermarkTemplatesForPanel.length > 0 || Boolean(watermarkDefinition);

  const sanitizeLinkSettings = useCallback(
    (input: LinkSettings): LinkSettings => {
      const allowWatermark = watermarkAvailable;
      const firstTemplateId = watermarkTemplatesForPanel[0]?.id ?? null;
      const watermark = allowWatermark && input.watermark;
      const rawTemplateId =
        input.watermarkTemplateId ?? firstTemplateId ?? null;
      const watermarkTemplateId =
        rawTemplateId === "branding-fallback" ? null : rawTemplateId;
      const dynamicEmail =
        allowWatermark && watermark && !!input.dynamicWatermarkEmail;
      const dynamicIp =
        allowWatermark && watermark && !!input.dynamicWatermarkIp;
      const dynamicDateTime =
        allowWatermark && watermark && !!input.dynamicWatermarkDateTime;
      const collectEmails = !!input.collectEmailsForAnalytics;
      const blockedEmails = dedupeEmails(input.blockedEmails);
      const allowedEmails = dedupeEmails(input.allowedEmails).filter(
        (email) => !blockedEmails.includes(email),
      );
      const blockedGroupIds = dedupeStrings(input.blockedGroupIds);
      const allowedGroupIds = dedupeStrings(input.allowedGroupIds).filter(
        (groupId) => !blockedGroupIds.includes(groupId),
      );
      const commentsEnabled =
        resourceType === "document" ? Boolean(input.commentsEnabled) : false;
      const emailVerification = deriveEmailVerification(
        {
          collectEmailsForAnalytics: collectEmails,
          dynamicWatermarkEmail: dynamicEmail,
          allowedEmails,
          blockedEmails,
          allowedGroupIds,
          blockedGroupIds,
          ndaRequired: input.ndaRequired,
        },
        { resourceType, alcActive },
      );
      const hasInviteRecipients =
        allowedEmails.length > 0 ||
        allowedGroupIds.length > 0 ||
        (resourceType === "data_room" && alcActive);
      const customSlug = sanitizeShareSlugDraft(input.customSlug ?? "");
      return {
        ...input,
        customSlug,
        watermark,
        watermarkTemplateId,
        dynamicWatermarkEmail: dynamicEmail,
        dynamicWatermarkIp: dynamicIp,
        dynamicWatermarkDateTime: dynamicDateTime,
        collectEmailsForAnalytics: collectEmails,
        emailVerification,
        allowedEmails,
        blockedEmails,
        allowedGroupIds,
        blockedGroupIds,
        commentsEnabled,
        publicLanguageOverride: normalizePublicLanguageOverride(
          input.publicLanguageOverride,
        ),
        sendInviteEmails: hasInviteRecipients ? input.sendInviteEmails : false,
      };
    },
    [alcActive, resourceType, watermarkAvailable, watermarkTemplatesForPanel],
  );

  useEffect(() => {
    setSettings((prev) => sanitizeLinkSettings(prev));
  }, [sanitizeLinkSettings]);

  useEffect(() => {
    if (!showPanel) {
      setEditing(null);
    }
  }, [showPanel]);

  const handleSettingsChange = useCallback(
    (next: LinkSettings) => {
      setSettings(sanitizeLinkSettings(next));
    },
    [sanitizeLinkSettings],
  );

  const applyPresetToSettings = useCallback(
    (current: LinkSettings, preset: LinkPresetDetails): LinkSettings => {
      const source = (preset.settingsJson ?? {}) as Record<string, unknown>;
      const next: LinkSettings = {
        ...current,
        allowedEmails: preset.allowedEmails,
        blockedEmails: preset.blockedEmails,
        allowedGroupIds: preset.allowedGroupIds,
        blockedGroupIds: preset.blockedGroupIds,
      };

      if (typeof source.passwordEnabled === "boolean") {
        next.passwordEnabled = source.passwordEnabled;
        if (!next.passwordEnabled) {
          next.password = "";
        }
      }
      if (typeof source.emailNotifications === "boolean") {
        next.emailNotifications = source.emailNotifications;
      }
      if (typeof source.downloadEnabled === "boolean") {
        next.downloadEnabled = source.downloadEnabled;
      }
      if (typeof source.collectEmailsForAnalytics === "boolean") {
        next.collectEmailsForAnalytics = source.collectEmailsForAnalytics;
      }
      if (typeof source.screenshotProtection === "boolean") {
        next.screenshotProtection = source.screenshotProtection;
      }
      if (typeof source.watermark === "boolean") {
        next.watermark = source.watermark;
      }
      if (
        typeof source.watermarkTemplateId === "string" ||
        source.watermarkTemplateId === null
      ) {
        next.watermarkTemplateId = source.watermarkTemplateId;
      }
      if (typeof source.dynamicWatermarkEmail === "boolean") {
        next.dynamicWatermarkEmail = source.dynamicWatermarkEmail;
      }
      if (typeof source.dynamicWatermarkIp === "boolean") {
        next.dynamicWatermarkIp = source.dynamicWatermarkIp;
      }
      if (typeof source.dynamicWatermarkDateTime === "boolean") {
        next.dynamicWatermarkDateTime = source.dynamicWatermarkDateTime;
      }
      if (typeof source.showQnA === "boolean") {
        next.showQnA = source.showQnA;
      }
      if (typeof source.showFeedback === "boolean") {
        next.showFeedback = source.showFeedback;
      }
      if (typeof source.commentsEnabled === "boolean") {
        next.commentsEnabled = source.commentsEnabled;
      }
      if (
        source.publicLanguageOverride === null ||
        source.publicLanguageOverride === "en" ||
        source.publicLanguageOverride === "fr"
      ) {
        next.publicLanguageOverride = source.publicLanguageOverride;
      }
      if ("qaPairs" in source) {
        next.qaPairs = parsePresetQAPairs(source.qaPairs);
      }

      const isEditingExisting = Boolean(editing);
      if (!isEditingExisting && typeof source.ndaRequired === "boolean") {
        next.ndaRequired = source.ndaRequired;
      }
      if (!isEditingExisting) {
        if (
          typeof source.ndaTemplateId === "string" ||
          source.ndaTemplateId === null
        ) {
          next.ndaTemplateId = source.ndaTemplateId;
        }
      }

      return sanitizeLinkSettings(next);
    },
    [editing, sanitizeLinkSettings],
  );

  const buildPresetComparableFromPreset = useCallback(
    (preset: LinkPresetDetails): PresetComparable =>
      buildPresetComparable(
        {
          settingsJson: preset.settingsJson ?? {},
          allowedEmails: preset.allowedEmails,
          blockedEmails: preset.blockedEmails,
          allowedGroupIds: preset.allowedGroupIds,
          blockedGroupIds: preset.blockedGroupIds,
        },
        { includeNda: !editing },
      ),
    [editing],
  );

  const handleApplyPreset = useCallback(
    async (presetId: string) => {
      if (!canManageLinks) {
        showWarning("Viewer access: read-only.");
        return;
      }
      setIsPresetPending(true);
      try {
        const preset = await fetchLinkPresetDetails(supabase, presetId);
        if (!preset) {
          showError("Preset not found");
          return;
        }
        setSettings((prev) => applyPresetToSettings(prev, preset));
        setActivePresetId(preset.id);
        setActivePresetComparable(buildPresetComparableFromPreset(preset));
        showSuccess("Preset applied");
      } catch (error) {
        console.error("[links-manager] apply preset failed", error);
        showError("Unable to apply preset");
      } finally {
        setIsPresetPending(false);
      }
    },
    [
      applyPresetToSettings,
      buildPresetComparableFromPreset,
      canManageLinks,
      supabase,
    ],
  );

  const handleSavePreset = useCallback(
    async (presetName: string) => {
      if (!canManageLinks) {
        showWarning("Viewer access: read-only.");
        return;
      }
      const trimmedName = presetName.trim();
      if (!trimmedName) {
        showError("Preset name is required");
        return;
      }
      setIsPresetPending(true);
      try {
        const settingsJson: Record<string, unknown> = {
          passwordEnabled: settings.passwordEnabled,
          emailNotifications: settings.emailNotifications,
          downloadEnabled: settings.downloadEnabled,
          collectEmailsForAnalytics: settings.collectEmailsForAnalytics,
          screenshotProtection: settings.screenshotProtection,
          watermark: settings.watermark,
          watermarkTemplateId: settings.watermarkTemplateId ?? null,
          dynamicWatermarkEmail: Boolean(settings.dynamicWatermarkEmail),
          dynamicWatermarkIp: Boolean(settings.dynamicWatermarkIp),
          dynamicWatermarkDateTime: Boolean(settings.dynamicWatermarkDateTime),
          showQnA: settings.showQnA,
          showFeedback: settings.showFeedback,
          commentsEnabled:
            resourceType === "document" ? settings.commentsEnabled : false,
          publicLanguageOverride: settings.publicLanguageOverride,
          qaPairs: settings.qaPairs.filter(
            (qa) => qa.question.trim() && qa.answer.trim(),
          ),
        };
        if (!editing) {
          settingsJson.ndaRequired = settings.ndaRequired;
          settingsJson.ndaTemplateId = settings.ndaRequired
            ? (settings.ndaTemplateId ?? null)
            : null;
        }

        await saveLinkPreset(supabase, {
          workspaceId,
          name: trimmedName,
          settingsJson,
          allowedEmails: settings.allowedEmails,
          blockedEmails: settings.blockedEmails,
          allowedGroupIds: settings.allowedGroupIds,
          blockedGroupIds: settings.blockedGroupIds,
        });
        await loadLinkPresets();
        showSuccess("Preset saved");
      } catch (error) {
        console.error("[links-manager] save preset failed", error);
        showError("Unable to save preset");
        throw error;
      } finally {
        setIsPresetPending(false);
      }
    },
    [
      canManageLinks,
      editing,
      loadLinkPresets,
      resourceType,
      settings,
      supabase,
      workspaceId,
    ],
  );

  const buildPresetSettingsJsonFromCurrent = useCallback(() => {
    const settingsJson: Record<string, unknown> = {
      passwordEnabled: settings.passwordEnabled,
      emailNotifications: settings.emailNotifications,
      downloadEnabled: settings.downloadEnabled,
      collectEmailsForAnalytics: settings.collectEmailsForAnalytics,
      screenshotProtection: settings.screenshotProtection,
      watermark: settings.watermark,
      watermarkTemplateId: settings.watermarkTemplateId ?? null,
      dynamicWatermarkEmail: Boolean(settings.dynamicWatermarkEmail),
      dynamicWatermarkIp: Boolean(settings.dynamicWatermarkIp),
      dynamicWatermarkDateTime: Boolean(settings.dynamicWatermarkDateTime),
      showQnA: settings.showQnA,
      showFeedback: settings.showFeedback,
      commentsEnabled:
        resourceType === "document" ? settings.commentsEnabled : false,
      publicLanguageOverride: settings.publicLanguageOverride,
      qaPairs: settings.qaPairs.filter(
        (qa) => qa.question.trim() && qa.answer.trim(),
      ),
    };
    if (!editing) {
      settingsJson.ndaRequired = settings.ndaRequired;
      settingsJson.ndaTemplateId = settings.ndaRequired
        ? (settings.ndaTemplateId ?? null)
        : null;
    }
    return settingsJson;
  }, [editing, resourceType, settings]);

  const buildPresetComparableFromCurrent = useCallback(
    (): PresetComparable =>
      buildPresetComparable(
        {
          settingsJson: buildPresetSettingsJsonFromCurrent(),
          allowedEmails: settings.allowedEmails,
          blockedEmails: settings.blockedEmails,
          allowedGroupIds: settings.allowedGroupIds,
          blockedGroupIds: settings.blockedGroupIds,
        },
        { includeNda: !editing },
      ),
    [
      buildPresetSettingsJsonFromCurrent,
      editing,
      settings.allowedEmails,
      settings.allowedGroupIds,
      settings.blockedEmails,
      settings.blockedGroupIds,
    ],
  );

  const handleUpdatePreset = useCallback(
    async (presetId: string) => {
      if (!canManageLinks) {
        showWarning("Viewer access: read-only.");
        return;
      }
      setIsPresetPending(true);
      try {
        await updateLinkPreset(supabase, {
          presetId,
          workspaceId,
          settingsJson: buildPresetSettingsJsonFromCurrent(),
          allowedEmails: settings.allowedEmails,
          blockedEmails: settings.blockedEmails,
          allowedGroupIds: settings.allowedGroupIds,
          blockedGroupIds: settings.blockedGroupIds,
        });
        await loadLinkPresets();
        setActivePresetId(presetId);
        setActivePresetComparable(buildPresetComparableFromCurrent());
        showSuccess("Preset updated");
      } catch (error) {
        console.error("[links-manager] update preset failed", error);
        if (error instanceof LinkAccessRuleOverlapError) {
          showError(error.message);
          return;
        }
        showError("Unable to update preset");
        throw error;
      } finally {
        setIsPresetPending(false);
      }
    },
    [
      buildPresetComparableFromCurrent,
      buildPresetSettingsJsonFromCurrent,
      canManageLinks,
      loadLinkPresets,
      settings.allowedEmails,
      settings.allowedGroupIds,
      settings.blockedEmails,
      settings.blockedGroupIds,
      supabase,
      workspaceId,
    ],
  );

  const handleDeletePreset = useCallback(
    async (presetId: string) => {
      if (!canManageLinks) {
        showWarning("Viewer access: read-only.");
        return;
      }
      setIsPresetPending(true);
      try {
        await deleteLinkPreset(supabase, { presetId, workspaceId });
        await loadLinkPresets();
        if (activePresetId === presetId) {
          setActivePresetId(null);
          setActivePresetComparable(null);
        }
        showSuccess("Preset deleted");
      } catch (error) {
        console.error("[links-manager] delete preset failed", error);
        showError("Unable to delete preset");
        throw error;
      } finally {
        setIsPresetPending(false);
      }
    },
    [activePresetId, canManageLinks, loadLinkPresets, supabase, workspaceId],
  );

  const openCreatePanel = useCallback(async () => {
    if (!canManageLinks) {
      showWarning(
        "Viewer access: you can copy links but can’t create new ones.",
      );
      return;
    }

    if (resourceType === "document" && docState) {
      const status = docState.conversion_status;
      if (status && status !== "completed") {
        showWarning("File is not fully processed yet. Retrying processing...");
        try {
          const updated = await retryDocumentConversion({
            supabase,
            documentId: docState.id,
            workspaceId,
          });
          if (updated) {
            setDocState((prev) =>
              prev
                ? {
                    ...prev,
                    converted_storage_path:
                      updated.converted_storage_path ??
                      prev.converted_storage_path,
                    conversion_status:
                      updated.conversion_status ?? prev.conversion_status,
                  }
                : prev,
            );
          }
        } catch {
          // ignore retry errors; user can still continue
        }
      }
    }

    setEditing(null);
    setActivePresetId(null);
    setActivePresetComparable(null);
    setAlcBlocklistOverlapEmails([]);
    setIsAccessRulesLoading(false);
    setAccessRulesLoadFailed(false);
    setSettings(
      sanitizeLinkSettings({
        ...defaultSettings,
        name: defaultLinkName,
      }),
    );
    handleAlcRulesChange(defaultAlcRules);
    setShowPanel(true);
  }, [
    canManageLinks,
    defaultLinkName,
    docState,
    handleAlcRulesChange,
    resourceType,
    sanitizeLinkSettings,
    supabase,
    workspaceId,
  ]);

  const closeEditor = useCallback(() => {
    setShowPanel(false);
    setEditing(null);
    setAlcBlocklistOverlapEmails([]);
    setIsAccessRulesLoading(false);
    setAccessRulesLoadFailed(false);
    if (isCreateRoute) {
      router.push(basePath);
    }
  }, [basePath, isCreateRoute, router]);

  useEffect(() => {
    if (!isCreateRoute) {
      createInitRef.current = false;
      return;
    }
    if (isCheckingCanManageLinks) {
      return;
    }
    if (!canManageLinks) {
      showWarning(
        "Viewer access: you can copy links but can’t create new ones.",
      );
      router.push(basePath);
      return;
    }
    if (createInitRef.current) return;
    createInitRef.current = true;
    void openCreatePanel();
  }, [
    basePath,
    canManageLinks,
    isCheckingCanManageLinks,
    isCreateRoute,
    openCreatePanel,
    router,
  ]);

  const openEditPanel = (link: LinkRow) => {
    if (!canManageLinks) {
      showWarning("Viewer access: read-only.");
      return;
    }
    setEditing(link);
    setActivePresetId(null);
    setActivePresetComparable(null);
    setAlcBlocklistOverlapEmails([]);
    setSettings(
      sanitizeLinkSettings({
        name: link.name || "Untitled link",
        customSlug: (link as { custom_slug?: string | null }).custom_slug ?? "",
        passwordEnabled: Boolean(link.password_hash),
        password: "",
        emailNotifications: Boolean(link.email_notify),
        expiration: link.expires_at || "",
        downloadEnabled: Boolean(link.can_download),
        emailVerification: Boolean(link.email_verification),
        collectEmailsForAnalytics: Boolean(link.collect_email_for_analytics),
        screenshotProtection: Boolean(link.screenshot_protection),
        watermark: Boolean(link.apply_watermark),
        watermarkTemplateId:
          (link as { watermark_id?: string | null }).watermark_id ?? null,
        ndaRequired: Boolean(link.nda_gate),
        ndaTemplateId: link.nda_template_id ?? null,
        dynamicWatermarkEmail:
          (link as { dynamic_watermark_email?: boolean })
            .dynamic_watermark_email ??
          Boolean(link.dynamic_watermark_variables),
        dynamicWatermarkIp:
          (link as { dynamic_watermark_ip?: boolean }).dynamic_watermark_ip ??
          Boolean(link.dynamic_watermark_variables),
        dynamicWatermarkDateTime:
          (link as { dynamic_watermark_datetime?: boolean })
            .dynamic_watermark_datetime ?? false,
        showQnA: Boolean(link.show_qas),
        showFeedback: Boolean(link.show_feedback),
        commentsEnabled: Boolean(link.comments_enabled),
        publicLanguageOverride: normalizePublicLanguageOverride(
          (link as { public_language_override?: string | null })
            .public_language_override,
        ),
        qaPairs: Array.isArray(link.curated_qas)
          ? (
              link.curated_qas as Array<{
                question?: unknown;
                answer?: unknown;
              }>
            ).map((qa) => ({
              question: typeof qa.question === "string" ? qa.question : "",
              answer: typeof qa.answer === "string" ? qa.answer : "",
            }))
          : [],
        allowedEmails: [],
        blockedEmails: [],
        allowedGroupIds: [],
        blockedGroupIds: [],
        sendInviteEmails: false,
      }),
    );
    handleAlcRulesChange(defaultAlcRules);
    setShowPanel(true);
    // Sync the ref immediately so the async load's stale-guards compare
    // against this link even before the state effect runs.
    editingIdRef.current = link.id;
    void loadRulesForEditing(link.id);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!canManageLinks) {
      showWarning("Viewer access: read-only.");
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    try {
      // supabase-js does not throw on PostgREST/RLS failures; surface them.
      const { error } = await supabase
        .from("links")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      setLinks((prev) => {
        const next = prev.filter((link) => link.id !== deleteTarget.id);
        writePrefetchCache(linksCacheKey, next, LINKS_MANAGER_CACHE_TTL_MS);
        return next;
      });
      trackProductEvent("link_deleted", {
        link_id: deleteTarget.id,
        workspace_id: deleteTarget.workspace_id,
        document_id: deleteTarget.document_id ?? undefined,
        data_room_id: deleteTarget.data_room_id ?? undefined,
      });
      showSuccess("Link deleted");
    } catch (error) {
      console.error("Failed to delete link", error);
      showError("Unable to delete link");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const resolveWorkspaceSlugForSharePath = useCallback(async () => {
    if (workspaceSlug) return workspaceSlug;
    try {
      const { data: workspaceRow, error } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", workspaceId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      const workspaceName =
        (workspaceRow as { name?: string | null } | null)?.name ?? "";
      const resolvedWorkspaceSlug = createWorkspaceSlug(workspaceName);
      if (!resolvedWorkspaceSlug) return null;
      setWorkspaceSlug((existing) => existing ?? resolvedWorkspaceSlug);
      return resolvedWorkspaceSlug;
    } catch {
      return null;
    }
  }, [supabase, workspaceId, workspaceSlug]);

  const buildLegacySharePath = (linkId: string): string =>
    resourceType === "document"
      ? `/d/${resourceId}/${linkId}`
      : `/r/${resourceId}/${linkId}`;

  const buildShortSharePath = (
    link: LinkRow,
    options?: { workspaceSlug?: string | null },
  ): string => {
    const resolvedWorkspaceSlug = options?.workspaceSlug ?? workspaceSlug;
    if (!resolvedWorkspaceSlug) {
      return buildLegacySharePath(link.id);
    }
    const linkSlug = resolveCustomLinkSlug(link);
    if (!linkSlug) {
      return buildLegacySharePath(link.id);
    }
    return `/${resolvedWorkspaceSlug}/${linkSlug}`;
  };

  const buildShareLink = (
    link: LinkRow,
    options?: { workspaceSlug?: string | null },
  ) => {
    const current = typeof window !== "undefined" ? window.location : null;
    const path = buildShortSharePath(link, options);
    if (!current) return path;

    const isLocal =
      current.hostname === "localhost" || current.hostname === "127.0.0.1";
    if (customDomainsEnabled && activeCustomDomain && !isLocal) {
      return `${current.protocol}//${activeCustomDomain}${path}`;
    }
    return `${current.protocol}//${current.host}${path}`;
  };

  const shareLinkFor = (
    link: LinkRow,
    options?: { workspaceSlug?: string | null },
  ) => buildShareLink(link, options);

  const copyShareLink = async (link: LinkRow) => {
    try {
      const resolvedWorkspaceSlug = await resolveWorkspaceSlugForSharePath();
      await navigator.clipboard.writeText(
        shareLinkFor(link, { workspaceSlug: resolvedWorkspaceSlug }),
      );
      showSuccess("Link copied to clipboard");
    } catch {
      showWarning("Unable to copy link");
    }
  };

  const handleSave = async () => {
    if (!canManageLinks) {
      showWarning(
        "Viewer access: you can copy links but can’t create or edit them.",
      );
      return;
    }
    const trimmedName = settings.name.trim();
    if (!trimmedName) {
      showError("Link name is required");
      return;
    }
    if (editing && isAccessRulesLoading) {
      showWarning("Access rules are still loading — try again in a moment.");
      return;
    }
    if (editing && accessRulesLoadFailed) {
      showError(
        "Unable to load this link's access rules. Retry loading before saving.",
      );
      return;
    }
    if (resourceType === "data_room" && alcActive) {
      const alcPreparation = prepareAlcRulesApply(alcRules);
      if (alcPreparation.status === "review") {
        setAlcConflictReviewRequest((value) => value + 1);
        showError("Review overlapping ALC access before saving this link");
        return;
      }
    }
    if (
      resourceType === "data_room" &&
      alcActive &&
      alcBlocklistOverlapEmails.length > 0
    ) {
      showError("Resolve overlapping rules before saving this link");
      return;
    }
    setIsSaving(true);
    try {
      if (resourceType === "data_room" && alcActive) {
        const blockedGroupIds = dedupeStrings(settings.blockedGroupIds ?? []);
        const blockedEmailSet = new Set(dedupeEmails(settings.blockedEmails));
        const alcEmails = dedupeEmails([
          ...(alcRules.room.allowedEmails ?? []),
          ...(alcRules.folders ?? []).flatMap((r) => r.allowedEmails ?? []),
          ...(alcRules.documents ?? []).flatMap((r) => r.allowedEmails ?? []),
        ]);
        const alcGroupIds = dedupeStrings([
          ...(alcRules.room.allowedGroupIds ?? []),
          ...(alcRules.folders ?? []).flatMap((r) => r.allowedGroupIds ?? []),
          ...(alcRules.documents ?? []).flatMap((r) => r.allowedGroupIds ?? []),
        ]);

        if (
          (blockedGroupIds.length > 0 || blockedEmailSet.size > 0) &&
          (alcGroupIds.length > 0 || alcEmails.length > 0) &&
          workspaceId
        ) {
          const allGroupIds = Array.from(
            new Set([...blockedGroupIds, ...alcGroupIds]),
          );
          const alcEmailSet = new Set<string>(alcEmails);

          if (allGroupIds.length > 0) {
            const { data, error } = await supabase
              .from("workspace_user_group_emails")
              .select("group_id, email")
              .eq("workspace_id", workspaceId)
              .in("group_id", allGroupIds);

            if (error) throw error;

            for (const row of (data ?? []) as Array<{
              group_id?: string | null;
              email?: string | null;
            }>) {
              const groupId = row.group_id ?? "";
              const email = normalizeEmail(row.email ?? "");
              if (!groupId || !email) continue;
              if (blockedGroupIds.includes(groupId)) blockedEmailSet.add(email);
              if (alcGroupIds.includes(groupId)) alcEmailSet.add(email);
            }
          }

          const overlap = Array.from(alcEmailSet).filter((email) =>
            blockedEmailSet.has(email),
          );
          overlap.sort((a, b) => a.localeCompare(b));
          if (overlap.length > 0) {
            setAlcBlocklistOverlapEmails(overlap.slice(0, 25));
            showError("Resolve overlapping rules before saving this link");
            return;
          }
        }
      }

      const allowWatermark = watermarkAvailable;
      const effectiveWatermark = allowWatermark && settings.watermark;
      const effectiveDynamicEmail =
        effectiveWatermark && !!settings.dynamicWatermarkEmail;
      const effectiveDynamicIp =
        effectiveWatermark && !!settings.dynamicWatermarkIp;
      const effectiveDynamicDateTime =
        effectiveWatermark && !!settings.dynamicWatermarkDateTime;
      const effectiveDynamicAny =
        effectiveDynamicEmail || effectiveDynamicIp || effectiveDynamicDateTime;
      if (editing) {
        const trimmedPassword = settings.password.trim();
        const passwordWasSet = Boolean(editing.password_hash);
        let passwordPayload: string | null | undefined = undefined;
        if (!settings.passwordEnabled) {
          passwordPayload = passwordWasSet ? null : undefined;
        } else if (!passwordWasSet) {
          if (!trimmedPassword) {
            showError(
              "Password is required when password protection is enabled",
            );
            return;
          }
          passwordPayload = trimmedPassword;
        } else {
          passwordPayload = trimmedPassword ? trimmedPassword : undefined;
        }
        const updated = await updateLink(editing.id, {
          password: passwordPayload,
          email_notify: Boolean(settings.emailNotifications),
          expires_at: settings.expiration || null,
          can_download: Boolean(settings.downloadEnabled),
          email_verification: Boolean(settings.emailVerification),
          collect_email_for_analytics: Boolean(
            settings.collectEmailsForAnalytics,
          ),
          screenshot_protection: Boolean(settings.screenshotProtection),
          apply_watermark: effectiveWatermark,
          watermark_id: effectiveWatermark
            ? (settings.watermarkTemplateId ?? null)
            : null,
          dynamic_watermark_variables: effectiveDynamicAny,
          dynamic_watermark_email: effectiveDynamicEmail,
          dynamic_watermark_ip: effectiveDynamicIp,
          dynamic_watermark_datetime: effectiveDynamicDateTime,
          nda_gate: Boolean(settings.ndaRequired),
          show_qas: Boolean(settings.showQnA),
          curated_qas: settings.qaPairs.filter(
            (qa) => qa.question.trim() && qa.answer.trim(),
          ),
          show_feedback: Boolean(settings.showFeedback),
          comments_enabled:
            resourceType === "document"
              ? Boolean(settings.commentsEnabled)
              : false,
          public_language_override: settings.publicLanguageOverride,
          name: trimmedName,
          custom_slug: settings.customSlug ? settings.customSlug : null,
        });
        await replaceLinkAccessRules(supabase, {
          linkId: updated.id,
          workspaceId,
          allowedEmails: settings.allowedEmails,
          blockedEmails: settings.blockedEmails,
          allowedGroupIds: settings.allowedGroupIds,
          blockedGroupIds: settings.blockedGroupIds,
        });
        if (resourceType === "data_room") {
          await replaceLinkAlcRules(supabase, {
            linkId: updated.id,
            workspaceId,
            rules: alcRules,
          });
        }
        setLinks((prev) => {
          const next = prev.map((link) =>
            link.id === updated.id ? (updated as LinkRow) : link,
          );
          writePrefetchCache(linksCacheKey, next, LINKS_MANAGER_CACHE_TTL_MS);
          return next;
        });
        showSuccess("Link updated");
      } else {
        const trimmedPassword = settings.password.trim();
        if (settings.passwordEnabled && !trimmedPassword) {
          showError("Password is required when password protection is enabled");
          return;
        }
        if (settings.ndaRequired && !settings.ndaTemplateId) {
          showError("Please select an NDA template");
          setIsSaving(false);
          return;
        }

        if (resourceType === "document" && !resourceId) {
          showError("Links can be created for documents only");
          return;
        }

        const created = await createLink(workspaceId, {
          ...(resourceType === "document"
            ? { document_id: resourceId }
            : { data_room_id: resourceId }),
          password: settings.passwordEnabled ? trimmedPassword : null,
          email_notify: Boolean(settings.emailNotifications),
          expires_at: settings.expiration || null,
          can_download: Boolean(settings.downloadEnabled),
          email_verification: Boolean(settings.emailVerification),
          collect_email_for_analytics: Boolean(
            settings.collectEmailsForAnalytics,
          ),
          screenshot_protection: Boolean(settings.screenshotProtection),
          apply_watermark: effectiveWatermark,
          watermark_id: effectiveWatermark
            ? (settings.watermarkTemplateId ?? null)
            : null,
          dynamic_watermark_variables: effectiveDynamicAny,
          dynamic_watermark_email: effectiveDynamicEmail,
          dynamic_watermark_ip: effectiveDynamicIp,
          dynamic_watermark_datetime: effectiveDynamicDateTime,
          nda_gate: Boolean(settings.ndaRequired),
          nda_template_id: settings.ndaRequired ? settings.ndaTemplateId : null,
          show_qas: Boolean(settings.showQnA),
          curated_qas: settings.qaPairs.filter(
            (qa) => qa.question.trim() && qa.answer.trim(),
          ),
          show_feedback: Boolean(settings.showFeedback),
          comments_enabled:
            resourceType === "document"
              ? Boolean(settings.commentsEnabled)
              : false,
          public_language_override: settings.publicLanguageOverride,
          name: trimmedName,
          custom_slug: settings.customSlug ? settings.customSlug : null,
        });
        await replaceLinkAccessRules(supabase, {
          linkId: created.id,
          workspaceId,
          allowedEmails: settings.allowedEmails,
          blockedEmails: settings.blockedEmails,
          allowedGroupIds: settings.allowedGroupIds,
          blockedGroupIds: settings.blockedGroupIds,
        });
        if (resourceType === "data_room") {
          await replaceLinkAlcRules(supabase, {
            linkId: created.id,
            workspaceId,
            rules: alcRules,
          });
        }
        if (
          settings.sendInviteEmails &&
          ((resourceType === "data_room" && alcActive) ||
            settings.allowedEmails.length > 0 ||
            settings.allowedGroupIds.length > 0)
        ) {
          // The link is already persisted at this point; a failed invite send
          // must not surface as a failed save (or invite duplicate links).
          try {
            const result = await sendAllowlistInvites(created.id);
            if ((result.failed ?? 0) > 0) {
              showWarning(
                `Sent ${result.notified ?? 0} of ${
                  result.total ?? result.notified ?? 0
                } invite emails`,
              );
            } else {
              showSuccess("Invite emails sent");
            }
          } catch {
            showWarning(
              "Link created, but invite emails failed to send — use Resend invites from the link editor",
            );
          }
        }
        setLinks((prev) => {
          const next = [created as LinkRow, ...prev];
          writePrefetchCache(linksCacheKey, next, LINKS_MANAGER_CACHE_TTL_MS);
          return next;
        });
        markRecentlyAddedLink([(created as LinkRow).id]);
        let copiedToClipboard = false;
        try {
          if (
            typeof navigator !== "undefined" &&
            navigator.clipboard &&
            typeof navigator.clipboard.writeText === "function"
          ) {
            const resolvedWorkspaceSlug =
              await resolveWorkspaceSlugForSharePath();
            await navigator.clipboard.writeText(
              shareLinkFor(created as LinkRow, {
                workspaceSlug: resolvedWorkspaceSlug,
              }),
            );
            copiedToClipboard = true;
          }
        } catch {
          copiedToClipboard = false;
        }
        if (copiedToClipboard) {
          showSuccess("Link created and copied");
        } else {
          showSuccess("Link created");
          showWarning("Link could not be copied to clipboard");
        }
      }
      closeEditor();
    } catch (error) {
      console.error("Failed to save link", error);
      if (error instanceof LinkAccessRuleOverlapError) {
        showError(error.message);
        return;
      }
      if (
        error instanceof Error &&
        (error.message === "Custom URL is already in use" ||
          error.message === "Custom URL is invalid")
      ) {
        showError(error.message);
        return;
      }
      showError("Unable to save link");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResendInvites = async () => {
    if (!editing) return;
    if (
      !(resourceType === "data_room" && alcActive) &&
      settings.allowedEmails.length === 0 &&
      settings.allowedGroupIds.length === 0
    )
      return;
    if (resendCooldownSec > 0) return;
    setIsResendingInvites(true);
    const nextCooldown = Math.min(
      RESEND_INVITES_BASE_COOLDOWN_SEC * 2 ** resendAttemptCount,
      RESEND_INVITES_MAX_COOLDOWN_SEC,
    );
    setResendAttemptCount((count) => count + 1);
    setResendCooldownSec(nextCooldown);
    try {
      const result = await sendAllowlistInvites(editing.id);
      if ((result.failed ?? 0) > 0) {
        showWarning(
          `Sent ${result.notified ?? 0} of ${
            result.total ?? result.notified ?? 0
          } invite emails`,
        );
      } else {
        showSuccess("Invite emails sent");
      }
    } catch {
      showError("Failed to send invite emails");
    } finally {
      setIsResendingInvites(false);
    }
  };

  const motionProps = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
      };

  return (
    <>
      <motion.div
        key="list"
        layout={!reduceMotion}
        transition={{ duration: reduceMotion ? 0.01 : 0.2 }}
        {...motionProps}
      >
        <Card
          data-guide={dataGuideCard ?? "links-existing-card"}
          className="relative overflow-hidden border-border/70 bg-card/50"
        >
          <div
            className="absolute inset-x-0 top-0 h-px bg-primary/55"
            aria-hidden="true"
          />
          <CardHeader className="flex flex-col gap-3 border-b border-border/60 px-6 pt-6 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <LinkIcon className="h-4 w-4" aria-hidden />
                Existing Links
              </CardTitle>
              <CardDescription>
                Monitor access rules and keep share links up to date.
              </CardDescription>
            </div>
            {canManageLinks ? (
              <Button
                size="sm"
                onClick={() => router.push(createPath)}
                data-guide={dataGuideNewButton ?? "links-new-link-button"}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                New Link
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {isLoading ? (
              <div className="space-y-2 px-6 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : links.length === 0 ? (
              <EmptyState
                variant="bare"
                className="px-6 py-10"
                icon={
                  <LinkIcon
                    className="h-6 w-6 text-muted-foreground"
                    aria-hidden
                  />
                }
                title="No links yet"
                description={`Create your first share link to start sending ${resourceName}.`}
                actions={
                  canManageLinks ? (
                    <Button size="sm" onClick={() => router.push(createPath)}>
                      <Plus className="mr-2 h-4 w-4" aria-hidden />
                      Create first link
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div
                role="list"
                className="flex flex-col divide-y divide-border/60"
                data-guide={dataGuideList ?? "links-manager-list"}
              >
                {/* Deleting a link mutates this list in place rather than
                    refetching, so the removed row can fade out instead of
                    blinking away. `initial={false}` keeps the existing links
                    static on first paint. */}
                <AnimatePresence initial={false}>
                  {links.map((link) => {
                    const shareUrl = shareLinkFor(link);
                    const badges = describeLinkFeatures(link, resourceType);
                    const createdAtLabel = `Created ${new Date(link.created_at).toLocaleDateString()}`;
                    return (
                      <motion.div
                        key={link.id}
                        role="listitem"
                        {...exitFade}
                        className={cn(
                          "px-6 py-4 transition-colors hover:bg-primary/[0.02]",
                          isRecentlyAddedLink(link.id) && "dk-row-flash",
                        )}
                      >
                        <LinkListItem
                          linkId={link.id}
                          title={link.name || "Untitled link"}
                          createdAtLabel={createdAtLabel}
                          shareUrl={shareUrl}
                          badges={badges}
                          onCopy={() => copyShareLink(link)}
                          copyButtonAriaLabel="Copy link"
                          actions={
                            <>
                              {canManageLinks ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditPanel(link)}
                                  >
                                    <PencilSimple
                                      className="mr-1.5 h-4 w-4"
                                      aria-hidden
                                    />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setDeleteTarget(link)}
                                    aria-label={`Delete link ${link.name || "Untitled link"}`}
                                  >
                                    <Trash className="h-4 w-4" aria-hidden />
                                  </Button>
                                </>
                              ) : null}
                            </>
                          }
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Sheet
        open={showEditor}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col border-l border-border/70 bg-[var(--dk-surface-overlay)] p-0 sm:max-w-lg md:max-w-240"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Link editor</SheetTitle>
          </SheetHeader>
          <LinkSettingsInline
            title={editing ? "Edit link" : "Create link"}
            onBack={closeEditor}
            onSave={handleSave}
            isSaving={isSaving}
            saveDisabled={
              (resourceType === "data_room" &&
                alcActive &&
                alcBlocklistOverlapEmails.length > 0) ||
              (Boolean(editing) &&
                (isAccessRulesLoading || accessRulesLoadFailed))
            }
            accessRulesLoading={Boolean(editing) && isAccessRulesLoading}
            accessRulesError={Boolean(editing) && accessRulesLoadFailed}
            onRetryAccessRules={
              editing ? () => void loadRulesForEditing(editing.id) : undefined
            }
            resourceType={resourceType}
            resourceId={resourceId}
            alcRules={alcRules}
            onAlcRulesChange={handleAlcRulesChange}
            alcActive={alcActive}
            alcConflictReviewRequest={alcConflictReviewRequest}
            onAlcBlocklistOverlapChange={setAlcBlocklistOverlapEmails}
            document={{
              name: resourceName,
              shareUrl: editing ? shareLinkFor(editing) : "",
            }}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            isEditing={Boolean(editing)}
            passwordSet={Boolean(editing?.password_hash)}
            onClose={closeEditor}
            watermarkDefinition={watermarkDefinition}
            watermarkTemplates={watermarkTemplatesForPanel}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            workspaceDefaultPublicLanguage={workspaceDefaultPublicLanguage}
            onResendInvites={editing ? handleResendInvites : undefined}
            resendInvitesPending={isResendingInvites}
            resendInvitesCooldownSec={resendCooldownSec}
            userGroups={userGroups}
            linkPresets={linkPresets.map((preset) => ({
              id: preset.id,
              name: preset.name,
              settingsJson: preset.settingsJson,
            }))}
            onApplyPreset={handleApplyPreset}
            onSavePreset={handleSavePreset}
            onUpdatePreset={handleUpdatePreset}
            onDeletePreset={handleDeletePreset}
            presetPending={isPresetPending}
            activePresetId={activePresetId}
            activePresetComparable={activePresetComparable}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete link?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <span>
                  This will permanently delete link{" "}
                  <strong>{deleteTarget.name}</strong>.
                </span>
              ) : (
                "This action cannot be undone"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting && (
                <CircleNotch
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden
                />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default LinksManagerCard;
