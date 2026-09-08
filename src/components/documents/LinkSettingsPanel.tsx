"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowClockwise,
  CircleNotch,
  DotsThree,
  DownloadSimple,
  Envelope,
  Info,
  PaperPlaneTilt,
  Plus,
  Shield,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { WatermarkDefinition } from "@/lib/branding";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/datetimeLocal";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import type { Tables } from "@/types/generated/supabase";
import { z } from "zod";
import { normalizeEmail } from "@/lib/email";
import type { LinkAlcRules } from "@/lib/linkAlcClient";
import LinkAlcRulesDialog from "@/components/links/LinkAlcRulesDialog";
import {
  buildPresetComparable,
  presetComparablesEqual,
  type PresetComparable,
} from "@/components/links/linkPresetComparable";
import { deriveEmailVerification } from "@/components/links/linkSettingsRules";
import { Skeleton } from "@/components/ui/skeleton";
import {
  normalizeShareSlug,
  sanitizeShareSlugDraft,
} from "@/lib/publicLinkPaths";
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
  getPublicLanguageLabel,
  PUBLIC_LANGUAGE_VALUES,
  type PublicLanguage,
} from "@/modules/public-links/types";
import { consumeAlcReviewRequest } from "@/modules/public-links";

export interface QAPair {
  question: string;
  answer: string;
}

export interface LinkSettings {
  name: string;
  customSlug: string;
  passwordEnabled: boolean;
  password: string;
  emailNotifications: boolean;
  expiration: string;
  downloadEnabled: boolean;
  emailVerification: boolean;
  collectEmailsForAnalytics: boolean;
  screenshotProtection: boolean;
  watermark: boolean;
  watermarkTemplateId?: string | null;
  ndaRequired: boolean;
  ndaTemplateId?: string | null;
  dynamicWatermarkEmail?: boolean;
  dynamicWatermarkIp?: boolean;
  dynamicWatermarkDateTime?: boolean;
  showQnA: boolean;
  showFeedback: boolean;
  commentsEnabled: boolean;
  qaPairs: QAPair[];
  allowedEmails: string[];
  blockedEmails: string[];
  allowedGroupIds: string[];
  blockedGroupIds: string[];
  sendInviteEmails: boolean;
  publicLanguageOverride: PublicLanguage | null;
}

type NdaTemplateOption = Pick<Tables<"nda_templates">, "id" | "name">;

type UserGroupOption = {
  id: string;
  name: string;
  emailCount: number;
};

type LinkPresetOption = {
  id: string;
  name: string;
  settingsJson?: Record<string, unknown>;
};

export interface LinkSettingsPanelProps {
  resourceType: "document" | "data_room";
  resourceId: string;
  alcRules: LinkAlcRules;
  onAlcRulesChange: (rules: LinkAlcRules) => void;
  alcActive: boolean;
  alcConflictReviewRequest?: number;
  onAlcBlocklistOverlapChange?: (emails: string[]) => void;
  document: { name: string; shareUrl: string };
  settings: LinkSettings;
  onSettingsChange: (settings: LinkSettings) => void;
  isEditing?: boolean;
  passwordSet?: boolean;
  onClose: () => void;
  className?: string;
  /** True while the persisted access/ALC rules for the edited link load. */
  accessRulesLoading?: boolean;
  /** True when loading the persisted access/ALC rules failed. */
  accessRulesError?: boolean;
  onRetryAccessRules?: () => void;
  watermarkDefinition?: WatermarkDefinition | null;
  watermarkTemplates?: Array<{
    id: string | null;
    name: string;
    definition: WatermarkDefinition;
  }> | null;
  /** Required when NDA gating is enabled; used to fetch available templates */
  workspaceId?: string | null;
  workspaceSlug?: string | null;
  onResendInvites?: (() => Promise<void>) | (() => void) | null;
  resendInvitesPending?: boolean;
  resendInvitesCooldownSec?: number;
  userGroups?: UserGroupOption[];
  linkPresets?: LinkPresetOption[];
  onApplyPreset?: (presetId: string) => Promise<void> | void;
  onSavePreset?: (presetName: string) => Promise<void> | void;
  onUpdatePreset?: (presetId: string) => Promise<void> | void;
  onDeletePreset?: (presetId: string) => Promise<void> | void;
  presetPending?: boolean;
  activePresetId?: string | null;
  activePresetComparable?: PresetComparable | null;
  workspaceDefaultPublicLanguage?: PublicLanguage;
}

const LinkSettingsPanel: React.FC<LinkSettingsPanelProps> = ({
  resourceType,
  resourceId,
  alcRules,
  onAlcRulesChange,
  alcActive,
  alcConflictReviewRequest = 0,
  onAlcBlocklistOverlapChange,
  document,
  settings,
  onSettingsChange,
  isEditing,
  passwordSet,
  className,
  watermarkDefinition,
  watermarkTemplates = [],
  workspaceId,
  workspaceSlug,
  onResendInvites,
  resendInvitesPending = false,
  resendInvitesCooldownSec = 0,
  userGroups = [],
  linkPresets = [],
  onApplyPreset,
  onSavePreset,
  onUpdatePreset,
  onDeletePreset,
  presetPending = false,
  activePresetId = null,
  activePresetComparable = null,
  workspaceDefaultPublicLanguage = "en",
  accessRulesLoading = false,
  accessRulesError = false,
  onRetryAccessRules,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const emailSchema = useMemo(() => z.string().email(), []);
  const [newAllowlistEmail, setNewAllowlistEmail] = useState("");
  const [allowlistError, setAllowlistError] = useState<string | null>(null);
  const [newBlocklistEmail, setNewBlocklistEmail] = useState("");
  const [blocklistError, setBlocklistError] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [presetName, setPresetName] = useState("");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);
  const [groupOverlapEmails, setGroupOverlapEmails] = useState<string[]>([]);
  const [allowlistBlocklistOverlapEmails, setAllowlistBlocklistOverlapEmails] =
    useState<string[]>([]);
  const [alcBlocklistOverlapEmails, setAlcBlocklistOverlapEmails] = useState<
    string[]
  >([]);
  const groupOverlapRef = React.useRef<HTMLDivElement>(null);
  const editingExisting = Boolean(isEditing);
  const [alcDialogOpen, setAlcDialogOpen] = useState(false);
  const [removeAlcDialogOpen, setRemoveAlcDialogOpen] = useState(false);
  const alcReviewRequestCursorRef = React.useRef(alcConflictReviewRequest);

  useEffect(() => {
    const consumption = consumeAlcReviewRequest(
      alcReviewRequestCursorRef.current,
      alcConflictReviewRequest,
    );
    alcReviewRequestCursorRef.current = consumption.cursor;
    if (!consumption.shouldOpen) return;
    setAlcDialogOpen(true);
  }, [alcConflictReviewRequest]);
  const ndaLocked = Boolean(editingExisting && settings.ndaRequired);
  const showNdaToggle = !editingExisting || settings.ndaRequired;
  const watermarkOptions = useMemo(() => {
    const options =
      watermarkTemplates?.map((tpl) => ({
        id: tpl.id,
        name: tpl.name || "Untitled watermark",
      })) ?? [];
    if (watermarkDefinition) {
      options.push({
        id: "branding-fallback",
        name: "Branding watermark",
      });
    }
    return options;
  }, [watermarkDefinition, watermarkTemplates]);
  const watermarkFeatureEnabled = watermarkOptions.length > 0;
  const passwordEnabled = Boolean(settings.passwordEnabled);
  const resendCooldownActive = resendInvitesCooldownSec > 0;

  // NDA templates state
  const [ndaTemplates, setNdaTemplates] = useState<NdaTemplateOption[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedNdaTemplateName, setSelectedNdaTemplateName] = useState<
    string | null
  >(null);
  const [isSelectedTemplateLoading, setIsSelectedTemplateLoading] =
    useState(false);

  // Load NDA templates when NDA is enabled
  const loadNdaTemplates = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoadingTemplates(true);
    try {
      const { data, error } = await supabase
        .from("nda_templates")
        .select("id, name")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .order("name");

      if (error) throw error;
      setNdaTemplates(data || []);
    } catch (err) {
      console.error("[LinkSettings] Failed to load NDA templates", err);
      setNdaTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    if (settings.ndaRequired && workspaceId) {
      loadNdaTemplates();
    }
  }, [settings.ndaRequired, workspaceId, loadNdaTemplates]);

  useEffect(() => {
    if (
      !editingExisting ||
      !settings.ndaRequired ||
      !settings.ndaTemplateId ||
      !workspaceId
    ) {
      setSelectedNdaTemplateName(null);
      return;
    }

    let active = true;
    const loadSelectedTemplate = async () => {
      setIsSelectedTemplateLoading(true);
      try {
        const { data, error } = await supabase
          .from("nda_templates")
          .select("id, name")
          .eq("workspace_id", workspaceId)
          .eq("id", settings.ndaTemplateId ?? "")
          .maybeSingle();
        if (!active) return;
        if (error || !data) {
          setSelectedNdaTemplateName(null);
          return;
        }
        setSelectedNdaTemplateName(data.name ?? null);
      } catch (err) {
        if (active) {
          console.error(
            "[LinkSettings] Failed to load selected NDA template",
            err,
          );
          setSelectedNdaTemplateName(null);
        }
      } finally {
        if (active) {
          setIsSelectedTemplateLoading(false);
        }
      }
    };

    void loadSelectedTemplate();
    return () => {
      active = false;
    };
  }, [
    editingExisting,
    settings.ndaRequired,
    settings.ndaTemplateId,
    workspaceId,
    supabase,
  ]);
  useEffect(() => {
    if (
      selectedPresetId &&
      !linkPresets.some((p) => p.id === selectedPresetId)
    ) {
      setSelectedPresetId("");
    }
  }, [linkPresets, selectedPresetId]);

  useEffect(() => {
    if (!workspaceId) {
      setGroupOverlapEmails([]);
      return;
    }
    const allowedGroupIds = Array.from(new Set(settings.allowedGroupIds));
    const blockedGroupIds = Array.from(new Set(settings.blockedGroupIds));
    const hasBlocklist =
      blockedGroupIds.length > 0 ||
      (settings.blockedEmails ?? []).filter((e) => normalizeEmail(e)).length >
        0;
    if (allowedGroupIds.length === 0 || !hasBlocklist) {
      setGroupOverlapEmails([]);
      return;
    }

    let active = true;
    const blockedEmailSetFromDirect = new Set(
      (settings.blockedEmails ?? [])
        .map((e) => normalizeEmail(e))
        .filter(Boolean),
    );
    const allGroupIds = Array.from(
      new Set([...allowedGroupIds, ...blockedGroupIds]),
    );

    const loadOverlap = async () => {
      try {
        const allowedEmailSet = new Set<string>();
        const blockedEmailSet = new Set<string>(blockedEmailSetFromDirect);

        if (allGroupIds.length > 0) {
          const { data, error } = await supabase
            .from("workspace_user_group_emails")
            .select("group_id, email")
            .eq("workspace_id", workspaceId)
            .in("group_id", allGroupIds);
          if (!active) return;
          if (error) throw error;

          for (const row of (data ?? []) as Array<{
            group_id?: string | null;
            email?: string | null;
          }>) {
            const groupId = row.group_id ?? "";
            const email = normalizeEmail(row.email ?? "");
            if (!groupId || !email) continue;
            if (allowedGroupIds.includes(groupId)) allowedEmailSet.add(email);
            if (blockedGroupIds.includes(groupId)) blockedEmailSet.add(email);
          }
        }

        const overlap: string[] = [];
        for (const email of allowedEmailSet) {
          if (blockedEmailSet.has(email)) overlap.push(email);
        }
        overlap.sort((a, b) => a.localeCompare(b));
        setGroupOverlapEmails(overlap.slice(0, 25));
      } catch (err) {
        console.error("[LinkSettings] Failed to detect group overlaps", err);
        setGroupOverlapEmails([]);
      }
    };

    void loadOverlap();
    return () => {
      active = false;
    };
  }, [
    settings.allowedGroupIds,
    settings.blockedGroupIds,
    settings.blockedEmails,
    supabase,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workspaceId) {
      setAllowlistBlocklistOverlapEmails([]);
      return;
    }
    const allowedDirect = (settings.allowedEmails ?? [])
      .map((e) => normalizeEmail(e))
      .filter(Boolean);
    const blockedGroupIds = Array.from(new Set(settings.blockedGroupIds));
    const blockedDirectSet = new Set(
      (settings.blockedEmails ?? [])
        .map((e) => normalizeEmail(e))
        .filter(Boolean),
    );
    if (allowedDirect.length === 0) {
      setAllowlistBlocklistOverlapEmails([]);
      return;
    }
    if (blockedDirectSet.size === 0 && blockedGroupIds.length === 0) {
      setAllowlistBlocklistOverlapEmails([]);
      return;
    }

    let active = true;
    const loadOverlap = async () => {
      try {
        const blockedEmailSet = new Set(blockedDirectSet);
        if (blockedGroupIds.length > 0) {
          const { data, error } = await supabase
            .from("workspace_user_group_emails")
            .select("group_id, email")
            .eq("workspace_id", workspaceId)
            .in("group_id", blockedGroupIds);
          if (!active) return;
          if (error) throw error;
          for (const row of (data ?? []) as Array<{
            group_id?: string | null;
            email?: string | null;
          }>) {
            const email = normalizeEmail(row.email ?? "");
            if (email) blockedEmailSet.add(email);
          }
        }
        const overlap = allowedDirect.filter((email) =>
          blockedEmailSet.has(email),
        );
        overlap.sort((a, b) => a.localeCompare(b));
        setAllowlistBlocklistOverlapEmails(overlap.slice(0, 25));
      } catch (err) {
        console.error(
          "[LinkSettings] Failed to detect allowlist/blocklist overlaps",
          err,
        );
        setAllowlistBlocklistOverlapEmails([]);
      }
    };
    void loadOverlap();
    return () => {
      active = false;
    };
  }, [
    settings.allowedEmails,
    settings.blockedEmails,
    settings.blockedGroupIds,
    supabase,
    workspaceId,
  ]);

  useEffect(() => {
    const dataRoomAlcActive = resourceType === "data_room" && alcActive;
    if (!workspaceId || !dataRoomAlcActive) {
      setAlcBlocklistOverlapEmails([]);
      return;
    }

    const blockedGroupIds = Array.from(new Set(settings.blockedGroupIds));
    const blockedEmailSet = new Set(
      (settings.blockedEmails ?? [])
        .map((e) => normalizeEmail(e))
        .filter(Boolean),
    );

    const alcEmails = Array.from(
      new Set(
        [
          ...(alcRules.room.allowedEmails ?? []),
          ...(alcRules.folders ?? []).flatMap((r) => r.allowedEmails ?? []),
          ...(alcRules.documents ?? []).flatMap((r) => r.allowedEmails ?? []),
        ]
          .map((e) => normalizeEmail(e))
          .filter(Boolean),
      ),
    );
    const alcGroupIds = Array.from(
      new Set(
        [
          ...(alcRules.room.allowedGroupIds ?? []),
          ...(alcRules.folders ?? []).flatMap((r) => r.allowedGroupIds ?? []),
          ...(alcRules.documents ?? []).flatMap((r) => r.allowedGroupIds ?? []),
        ]
          .map((id) => (id ?? "").trim())
          .filter(Boolean),
      ),
    );

    if (
      (blockedGroupIds.length === 0 && blockedEmailSet.size === 0) ||
      (alcGroupIds.length === 0 && alcEmails.length === 0)
    ) {
      setAlcBlocklistOverlapEmails([]);
      return;
    }

    let active = true;
    const allGroupIds = Array.from(
      new Set([...blockedGroupIds, ...alcGroupIds]),
    );

    const loadOverlap = async () => {
      try {
        const { data, error } = await supabase
          .from("workspace_user_group_emails")
          .select("group_id, email")
          .eq("workspace_id", workspaceId)
          .in("group_id", allGroupIds);

        if (!active) return;
        if (error) throw error;

        const alcEmailSet = new Set<string>(alcEmails);
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

        const overlap: string[] = [];
        for (const email of alcEmailSet) {
          if (blockedEmailSet.has(email)) overlap.push(email);
        }
        overlap.sort((a, b) => a.localeCompare(b));
        setAlcBlocklistOverlapEmails(overlap.slice(0, 25));
      } catch (err) {
        console.error(
          "[LinkSettings] Failed to detect ALC blocklist overlaps",
          err,
        );
        setAlcBlocklistOverlapEmails([]);
      }
    };

    void loadOverlap();
    return () => {
      active = false;
    };
  }, [
    alcActive,
    alcRules,
    resourceType,
    settings.blockedEmails,
    settings.blockedGroupIds,
    supabase,
    workspaceId,
  ]);
  useEffect(() => {
    onAlcBlocklistOverlapChange?.(alcBlocklistOverlapEmails);
  }, [alcBlocklistOverlapEmails, onAlcBlocklistOverlapChange]);
  const expirationValue = React.useMemo(() => {
    if (!settings.expiration) {
      return null;
    }
    const date = new Date(settings.expiration);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [settings.expiration]);
  const minSelectableDate = React.useMemo(() => {
    const now = new Date();
    if (expirationValue && expirationValue < now) {
      return expirationValue;
    }
    return now;
  }, [expirationValue]);
  const handleExpirationChange = (nextValue: Date | null): void => {
    if (!nextValue) {
      update("expiration", "");
      return;
    }
    const next = new Date(nextValue);
    next.setSeconds(0, 0);
    const now = new Date();
    now.setSeconds(0, 0);
    if (next <= now) {
      next.setTime(now.getTime());
    }
    update("expiration", next.toISOString());
  };
  const renderEmailVerificationInfo = (message: string, label: string) => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
          aria-label={label}
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64">
        <p className="text-sm leading-relaxed text-popover-foreground">
          {message}
        </p>
      </HoverCardContent>
    </HoverCard>
  );

  const applyEmailVerificationRules = (next: LinkSettings): LinkSettings => {
    const requiresEmailVerification = deriveEmailVerification(next, {
      resourceType,
      alcActive,
    });
    if (next.emailVerification === requiresEmailVerification) {
      return next;
    }
    return { ...next, emailVerification: requiresEmailVerification };
  };

  const update = <K extends keyof LinkSettings>(
    key: K,
    value: LinkSettings[K],
  ) => {
    if (key === "passwordEnabled") {
      const enabled = Boolean(value);
      onSettingsChange(
        applyEmailVerificationRules({
          ...settings,
          passwordEnabled: enabled,
          password: enabled ? settings.password : "",
        }),
      );
      return;
    }
    if (key === "ndaRequired" && ndaLocked && value === false) {
      return;
    }
    if (
      !watermarkFeatureEnabled &&
      (key === "watermark" ||
        key === "dynamicWatermarkEmail" ||
        key === "dynamicWatermarkIp" ||
        key === "dynamicWatermarkDateTime")
    ) {
      return;
    }
    if (key === "allowedEmails") {
      const normalizedList = Array.from(
        new Set((value as string[]).map((email) => normalizeEmail(email))),
      ).filter((email) => !!email);
      const nextBlockedEmails = settings.blockedEmails.filter(
        (entry) => !normalizedList.includes(entry),
      );
      const hasAllowEntries =
        normalizedList.length > 0 || settings.allowedGroupIds.length > 0;
      const hasInviteRecipients =
        hasAllowEntries || (resourceType === "data_room" && alcActive);
      onSettingsChange(
        applyEmailVerificationRules({
          ...settings,
          allowedEmails: normalizedList,
          blockedEmails: nextBlockedEmails,
          sendInviteEmails: hasInviteRecipients
            ? settings.sendInviteEmails
            : false,
        }),
      );
      return;
    }
    if (key === "blockedEmails") {
      const normalizedList = Array.from(
        new Set((value as string[]).map((email) => normalizeEmail(email))),
      ).filter((email) => !!email);
      const nextAllowedEmails = settings.allowedEmails.filter(
        (entry) => !normalizedList.includes(entry),
      );
      const hasAllowEntries =
        nextAllowedEmails.length > 0 || settings.allowedGroupIds.length > 0;
      const hasInviteRecipients =
        hasAllowEntries || (resourceType === "data_room" && alcActive);
      onSettingsChange(
        applyEmailVerificationRules({
          ...settings,
          blockedEmails: normalizedList,
          allowedEmails: nextAllowedEmails,
          sendInviteEmails: hasInviteRecipients
            ? settings.sendInviteEmails
            : false,
        }),
      );
      return;
    }
    if (key === "allowedGroupIds") {
      const normalizedList = Array.from(
        new Set((value as string[]).map((groupId) => groupId.trim())),
      ).filter((groupId) => !!groupId);
      const nextBlockedGroups = settings.blockedGroupIds.filter(
        (entry) => !normalizedList.includes(entry),
      );
      const hasAllowEntries =
        settings.allowedEmails.length > 0 || normalizedList.length > 0;
      const hasInviteRecipients =
        hasAllowEntries || (resourceType === "data_room" && alcActive);
      onSettingsChange(
        applyEmailVerificationRules({
          ...settings,
          allowedGroupIds: normalizedList,
          blockedGroupIds: nextBlockedGroups,
          sendInviteEmails: hasInviteRecipients
            ? settings.sendInviteEmails
            : false,
        }),
      );
      return;
    }
    if (key === "blockedGroupIds") {
      const normalizedList = Array.from(
        new Set((value as string[]).map((groupId) => groupId.trim())),
      ).filter((groupId) => !!groupId);
      const nextAllowedGroups = settings.allowedGroupIds.filter(
        (entry) => !normalizedList.includes(entry),
      );
      const hasAllowEntries =
        settings.allowedEmails.length > 0 || nextAllowedGroups.length > 0;
      const hasInviteRecipients =
        hasAllowEntries || (resourceType === "data_room" && alcActive);
      onSettingsChange(
        applyEmailVerificationRules({
          ...settings,
          blockedGroupIds: normalizedList,
          allowedGroupIds: nextAllowedGroups,
          sendInviteEmails: hasInviteRecipients
            ? settings.sendInviteEmails
            : false,
        }),
      );
      return;
    }
    if (key === "sendInviteEmails") {
      const hasAllowEntries =
        settings.allowedEmails.length > 0 ||
        settings.allowedGroupIds.length > 0;
      const hasInviteRecipients =
        hasAllowEntries || (resourceType === "data_room" && alcActive);
      if (!hasInviteRecipients && value) {
        return;
      }
      onSettingsChange({ ...settings, sendInviteEmails: Boolean(value) });
      return;
    }
    if (
      key === "dynamicWatermarkEmail" ||
      key === "dynamicWatermarkIp" ||
      key === "dynamicWatermarkDateTime"
    ) {
      const nextValue = Boolean(value);
      if (!settings.watermark && nextValue) {
        onSettingsChange(
          applyEmailVerificationRules({
            ...settings,
            watermark: true,
            [key]: nextValue,
          } as LinkSettings),
        );
        return;
      }
      if (key === "dynamicWatermarkEmail") {
        onSettingsChange(
          applyEmailVerificationRules({
            ...settings,
            dynamicWatermarkEmail: nextValue,
          }),
        );
        return;
      }
      if (key === "dynamicWatermarkIp") {
        onSettingsChange({
          ...settings,
          dynamicWatermarkIp: nextValue,
        });
        return;
      }
      onSettingsChange({
        ...settings,
        dynamicWatermarkDateTime: nextValue,
      });
      return;
    }
    if (key === "watermark" && value === false) {
      onSettingsChange(
        applyEmailVerificationRules({
          ...settings,
          watermark: false,
          dynamicWatermarkEmail: false,
          dynamicWatermarkIp: false,
          dynamicWatermarkDateTime: false,
        }),
      );
      return;
    }
    if (key === "watermarkTemplateId" && !settings.watermark) {
      onSettingsChange({
        ...settings,
        watermark: true,
        watermarkTemplateId: value as string,
      });
      return;
    }
    onSettingsChange(
      applyEmailVerificationRules({ ...settings, [key]: value }),
    );
  };
  const dynamicWatermarkCard = (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm leading-tight font-medium">
              Dynamic watermark
            </p>
            {renderEmailVerificationInfo(
              "Email adds the verified viewer email; IP adds the viewer IP; Date & time adds an access timestamp. Email requires verification before viewing.",
              "Dynamic watermark info",
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Add contextual lines below the watermark.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Include email</p>
            <p className="text-xs text-muted-foreground">
              Requires email verification.
            </p>
          </div>
          <Switch
            checked={Boolean(settings.dynamicWatermarkEmail)}
            onCheckedChange={(v) => update("dynamicWatermarkEmail", v)}
            disabled={!watermarkFeatureEnabled || !settings.watermark}
            aria-label="Toggle dynamic email watermark"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Include IP</p>
            <p className="text-xs text-muted-foreground">
              Adds client IP below watermark.
            </p>
          </div>
          <Switch
            checked={Boolean(settings.dynamicWatermarkIp)}
            onCheckedChange={(v) => update("dynamicWatermarkIp", v)}
            disabled={!watermarkFeatureEnabled || !settings.watermark}
            aria-label="Toggle dynamic IP watermark"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Include date &amp; time</p>
            <p className="text-xs text-muted-foreground">
              Adds a UTC timestamp.
            </p>
          </div>
          <Switch
            checked={Boolean(settings.dynamicWatermarkDateTime)}
            onCheckedChange={(v) => update("dynamicWatermarkDateTime", v)}
            disabled={!watermarkFeatureEnabled || !settings.watermark}
            aria-label="Toggle dynamic date time watermark"
          />
        </div>
      </div>
    </div>
  );

  const handleAddAllowedEmail = () => {
    setAllowlistError(null);
    const normalized = normalizeEmail(newAllowlistEmail);
    if (!normalized) {
      setAllowlistError("Enter an email address to add");
      return;
    }
    const validation = emailSchema.safeParse(normalized);
    if (!validation.success) {
      setAllowlistError("Enter a valid email address");
      return;
    }
    if (settings.allowedEmails.includes(normalized)) {
      setAllowlistError("Email is already allowed");
      return;
    }
    update("allowedEmails", [...settings.allowedEmails, normalized]);
    setNewAllowlistEmail("");
  };

  const handleRemoveAllowedEmail = (email: string) => {
    const next = settings.allowedEmails.filter((entry) => entry !== email);
    update("allowedEmails", next as LinkSettings["allowedEmails"]);
  };

  const handleAddBlockedEmail = () => {
    setBlocklistError(null);
    const normalized = normalizeEmail(newBlocklistEmail);
    if (!normalized) {
      setBlocklistError("Enter an email address to block");
      return;
    }
    const validation = emailSchema.safeParse(normalized);
    if (!validation.success) {
      setBlocklistError("Enter a valid email address");
      return;
    }
    if (settings.blockedEmails.includes(normalized)) {
      setBlocklistError("Email is already blocked");
      return;
    }
    update("blockedEmails", [...settings.blockedEmails, normalized]);
    setNewBlocklistEmail("");
  };

  const handleRemoveBlockedEmail = (email: string) => {
    const next = settings.blockedEmails.filter((entry) => entry !== email);
    update("blockedEmails", next as LinkSettings["blockedEmails"]);
  };

  const toggleGroupSelection = (
    target: "allowedGroupIds" | "blockedGroupIds",
    groupId: string,
    checked: boolean,
  ) => {
    const current = settings[target];
    const next = checked
      ? Array.from(new Set([...current, groupId]))
      : current.filter((entry) => entry !== groupId);
    if (target === "allowedGroupIds") {
      update("allowedGroupIds", next);
      return;
    }
    update("blockedGroupIds", next);
  };

  const handleApplyPreset = async () => {
    if (!selectedPresetId || !onApplyPreset) return;
    setPresetError(null);
    try {
      await onApplyPreset(selectedPresetId);
    } catch (error) {
      console.error("[LinkSettings] apply preset failed", error);
      setPresetError("Unable to apply preset");
    }
  };

  const handleSavePreset = async () => {
    if (!onSavePreset) return;
    const trimmed = presetName.trim();
    if (!trimmed) {
      setPresetError("Preset name is required");
      return;
    }
    if (groupOverlapEmails.length > 0) {
      setPresetError(
        "Resolve overlapping allow/block group members before saving a preset.",
      );
      if (groupOverlapRef.current) {
        groupOverlapRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }
    if (allowlistBlocklistOverlapEmails.length > 0) {
      setPresetError(
        "Some allowed emails are on the blocklist. Remove the overlap before saving a preset.",
      );
      if (groupOverlapRef.current) {
        groupOverlapRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }
    setPresetError(null);
    try {
      await onSavePreset(trimmed);
      setPresetName("");
    } catch (error) {
      console.error("[LinkSettings] save preset failed", error);
      setPresetError("Unable to save preset");
    }
  };

  const handleUpdatePreset = async () => {
    if (!selectedPresetId || !onUpdatePreset) return;
    if (groupOverlapEmails.length > 0) {
      setPresetError(
        "Resolve overlapping allow/block group members before updating this preset.",
      );
      if (groupOverlapRef.current) {
        groupOverlapRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }
    if (allowlistBlocklistOverlapEmails.length > 0) {
      setPresetError(
        "Some allowed emails are on the blocklist. Remove the overlap before updating this preset.",
      );
      if (groupOverlapRef.current) {
        groupOverlapRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }
    setPresetError(null);
    try {
      await onUpdatePreset(selectedPresetId);
    } catch (error) {
      console.error("[LinkSettings] update preset failed", error);
      setPresetError("Unable to update preset");
    }
  };

  const handleConfirmDeletePreset = async () => {
    if (!deletePresetId || !onDeletePreset) return;
    setPresetError(null);
    try {
      await onDeletePreset(deletePresetId);
      if (selectedPresetId === deletePresetId) {
        setSelectedPresetId("");
      }
    } catch (error) {
      console.error("[LinkSettings] delete preset failed", error);
      setPresetError("Unable to delete preset");
    } finally {
      setDeletePresetId(null);
    }
  };

  const buildPresetComparableFromSettings =
    useCallback((): PresetComparable => {
      return buildPresetComparable(
        {
          settingsJson: {
            passwordEnabled: settings.passwordEnabled,
            emailNotifications: settings.emailNotifications,
            downloadEnabled: settings.downloadEnabled,
            collectEmailsForAnalytics: settings.collectEmailsForAnalytics,
            screenshotProtection: settings.screenshotProtection,
            watermark: settings.watermark,
            watermarkTemplateId: settings.watermarkTemplateId ?? null,
            dynamicWatermarkEmail: settings.dynamicWatermarkEmail,
            dynamicWatermarkIp: settings.dynamicWatermarkIp,
            dynamicWatermarkDateTime: settings.dynamicWatermarkDateTime,
            showQnA: settings.showQnA,
            showFeedback: settings.showFeedback,
            commentsEnabled: settings.commentsEnabled,
            publicLanguageOverride: settings.publicLanguageOverride,
            qaPairs: settings.qaPairs,
            ndaRequired: settings.ndaRequired,
            ndaTemplateId: settings.ndaTemplateId ?? null,
          },
          allowedEmails: settings.allowedEmails,
          blockedEmails: settings.blockedEmails,
          allowedGroupIds: settings.allowedGroupIds,
          blockedGroupIds: settings.blockedGroupIds,
        },
        { includeNda: !editingExisting },
      );
    }, [editingExisting, settings]);

  const presetIsApplied = Boolean(
    selectedPresetId && activePresetId && selectedPresetId === activePresetId,
  );
  const presetIsDirty = useMemo(() => {
    if (!presetIsApplied) return false;
    if (!activePresetComparable) return false;
    const current = buildPresetComparableFromSettings();
    return !presetComparablesEqual(current, activePresetComparable);
  }, [
    activePresetComparable,
    buildPresetComparableFromSettings,
    presetIsApplied,
  ]);

  const selectedPresetSummary = useMemo(() => {
    const preset = linkPresets.find((p) => p.id === selectedPresetId) ?? null;
    const json = preset?.settingsJson ?? {};
    const chips: string[] = [];
    if (json && typeof json === "object") {
      const getBool = (key: string) =>
        Boolean((json as Record<string, unknown>)[key]);
      chips.push(getBool("downloadEnabled") ? "Downloads on" : "Downloads off");
      if (getBool("passwordEnabled")) chips.push("Password");
      if (getBool("collectEmailsForAnalytics"))
        chips.push("Store viewer email");
      if (getBool("emailNotifications")) chips.push("Notify on view");
      if (getBool("screenshotProtection")) chips.push("Screenshot protection");
      if (getBool("watermark")) {
        const dynamic =
          getBool("dynamicWatermarkEmail") ||
          getBool("dynamicWatermarkIp") ||
          getBool("dynamicWatermarkDateTime");
        chips.push(dynamic ? "Dynamic watermark" : "Watermark");
      }
      if (getBool("showQnA")) chips.push("Q&A");
      if (getBool("showFeedback")) chips.push("Feedback");
      if (getBool("commentsEnabled")) chips.push("Comments");
      if (!editingExisting && getBool("ndaRequired")) chips.push("NDA");
    }
    return chips;
  }, [editingExisting, linkPresets, selectedPresetId]);

  const selectedTemplateLabel = isSelectedTemplateLoading
    ? "Loading template..."
    : selectedNdaTemplateName || "Template unavailable";

  const expiresSummary = expirationValue
    ? expirationValue.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Never";

  const accessChips = useMemo(() => {
    const chips: string[] = [];
    const dataRoomAlcActive = resourceType === "data_room" && alcActive;
    if (passwordEnabled) {
      chips.push(editingExisting && passwordSet ? "Password set" : "Password");
    }
    if (settings.emailVerification) chips.push("OTP");
    if (dataRoomAlcActive) chips.push("ALC");
    if (!dataRoomAlcActive) {
      if (settings.allowedEmails.length > 0) {
        chips.push(`Allowlist (${settings.allowedEmails.length})`);
      }
      if (
        settings.allowedGroupIds.length > 0 &&
        settings.allowedEmails.length === 0
      ) {
        chips.push(`Allow groups (${settings.allowedGroupIds.length})`);
      }
    }
    if (
      settings.blockedEmails.length > 0 ||
      settings.blockedGroupIds.length > 0
    ) {
      chips.push(
        `Blocklist (${settings.blockedEmails.length + settings.blockedGroupIds.length})`,
      );
    }
    if (settings.ndaRequired) chips.push("NDA");
    if (expirationValue) chips.push("Expires");
    if (chips.length === 0) chips.push("Public");
    return chips;
  }, [
    alcActive,
    editingExisting,
    expirationValue,
    passwordEnabled,
    passwordSet,
    resourceType,
    settings.allowedEmails.length,
    settings.allowedGroupIds.length,
    settings.blockedEmails.length,
    settings.blockedGroupIds.length,
    settings.emailVerification,
    settings.ndaRequired,
  ]);

  const viewerChips = useMemo(() => {
    const chips: string[] = [];
    chips.push(settings.downloadEnabled ? "Downloads on" : "Downloads off");
    if (settings.screenshotProtection) chips.push("Screenshot protection");
    if (settings.watermark) {
      const dynamic =
        Boolean(settings.dynamicWatermarkEmail) ||
        Boolean(settings.dynamicWatermarkIp) ||
        Boolean(settings.dynamicWatermarkDateTime);
      chips.push(dynamic ? "Dynamic watermark" : "Watermark");
    }
    if (settings.showQnA) chips.push("Q&A");
    if (settings.showFeedback) chips.push("Feedback");
    if (resourceType === "document" && settings.commentsEnabled)
      chips.push("Comments");
    return chips;
  }, [
    settings.downloadEnabled,
    settings.commentsEnabled,
    settings.dynamicWatermarkEmail,
    settings.dynamicWatermarkDateTime,
    settings.dynamicWatermarkIp,
    resourceType,
    settings.screenshotProtection,
    settings.showFeedback,
    settings.showQnA,
    settings.watermark,
  ]);

  const analyticsChips = useMemo(() => {
    const chips: string[] = [];
    chips.push(
      settings.collectEmailsForAnalytics
        ? "Store viewer email"
        : "No email stored",
    );
    if (settings.emailNotifications) chips.push("Notify on view");
    return chips;
  }, [settings.collectEmailsForAnalytics, settings.emailNotifications]);

  const allowlistDisabled = resourceType === "data_room" && alcActive;
  const hasAllowEntries =
    settings.allowedEmails.length > 0 || settings.allowedGroupIds.length > 0;
  const hasInviteRecipients =
    hasAllowEntries || (resourceType === "data_room" && alcActive);
  const customSlugPreview = normalizeShareSlug(settings.customSlug);
  const workspaceSlugPreview =
    (workspaceSlug && normalizeShareSlug(workspaceSlug)) || "workspace";

  return (
    <>
      <div className={cn("w-full bg-transparent p-3 md:p-5", className)}>
        <div className="mx-auto w-full max-w-6xl">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
            <div>
              <Tabs defaultValue="basics" className="w-full">
                <TabsList className="mb-5 grid h-9 w-full grid-cols-3 border border-border/70 bg-card/45 p-1">
                  <TabsTrigger value="basics">Basics</TabsTrigger>
                  <TabsTrigger value="security">Security</TabsTrigger>
                  <TabsTrigger value="access">Access</TabsTrigger>
                </TabsList>

                <div className="min-h-105">
                  <TabsContent value="basics" className="space-y-4">
                    <div className="dk-nocturne-surface space-y-4 rounded-lg p-4">
                      <div className="space-y-2">
                        <Label htmlFor="link-name">Link name</Label>
                        <Input
                          id="link-name"
                          value={settings.name}
                          maxLength={120}
                          onChange={(e) => update("name", e.target.value)}
                          placeholder="Investor update – March 2025"
                        />
                        <p className="text-xs text-muted-foreground">
                          Shown to teammates and in analytics reports.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custom-slug">
                          Custom URL (optional)
                        </Label>
                        <Input
                          id="custom-slug"
                          value={settings.customSlug}
                          maxLength={64}
                          onChange={(event) =>
                            update(
                              "customSlug",
                              sanitizeShareSlugDraft(event.target.value),
                            )
                          }
                          placeholder="investor-update-march"
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                        <p className="text-xs text-muted-foreground">
                          {customSlugPreview
                            ? `Share path: /${workspaceSlugPreview}/${customSlugPreview}`
                            : "Default share path: Auto-generated secure link"}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="expiration-picker">Expiration</Label>
                        <Input
                          id="expiration-picker"
                          type="datetime-local"
                          value={toDatetimeLocalValue(expirationValue)}
                          min={toDatetimeLocalValue(minSelectableDate)}
                          onChange={(event) =>
                            handleExpirationChange(
                              fromDatetimeLocalValue(event.target.value),
                            )
                          }
                          step={60}
                          aria-label="Link expiration"
                        />
                        <p className="text-xs text-muted-foreground">
                          Leave empty to keep the link active indefinitely.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="public-language-select">
                          Public viewer language
                        </Label>
                        <Select
                          value={settings.publicLanguageOverride ?? "inherit"}
                          onValueChange={(value) =>
                            update(
                              "publicLanguageOverride",
                              value === "inherit"
                                ? null
                                : (value as PublicLanguage),
                            )
                          }
                        >
                          <SelectTrigger
                            id="public-language-select"
                            aria-label="Public viewer language"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inherit">
                              {`Use workspace default (${getPublicLanguageLabel(
                                workspaceDefaultPublicLanguage,
                              )})`}
                            </SelectItem>
                            {PUBLIC_LANGUAGE_VALUES.map((language) => (
                              <SelectItem key={language} value={language}>
                                {getPublicLanguageLabel(language)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Inherited links always follow the current workspace
                          default, which keeps multilingual public links
                          consistent across your shared resources.
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow downloads</Label>
                          <p className="text-xs text-muted-foreground">
                            Enable download button
                          </p>
                        </div>
                        <Switch
                          checked={settings.downloadEnabled}
                          onCheckedChange={(v) => update("downloadEnabled", v)}
                          aria-label="Toggle downloads"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Email notifications</Label>
                          <p className="text-xs text-muted-foreground">
                            Notify the workspace when this link is viewed
                          </p>
                        </div>
                        <Switch
                          checked={settings.emailNotifications}
                          onCheckedChange={(v) =>
                            update("emailNotifications", v)
                          }
                          aria-label="Toggle email notifications"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Allow feedback</Label>
                          <p className="text-xs text-muted-foreground">
                            Show feedback button to viewers
                          </p>
                        </div>
                        <Switch
                          checked={settings.showFeedback}
                          onCheckedChange={(v) => update("showFeedback", v)}
                          aria-label="Toggle feedback"
                        />
                      </div>

                      {resourceType === "document" ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <Label>Allow comments</Label>
                              <p className="text-xs text-muted-foreground">
                                Let viewers create text-anchored comments in the
                                PDF viewer.
                              </p>
                            </div>
                            <Switch
                              checked={settings.commentsEnabled}
                              onCheckedChange={(value) =>
                                update("commentsEnabled", value)
                              }
                              aria-label="Toggle comments"
                            />
                          </div>
                          {settings.commentsEnabled ? (
                            <p className="text-xs text-muted-foreground">
                              Viewers must verify email (OTP) before posting.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Show questions &amp; answers</Label>
                          <p className="text-xs text-muted-foreground">
                            Display curated Q&amp;A to viewers
                          </p>
                        </div>
                        <Switch
                          checked={settings.showQnA}
                          onCheckedChange={(v) => update("showQnA", v)}
                          aria-label="Toggle questions and answers"
                        />
                      </div>

                      {settings.showQnA && (
                        <div className="space-y-3 rounded-md border p-3">
                          <div className="flex w-full items-center justify-between">
                            <Label>Questions &amp; Answers</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                update("qaPairs", [
                                  ...settings.qaPairs,
                                  { question: "", answer: "" },
                                ]);
                              }}
                            >
                              <Plus aria-hidden /> Add
                            </Button>
                          </div>
                          {settings.qaPairs.map((qa, idx) => {
                            const hasQuestion = qa.question.trim().length > 0;
                            const hasAnswer = qa.answer.trim().length > 0;
                            const isIncomplete = hasQuestion !== hasAnswer;
                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "space-y-2 rounded border p-2",
                                  isIncomplete && "border-destructive",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex-1 space-y-2">
                                    <Input
                                      placeholder="Question"
                                      value={qa.question}
                                      onChange={(e) => {
                                        const updated = [...settings.qaPairs];
                                        updated[idx] = {
                                          ...qa,
                                          question: e.target.value,
                                        };
                                        update("qaPairs", updated);
                                      }}
                                    />
                                    <Input
                                      placeholder="Answer"
                                      value={qa.answer}
                                      onChange={(e) => {
                                        const updated = [...settings.qaPairs];
                                        updated[idx] = {
                                          ...qa,
                                          answer: e.target.value,
                                        };
                                        update("qaPairs", updated);
                                      }}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Remove Q&A pair ${idx + 1}`}
                                    onClick={() => {
                                      const updated = settings.qaPairs.filter(
                                        (_, i) => i !== idx,
                                      );
                                      update("qaPairs", updated);
                                    }}
                                  >
                                    <Trash className="h-4 w-4" aria-hidden />
                                  </Button>
                                </div>
                                {isIncomplete ? (
                                  <p className="text-xs text-destructive">
                                    Both question and answer are required —
                                    incomplete pairs won&apos;t be saved.
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                          {settings.qaPairs.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Add curated Q&amp;A to help preempt common
                              questions.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent
                    value="security"
                    className="space-y-4"
                    data-guide="links-security-controls"
                  >
                    <div className="dk-nocturne-surface space-y-4 rounded-lg p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="link-password">
                            Password protection
                          </Label>
                          <div className="flex items-center gap-2">
                            {editingExisting &&
                            passwordSet &&
                            passwordEnabled ? (
                              <Badge variant="secondary">Saved</Badge>
                            ) : null}
                            {passwordEnabled ? (
                              <Badge variant="secondary">Enabled</Badge>
                            ) : (
                              <Badge variant="outline">Disabled</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground">
                            Require a password before viewing this link.
                          </div>
                          <Switch
                            checked={passwordEnabled}
                            onCheckedChange={(v) =>
                              update("passwordEnabled", v)
                            }
                            aria-label="Toggle password protection"
                          />
                        </div>
                        <Input
                          id="link-password"
                          type="password"
                          className="ph-no-capture"
                          data-ph-no-capture
                          placeholder={
                            passwordEnabled
                              ? editingExisting && passwordSet
                                ? "Leave blank to keep existing password"
                                : "Set a password"
                              : "Password protection is disabled"
                          }
                          value={settings.password}
                          onChange={(e) => update("password", e.target.value)}
                          disabled={!passwordEnabled}
                        />
                        {editingExisting ? (
                          <p className="text-xs text-muted-foreground">
                            {passwordEnabled
                              ? passwordSet
                                ? "A password is currently set. Leave blank to keep it unchanged, or enter a new one to rotate it."
                                : "Set a password to enable protection."
                              : passwordSet
                                ? "Disabling will remove password protection for this link."
                                : "Password protection is currently disabled."}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Label>Collect emails for analytics</Label>
                            {renderEmailVerificationInfo(
                              "Requires a verified email. Viewers will confirm their email before analytics are captured.",
                              "Collect emails requires verified email",
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Store verified viewer emails for analytics.
                          </p>
                        </div>
                        <Switch
                          checked={settings.collectEmailsForAnalytics}
                          onCheckedChange={(v) =>
                            update("collectEmailsForAnalytics", v)
                          }
                          aria-label="Toggle analytics email collection"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Screenshot protection</Label>
                          <p className="text-xs text-muted-foreground">
                            Blur content when a screenshot is detected
                          </p>
                        </div>
                        <Switch
                          checked={settings.screenshotProtection}
                          onCheckedChange={(v) =>
                            update("screenshotProtection", v)
                          }
                          aria-label="Toggle screenshot protection"
                        />
                      </div>
                      {showNdaToggle ? (
                        <>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <Label>NDA required to open</Label>
                                {renderEmailVerificationInfo(
                                  "NDA signing includes email verification; no separate email gate is required.",
                                  "NDA requires verified email",
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Require an NDA signature before viewing
                              </p>
                            </div>
                            <Switch
                              checked={settings.ndaRequired}
                              onCheckedChange={(v) => update("ndaRequired", v)}
                              disabled={ndaLocked}
                              aria-label="Toggle NDA requirement"
                            />
                          </div>
                          {settings.ndaRequired && !editingExisting && (
                            <div className="space-y-2">
                              <Label htmlFor="nda-template-select">
                                NDA Template
                              </Label>
                              {isLoadingTemplates ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <CircleNotch
                                    aria-hidden
                                    className="h-4 w-4 animate-spin"
                                  />
                                  Loading templates...
                                </div>
                              ) : ndaTemplates.length === 0 ? (
                                <div className="space-y-2">
                                  <p className="text-xs text-muted-foreground">
                                    No NDA templates available.
                                  </p>
                                  <Link
                                    href="/nda-templates"
                                    className={cn(
                                      buttonVariants({
                                        variant: "link",
                                        size: "sm",
                                      }),
                                      "h-auto px-0 py-0",
                                    )}
                                  >
                                    Create an NDA template
                                  </Link>
                                </div>
                              ) : (
                                <div className="mt-1 space-y-1">
                                  <Select
                                    value={settings.ndaTemplateId ?? ""}
                                    onValueChange={(v) =>
                                      update("ndaTemplateId", v || null)
                                    }
                                  >
                                    <SelectTrigger id="nda-template-select">
                                      <SelectValue placeholder="Select a template" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ndaTemplates.map((tpl) => (
                                        <SelectItem key={tpl.id} value={tpl.id}>
                                          {tpl.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    Template content is locked at link creation.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                          {settings.ndaRequired && editingExisting && (
                            <div className="space-y-1">
                              <p className="text-sm font-medium">
                                NDA Template: {selectedTemplateLabel}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Template is locked to the version saved at link
                                creation.
                              </p>
                            </div>
                          )}
                        </>
                      ) : null}
                      <div className="space-y-5">
                        <div className="flex w-full flex-col items-start">
                          <div className="flex w-full items-start justify-between gap-3">
                            <div
                              className={cn(
                                "space-y-1",
                                !watermarkFeatureEnabled
                                  ? "opacity-50"
                                  : undefined,
                              )}
                            >
                              <Label>Watermark</Label>
                              <p className="text-xs text-muted-foreground">
                                Stamp your chosen watermark template on shared
                                PDFs.
                              </p>
                            </div>
                            <Switch
                              checked={
                                settings.watermark && watermarkFeatureEnabled
                              }
                              onCheckedChange={(v) => update("watermark", v)}
                              disabled={!watermarkFeatureEnabled}
                              aria-label="Toggle watermark"
                            />
                          </div>
                          {!watermarkFeatureEnabled ? (
                            <Link
                              href="/custom-watermarks"
                              className={cn(
                                buttonVariants({ variant: "link", size: "sm" }),
                                "px-0",
                              )}
                            >
                              Configure watermark templates
                            </Link>
                          ) : null}
                        </div>
                        {watermarkFeatureEnabled && settings.watermark ? (
                          <div className="space-y-3 rounded-md border p-3">
                            <div className="space-y-1">
                              <Label htmlFor="watermark-template">
                                Template
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Choose which watermark template to apply.
                              </p>
                            </div>
                            <Select
                              value={
                                settings.watermarkTemplateId ??
                                watermarkOptions[0]?.id ??
                                ""
                              }
                              onValueChange={(v) =>
                                update(
                                  "watermarkTemplateId",
                                  v === "" ? null : v,
                                )
                              }
                            >
                              <SelectTrigger id="watermark-template">
                                <SelectValue placeholder="Select template" />
                              </SelectTrigger>
                              <SelectContent>
                                {watermarkOptions.map((option) => (
                                  <SelectItem
                                    key={option.id ?? "branding"}
                                    value={option.id ?? ""}
                                  >
                                    {option.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                        {watermarkFeatureEnabled && settings.watermark
                          ? dynamicWatermarkCard
                          : null}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="access" className="space-y-4">
                    {accessRulesLoading ? (
                      <div
                        className="dk-nocturne-surface space-y-3 rounded-lg p-4"
                        aria-busy="true"
                        aria-live="polite"
                      >
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CircleNotch
                            className="h-4 w-4 animate-spin"
                            aria-hidden
                          />
                          Loading access rules…
                        </div>
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-9 w-2/3" />
                      </div>
                    ) : accessRulesError ? (
                      <div
                        role="alert"
                        className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
                      >
                        <div className="flex items-start gap-3">
                          <Warning
                            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                            aria-hidden
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              Unable to load access rules
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Saving is disabled so this link&apos;s existing
                              rules aren&apos;t overwritten.
                            </p>
                          </div>
                        </div>
                        {onRetryAccessRules ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onRetryAccessRules}
                          >
                            <ArrowClockwise
                              className="mr-2 h-4 w-4"
                              aria-hidden
                            />
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        {resourceType === "data_room" ? (
                          <>
                            <div
                              className={cn(
                                "rounded-lg border p-4 transition-colors",
                                alcActive
                                  ? "border-primary/35 bg-primary/[0.055] shadow-[inset_2px_0_0_var(--primary)]"
                                  : "border-border/70 bg-card/45",
                              )}
                            >
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Label className="text-base font-semibold">
                                      Advanced Level Control (ALC)
                                    </Label>
                                    <Badge
                                      variant={
                                        alcActive ? "default" : "outline"
                                      }
                                      className="capitalize"
                                    >
                                      {alcActive ? "Active" : "Inactive"}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <Button
                                    type="button"
                                    variant={
                                      alcActive ? "secondary" : "outline"
                                    }
                                    onClick={() => setAlcDialogOpen(true)}
                                    className="shrink-0"
                                  >
                                    <Shield
                                      className="mr-2 h-4 w-4"
                                      aria-hidden
                                    />
                                    {alcActive ? "Manage Rules" : "Enable ALC"}
                                  </Button>
                                  {alcActive ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                          setRemoveAlcDialogOpen(true)
                                        }
                                        className="shrink-0 text-destructive hover:text-destructive"
                                      >
                                        <Trash
                                          className="mr-2 h-4 w-4"
                                          aria-hidden
                                        />
                                        Remove ALC
                                      </Button>
                                      <AlertDialog
                                        open={removeAlcDialogOpen}
                                        onOpenChange={setRemoveAlcDialogOpen}
                                      >
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>
                                              Remove advanced access control?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This clears all ALC rules (room,
                                              folder, and document) for this
                                              link.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>
                                              Cancel
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                              variant="destructive"
                                              onClick={() => {
                                                onAlcRulesChange({
                                                  room: {
                                                    allowedEmails: [],
                                                    allowedGroupIds: [],
                                                  },
                                                  folders: [],
                                                  documents: [],
                                                });
                                                setAlcDialogOpen(false);
                                                setRemoveAlcDialogOpen(false);
                                              }}
                                            >
                                              Remove ALC
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </>
                                  ) : null}
                                  <LinkAlcRulesDialog
                                    dataRoomId={resourceId}
                                    userGroups={userGroups}
                                    rules={alcRules}
                                    onRulesChange={onAlcRulesChange}
                                    alcActive={alcActive}
                                    open={alcDialogOpen}
                                    onOpenChange={setAlcDialogOpen}
                                    reviewRequest={alcConflictReviewRequest}
                                  />
                                </div>
                                {isEditing && onResendInvites && alcActive ? (
                                  <div className="flex w-full justify-end sm:w-auto">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={onResendInvites}
                                      disabled={
                                        resendInvitesPending ||
                                        resendCooldownActive
                                      }
                                    >
                                      {resendInvitesPending ? (
                                        <CircleNotch
                                          aria-hidden
                                          className="mr-2 h-4 w-4 animate-spin"
                                        />
                                      ) : (
                                        <PaperPlaneTilt
                                          aria-hidden
                                          className="mr-2 h-4 w-4"
                                        />
                                      )}
                                      {resendCooldownActive
                                        ? `Resend in ${resendInvitesCooldownSec}s`
                                        : "Resend invites"}
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </>
                        ) : null}

                        <div className="dk-nocturne-surface space-y-4 rounded-lg p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <Label>Allowlist</Label>
                              <p className="text-xs text-muted-foreground">
                                Add emails or groups that can access this link.
                                Viewers verify themselves via OTP when access
                                rules are configured.
                              </p>
                            </div>
                            {isEditing && onResendInvites && !alcActive ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={onResendInvites}
                                disabled={
                                  resendInvitesPending ||
                                  resendCooldownActive ||
                                  !hasInviteRecipients
                                }
                              >
                                {resendInvitesPending ? (
                                  <CircleNotch
                                    aria-hidden
                                    className="mr-2 h-4 w-4 animate-spin"
                                  />
                                ) : (
                                  <PaperPlaneTilt
                                    aria-hidden
                                    className="mr-2 h-4 w-4"
                                  />
                                )}
                                {resendCooldownActive
                                  ? `Resend in ${resendInvitesCooldownSec}s`
                                  : "Resend invites"}
                              </Button>
                            ) : null}
                          </div>

                          <div className="relative">
                            {allowlistDisabled ? (
                              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg border bg-background/50 text-center backdrop-blur-sm">
                                <Shield
                                  aria-hidden
                                  className="mb-3 h-8 w-8 text-muted-foreground/50"
                                />
                                <p className="text-sm font-medium">
                                  Advanced Level Control Enabled
                                </p>
                                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                                  Global allowlist is disabled. Configure access
                                  rules in ALC settings, or clear all ALC rules
                                  to enable global allowlist.
                                </p>
                              </div>
                            ) : null}
                            <div
                              className={cn(
                                "space-y-4 transition-all duration-200",
                                allowlistDisabled &&
                                  "pointer-events-none opacity-20 blur-sm grayscale select-none",
                              )}
                              aria-hidden={allowlistDisabled}
                            >
                              <div className="space-y-2">
                                <Label htmlFor="allowlist-email">
                                  Allowed emails
                                </Label>
                                <div className="flex items-center gap-2">
                                  <div className="relative flex-1">
                                    <Input
                                      id="allowlist-email"
                                      value={newAllowlistEmail}
                                      onChange={(e) => {
                                        setAllowlistError(null);
                                        setNewAllowlistEmail(e.target.value);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          handleAddAllowedEmail();
                                        }
                                      }}
                                      placeholder="viewer@company.com"
                                      aria-label="Allowed email address"
                                      disabled={allowlistDisabled}
                                      className={cn(
                                        allowlistError
                                          ? "border-destructive focus-visible:ring-destructive"
                                          : "",
                                      )}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    onClick={handleAddAllowedEmail}
                                    variant="secondary"
                                    className="shrink-0"
                                    disabled={allowlistDisabled}
                                  >
                                    <PaperPlaneTilt
                                      aria-hidden
                                      className="mr-2 h-4 w-4"
                                    />
                                    Add email
                                  </Button>
                                </div>
                                {allowlistError ? (
                                  <p className="px-1 text-xs text-destructive">
                                    {allowlistError}
                                  </p>
                                ) : null}
                              </div>

                              {settings.allowedEmails.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {settings.allowedEmails.map((email) => (
                                    <Badge
                                      key={email}
                                      variant="secondary"
                                      className="flex items-center gap-1 py-1 pr-1 pl-2 text-xs"
                                    >
                                      {email}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveAllowedEmail(email)
                                        }
                                        disabled={allowlistDisabled}
                                        className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                                        aria-label={`Remove ${email}`}
                                      >
                                        <X aria-hidden className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  No allowed emails added yet.
                                </p>
                              )}

                              <div className="space-y-3 rounded-md border p-3">
                                <div className="space-y-1">
                                  <Label>Allowed groups</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Members of selected groups are granted
                                    access.
                                  </p>
                                </div>
                                {userGroups.length > 0 ? (
                                  <div className="grid gap-2">
                                    {userGroups.map((group) => (
                                      <label
                                        key={`allow-${group.id}`}
                                        className={cn(
                                          "flex cursor-pointer items-start gap-3 rounded-md border p-2",
                                          allowlistDisabled
                                            ? "cursor-not-allowed opacity-60"
                                            : "",
                                        )}
                                      >
                                        <Checkbox
                                          checked={settings.allowedGroupIds.includes(
                                            group.id,
                                          )}
                                          disabled={allowlistDisabled}
                                          onCheckedChange={(checked) =>
                                            toggleGroupSelection(
                                              "allowedGroupIds",
                                              group.id,
                                              Boolean(checked),
                                            )
                                          }
                                          aria-label={`Allow ${group.name}`}
                                        />
                                        <span className="space-y-0.5">
                                          <span className="block text-sm font-medium">
                                            {group.name}
                                          </span>
                                          <span className="block text-xs text-muted-foreground">
                                            {group.emailCount} email
                                            {group.emailCount === 1 ? "" : "s"}
                                          </span>
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                      No user groups yet. Create a group to
                                      quickly allow a set of emails.
                                    </p>
                                    <Link
                                      href="/user-groups"
                                      className={cn(
                                        buttonVariants({
                                          variant: "link",
                                          size: "sm",
                                        }),
                                        "h-auto px-0 py-0",
                                      )}
                                    >
                                      Manage user groups
                                    </Link>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2 border-t pt-4">
                            <div className="space-y-1">
                              <Label htmlFor="blocklist-email">
                                Blocked emails
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Blocked entries always take precedence over
                                allowlist entries.
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <Input
                                  id="blocklist-email"
                                  value={newBlocklistEmail}
                                  onChange={(e) => {
                                    setBlocklistError(null);
                                    setNewBlocklistEmail(e.target.value);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddBlockedEmail();
                                    }
                                  }}
                                  placeholder="blocked@company.com"
                                  aria-label="Blocked email address"
                                  className={cn(
                                    blocklistError
                                      ? "border-destructive focus-visible:ring-destructive"
                                      : "",
                                  )}
                                />
                              </div>
                              <Button
                                type="button"
                                onClick={handleAddBlockedEmail}
                                variant="secondary"
                                className="shrink-0"
                              >
                                <PaperPlaneTilt
                                  aria-hidden
                                  className="mr-2 h-4 w-4"
                                />
                                Add block
                              </Button>
                            </div>
                            {blocklistError ? (
                              <p className="px-1 text-xs text-destructive">
                                {blocklistError}
                              </p>
                            ) : null}
                          </div>

                          {settings.blockedEmails.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {settings.blockedEmails.map((email) => (
                                <Badge
                                  key={`blocked-${email}`}
                                  variant="secondary"
                                  className="flex items-center gap-1 py-1 pr-1 pl-2 text-xs"
                                >
                                  {email}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveBlockedEmail(email)
                                    }
                                    className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                                    aria-label={`Unblock ${email}`}
                                  >
                                    <X aria-hidden className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No blocked emails.
                            </p>
                          )}

                          <div className="space-y-3 rounded-md border p-3">
                            <div className="space-y-1">
                              <Label>Blocked groups</Label>
                              <p className="text-xs text-muted-foreground">
                                Members of selected groups are denied access
                                even if allowed elsewhere.
                              </p>
                            </div>
                            {userGroups.length > 0 ? (
                              <div className="grid gap-2">
                                {userGroups.map((group) => (
                                  <label
                                    key={`block-${group.id}`}
                                    className="flex cursor-pointer items-start gap-3 rounded-md border p-2"
                                  >
                                    <Checkbox
                                      checked={settings.blockedGroupIds.includes(
                                        group.id,
                                      )}
                                      onCheckedChange={(checked) =>
                                        toggleGroupSelection(
                                          "blockedGroupIds",
                                          group.id,
                                          Boolean(checked),
                                        )
                                      }
                                      aria-label={`Block ${group.name}`}
                                    />
                                    <span className="space-y-0.5">
                                      <span className="block text-sm font-medium">
                                        {group.name}
                                      </span>
                                      <span className="block text-xs text-muted-foreground">
                                        {group.emailCount} email
                                        {group.emailCount === 1 ? "" : "s"}
                                      </span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">
                                  No user groups yet. Create a group to quickly
                                  block a set of emails.
                                </p>
                                <Link
                                  href="/user-groups"
                                  className={cn(
                                    buttonVariants({
                                      variant: "link",
                                      size: "sm",
                                    }),
                                    "h-auto px-0 py-0",
                                  )}
                                >
                                  Manage user groups
                                </Link>
                              </div>
                            )}
                          </div>

                          <div className="space-y-4 rounded-lg border p-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <Label className="text-base">
                                  Invite emails
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  Choose when to email allowed recipients.
                                </p>
                              </div>
                              <Envelope
                                aria-hidden
                                className="h-4 w-4 text-muted-foreground"
                              />
                            </div>
                            <RadioGroup
                              value={
                                settings.sendInviteEmails ? "true" : "false"
                              }
                              onValueChange={(v) =>
                                update("sendInviteEmails", v === "true")
                              }
                              disabled={!hasInviteRecipients}
                              className="flex flex-col gap-3"
                            >
                              <div className="flex items-start space-x-2">
                                <RadioGroupItem
                                  value="true"
                                  id="r-send-now"
                                  className="mt-1"
                                />
                                <div className="grid gap-1.5 leading-none">
                                  <Label
                                    htmlFor="r-send-now"
                                    className="cursor-pointer font-medium"
                                  >
                                    Send invite emails now
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    Email allowed recipients immediately when
                                    the link is created.
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-start space-x-2">
                                <RadioGroupItem
                                  value="false"
                                  id="r-send-later"
                                  className="mt-1"
                                />
                                <div className="grid gap-1.5 leading-none">
                                  <Label
                                    htmlFor="r-send-later"
                                    className="cursor-pointer font-medium"
                                  >
                                    Don't send invite emails
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    You can send invites later manually.
                                  </p>
                                </div>
                              </div>
                            </RadioGroup>
                          </div>
                        </div>
                      </>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            <aside className="mt-6 lg:mt-0">
              <div className="dk-nocturne-surface relative space-y-4 overflow-hidden rounded-lg p-4 lg:sticky lg:top-6">
                <div
                  className="absolute inset-x-0 top-0 h-px bg-primary/55"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Viewer experience</p>
                  <p className="text-xs text-muted-foreground">
                    {document?.name ? `Sharing: ${document.name}` : "Summary"}
                  </p>
                </div>

                {alcActive && alcBlocklistOverlapEmails.length > 0 ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <div className="flex items-start gap-3">
                      <Warning
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Overlapping rules</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          The following emails are allowed by ALC rules but
                          explicitly blocked to the overall link. Remove the
                          overlap to save.
                        </p>
                        <p className="mt-2 text-xs font-medium text-destructive">
                          {alcBlocklistOverlapEmails.slice(0, 6).join(", ")}
                          {alcBlocklistOverlapEmails.length > 6 ? "…" : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {(allowlistBlocklistOverlapEmails.length > 0 ||
                  groupOverlapEmails.length > 0) &&
                !allowlistDisabled ? (
                  <div ref={groupOverlapRef} className="space-y-3">
                    {allowlistBlocklistOverlapEmails.length > 0 ? (
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                        <div className="flex items-start gap-3">
                          <Warning
                            aria-hidden
                            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              Allowed emails on blocklist
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              Some allowed emails are also on the blocklist
                              (direct or via groups). Remove the overlap to
                              save.
                            </p>
                            <p className="mt-2 text-xs font-medium text-destructive">
                              {allowlistBlocklistOverlapEmails
                                .slice(0, 6)
                                .join(", ")}
                              {allowlistBlocklistOverlapEmails.length > 6
                                ? "…"
                                : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {groupOverlapEmails.length > 0 ? (
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                        <div className="flex items-start gap-3">
                          <Warning
                            aria-hidden
                            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              Overlapping group members
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              Some emails are included in both the allowlist and
                              the blocklist (via groups). Remove the overlap to
                              save.
                            </p>
                            <p className="mt-2 text-xs font-medium text-destructive">
                              {groupOverlapEmails.slice(0, 6).join(", ")}
                              {groupOverlapEmails.length > 6 ? "…" : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="dk-nocturne-kicker">Access controls</p>
                  <div className="flex flex-wrap gap-1.5">
                    {accessChips.map((label) => (
                      <Badge key={label} variant="secondary">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="dk-nocturne-kicker">Viewer controls</p>
                  <div className="flex flex-wrap gap-1.5">
                    {viewerChips.map((label) => (
                      <Badge key={label} variant="secondary">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="dk-nocturne-kicker">Analytics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analyticsChips.map((label) => (
                      <Badge key={label} variant="secondary">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 rounded border border-border/60 bg-background/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Expiration
                  </p>
                  <p className="text-sm font-medium">{expiresSummary}</p>
                </div>

                <div className="space-y-1 rounded border border-border/60 bg-background/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Viewer language
                  </p>
                  <p className="text-sm font-medium">
                    {settings.publicLanguageOverride
                      ? getPublicLanguageLabel(settings.publicLanguageOverride)
                      : `Workspace default (${getPublicLanguageLabel(
                          workspaceDefaultPublicLanguage,
                        )})`}
                  </p>
                </div>

                {linkPresets.length > 0 || onSavePreset ? (
                  <div className="space-y-3 rounded border border-border/60 bg-background/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Presets</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Apply a saved configuration or save this link’s
                          current settings.
                        </p>
                      </div>
                      {linkPresets.length > 0 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Preset actions"
                              disabled={presetPending || !selectedPresetId}
                            >
                              <DotsThree className="h-4 w-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={
                                presetPending ||
                                !presetIsApplied ||
                                !presetIsDirty ||
                                !onUpdatePreset
                              }
                              onSelect={(e) => {
                                e.preventDefault();
                                void handleUpdatePreset();
                              }}
                            >
                              <ArrowClockwise
                                aria-hidden
                                className="mr-2 h-4 w-4"
                              />
                              Update Preset
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                presetPending ||
                                !selectedPresetId ||
                                !onDeletePreset
                              }
                              className="text-destructive focus:text-destructive"
                              onSelect={(e) => {
                                e.preventDefault();
                                if (!selectedPresetId) return;
                                setDeletePresetId(selectedPresetId);
                              }}
                            >
                              <Trash aria-hidden className="mr-2 h-4 w-4" />
                              Delete Preset…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>

                    {linkPresets.length > 0 ? (
                      <div className="space-y-3">
                        <Select
                          value={selectedPresetId}
                          onValueChange={setSelectedPresetId}
                        >
                          <SelectTrigger aria-label="Select link preset">
                            <SelectValue placeholder="Select a preset" />
                          </SelectTrigger>
                          <SelectContent>
                            {linkPresets.map((preset) => (
                              <SelectItem key={preset.id} value={preset.id}>
                                {preset.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {selectedPresetSummary.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedPresetSummary.map((label) => (
                              <Badge
                                key={label}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {label}
                              </Badge>
                            ))}
                            {presetIsApplied ? (
                              <Badge variant="outline" className="text-[10px]">
                                Applied
                              </Badge>
                            ) : null}
                            {presetIsApplied && presetIsDirty ? (
                              <Badge variant="outline" className="text-[10px]">
                                Edited
                              </Badge>
                            ) : null}
                          </div>
                        ) : null}

                        {groupOverlapEmails.length > 0 ? (
                          <p className="text-xs text-destructive">
                            Overlapping allow/block group members must be
                            resolved before saving.
                          </p>
                        ) : null}
                        {allowlistBlocklistOverlapEmails.length > 0 ? (
                          <p className="text-xs text-destructive">
                            Some allowed emails are on the blocklist. Remove the
                            overlap before saving.
                          </p>
                        ) : null}

                        <div className="flex flex-col gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled={
                              !selectedPresetId ||
                              !onApplyPreset ||
                              presetPending ||
                              presetIsApplied
                            }
                            onClick={() => void handleApplyPreset()}
                          >
                            {presetPending ? (
                              <CircleNotch
                                aria-hidden
                                className="mr-2 h-4 w-4 animate-spin"
                              />
                            ) : (
                              <DownloadSimple
                                aria-hidden
                                className="mr-2 h-4 w-4"
                              />
                            )}
                            Apply Preset
                          </Button>
                          {presetIsApplied && presetIsDirty ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-full"
                              disabled={presetPending || !onUpdatePreset}
                              onClick={() => void handleUpdatePreset()}
                            >
                              {presetPending ? (
                                <CircleNotch
                                  aria-hidden
                                  className="mr-2 h-4 w-4 animate-spin"
                                />
                              ) : (
                                <ArrowClockwise
                                  aria-hidden
                                  className="mr-2 h-4 w-4"
                                />
                              )}
                              Update Preset
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        No presets saved yet.
                      </p>
                    )}

                    {onSavePreset ? (
                      <div className="border-t pt-3">
                        <p className="mb-2 text-xs font-medium">
                          Save current settings as new preset
                        </p>
                        <div className="flex flex-col gap-2">
                          <Input
                            value={presetName}
                            onChange={(event) =>
                              setPresetName(event.target.value)
                            }
                            placeholder="e.g., Board Meeting"
                            aria-label="Preset name"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            disabled={presetPending || !presetName.trim()}
                            onClick={() => void handleSavePreset()}
                          >
                            {presetPending ? (
                              <CircleNotch
                                aria-hidden
                                className="mr-2 h-4 w-4 animate-spin"
                              />
                            ) : (
                              <Plus aria-hidden className="mr-2 h-4 w-4" />
                            )}
                            Save New Preset
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {presetError ? (
                      <p className="text-xs text-destructive">{presetError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </div>

      <AlertDialog
        open={Boolean(deletePresetId)}
        onOpenChange={(open) => {
          if (!open) setDeletePresetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete preset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected preset for this
              workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={presetPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDeletePreset();
              }}
              disabled={presetPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default LinkSettingsPanel;
