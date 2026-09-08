"use client";

import { useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  LinkSettingsSchema,
  type LinkSettingsInput,
} from "@/lib/validators/links";
import type { Tables, TablesUpdate } from "@/types/generated/supabase";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import {
  createShortCode,
  isValidShareSlug,
  normalizeShareSlug,
} from "@/lib/publicLinkPaths";
import { PUBLIC_LANGUAGE_VALUES } from "@/modules/public-links/types";
import { resolveStoredEmailVerification } from "@/lib/publicLinkEmailPolicy";

// Note: nda_template_id is intentionally excluded from updates
// because NDA templates are pinned at link creation and cannot be changed.
const LinkUpdateSchema = z.object({
  password: z.string().max(256).optional().nullable(),
  email_notify: z.boolean().optional(),
  expires_at: z.string().datetime().optional().nullable(),
  can_download: z.boolean().optional(),
  email_verification: z.boolean().optional(),
  screenshot_protection: z.boolean().optional(),
  apply_watermark: z.boolean().optional(),
  dynamic_watermark_variables: z.boolean().optional(),
  watermark_id: z.string().uuid().optional().nullable(),
  dynamic_watermark_email: z.boolean().optional(),
  dynamic_watermark_ip: z.boolean().optional(),
  dynamic_watermark_datetime: z.boolean().optional(),
  nda_gate: z.boolean().optional(),
  show_qas: z.boolean().optional(),
  curated_qas: z
    .array(
      z.object({
        question: z.string().min(1).max(500),
        answer: z.string().min(1).max(2000),
      }),
    )
    .optional(),
  show_feedback: z.boolean().optional(),
  comments_enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  custom_slug: z.string().trim().max(64).optional().nullable(),
  collect_email_for_analytics: z.boolean().optional(),
  public_language_override: z
    .enum(PUBLIC_LANGUAGE_VALUES)
    .optional()
    .nullable(),
});

type LinkUpdateInput = z.infer<typeof LinkUpdateSchema>;

interface UseLinksResult {
  createLink: (
    workspaceId: string,
    input: LinkSettingsInput,
    options?: { id?: string },
  ) => Promise<Tables<"links">>;
  updateLink: (
    id: string,
    updates: LinkUpdateInput,
  ) => Promise<Tables<"links">>;
}

const isUniqueViolation = (
  error: unknown,
): { isShortConflict: boolean; isCustomConflict: boolean } => {
  const code = (error as { code?: string } | null)?.code ?? "";
  const details = (
    (error as { message?: string; details?: string } | null)?.message ?? ""
  )
    .concat(" ", (error as { details?: string } | null)?.details ?? "")
    .toLowerCase();

  const isShortConflict =
    details.includes("short_code") || details.includes("uq_links_short");
  const isCustomConflict =
    details.includes("custom_slug") || details.includes("uq_links_custom");

  return {
    isShortConflict: code === "23505" && isShortConflict,
    isCustomConflict: code === "23505" && isCustomConflict,
  };
};

export const useLinks = (): UseLinksResult => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const createLink: UseLinksResult["createLink"] = useCallback(
    async (workspaceId, input, options = {}) => {
      const requiresEmailVerification = resolveStoredEmailVerification({
        emailVerification: input.email_verification,
        collectEmailForAnalytics: input.collect_email_for_analytics,
        dynamicWatermarkEmail: input.dynamic_watermark_email,
      });
      const parsed = LinkSettingsSchema.safeParse({
        ...input,
        email_verification: requiresEmailVerification,
      });
      if (!parsed.success) {
        throw new Error("Invalid link settings");
      }
      const payload = parsed.data;
      const requestedCustomSlug = (payload.custom_slug ?? "").trim();
      const normalizedCustomSlug = requestedCustomSlug
        ? normalizeShareSlug(requestedCustomSlug)
        : null;
      if (requestedCustomSlug && !normalizedCustomSlug) {
        throw new Error("Custom URL is invalid");
      }
      if (normalizedCustomSlug && !isValidShareSlug(normalizedCustomSlug)) {
        throw new Error("Custom URL is invalid");
      }
      if (normalizedCustomSlug) {
        const { data: existing, error: existingError } = await supabase
          .from("links")
          .select("id")
          .eq("workspace_id", workspaceId)
          .or(
            `short_code.eq.${normalizedCustomSlug},custom_slug.eq.${normalizedCustomSlug}`,
          )
          .limit(1);
        if (existingError) {
          throw existingError;
        }
        if ((existing ?? []).length > 0) {
          throw new Error("Custom URL is already in use");
        }
      }
      const targetDocumentId = payload.document_id ?? null;
      const targetDataRoomId = payload.data_room_id ?? null;
      let ndaTemplateId = payload.nda_template_id ?? null;
      let ndaTemplateSnapshotHtml: string | null = null;
      const dynamicEmail = payload.dynamic_watermark_email ?? false;
      const dynamicIp = payload.dynamic_watermark_ip ?? false;
      const dynamicDateTime = payload.dynamic_watermark_datetime ?? false;
      const dynamicAny = dynamicEmail || dynamicIp || dynamicDateTime;
      const commentsEnabled = payload.comments_enabled ?? false;
      if (payload.nda_gate) {
        if (!ndaTemplateId) {
          throw new Error(
            "NDA template is required when NDA gating is enabled",
          );
        }

        const { data: template, error: templateError } = await supabase
          .from("nda_templates")
          .select("body_html, workspace_id, archived_at")
          .eq("id", ndaTemplateId)
          .maybeSingle();

        if (templateError || !template) {
          throw new Error("Selected NDA template not found");
        }
        if (template.workspace_id !== workspaceId) {
          throw new Error("Selected NDA template does not belong to workspace");
        }
        if (template.archived_at) {
          throw new Error("Selected NDA template is archived");
        }

        ndaTemplateSnapshotHtml = template.body_html;
      } else {
        ndaTemplateId = null;
      }

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes?.user) {
        throw new Error("Unauthorized");
      }

      const password_hash = payload.password
        ? await bcrypt.hash(payload.password, 10)
        : null;
      const emailVerification = Boolean(payload.email_verification);

      let createdLink: Tables<"links"> | null = null;
      let attempt = 0;

      while (!createdLink && attempt < 5) {
        attempt += 1;
        const shortCode = createShortCode();
        const { data: shortCodeTaken, error: shortCodeTakenError } =
          await supabase
            .from("links")
            .select("id")
            .or(`short_code.eq.${shortCode},custom_slug.eq.${shortCode}`)
            .limit(1);
        if (shortCodeTakenError) {
          throw shortCodeTakenError;
        }
        if ((shortCodeTaken ?? []).length > 0) {
          continue;
        }

        const { data, error } = await supabase
          .from("links")
          .insert({
            ...(options.id ? { id: options.id } : {}),
            workspace_id: workspaceId,
            document_id: targetDocumentId,
            folder_id: null,
            data_room_id: targetDataRoomId,
            password_hash,
            name: payload.name,
            short_code: shortCode,
            custom_slug: normalizedCustomSlug,
            email_notify: payload.email_notify ?? false,
            expires_at: payload.expires_at ?? null,
            can_download: payload.can_download ?? false,
            email_verification: emailVerification,
            screenshot_protection: payload.screenshot_protection ?? true,
            apply_watermark: payload.apply_watermark ?? false,
            watermark_id: payload.apply_watermark
              ? (payload.watermark_id ?? null)
              : null,
            dynamic_watermark_variables: payload.apply_watermark
              ? dynamicAny
              : false,
            dynamic_watermark_email: payload.apply_watermark
              ? dynamicEmail
              : false,
            dynamic_watermark_ip: payload.apply_watermark ? dynamicIp : false,
            dynamic_watermark_datetime: payload.apply_watermark
              ? dynamicDateTime
              : false,
            nda_gate: payload.nda_gate ?? false,
            nda_template_id: ndaTemplateId,
            nda_template_snapshot_html: ndaTemplateSnapshotHtml,
            show_qas: payload.show_qas ?? false,
            curated_qas: payload.curated_qas ?? [],
            show_feedback: payload.show_feedback ?? true,
            comments_enabled: commentsEnabled,
            collect_email_for_analytics:
              payload.collect_email_for_analytics ?? false,
            public_language_override: payload.public_language_override ?? null,
            revoked_at: null,
            created_by: userRes.user.id,
          })
          .select("*")
          .single();

        if (!error && data) {
          createdLink = data as Tables<"links">;
          break;
        }

        const { isShortConflict, isCustomConflict } = isUniqueViolation(error);
        if (isCustomConflict) {
          throw new Error("Custom URL is already in use");
        }
        if (isShortConflict) {
          continue;
        }

        throw error ?? new Error("Create failed");
      }

      if (!createdLink) {
        throw new Error("Unable to generate a unique short URL");
      }

      const data = createdLink;

      trackProductEvent("link_created", {
        link_id: data.id,
        workspace_id: workspaceId,
        document_id: data.document_id ?? undefined,
        data_room_id: data.data_room_id ?? undefined,
        can_download: data.can_download,
        apply_watermark: data.apply_watermark,
        email_verification: data.email_verification,
        nda_gate: data.nda_gate,
        screenshot_protection: data.screenshot_protection,
        show_feedback: data.show_feedback,
        show_qas: data.show_qas,
        collect_email_for_analytics: data.collect_email_for_analytics,
      });

      return data as Tables<"links">;
    },
    [supabase],
  );

  const updateLink: UseLinksResult["updateLink"] = useCallback(
    async (id, updatesInput) => {
      const parsed = LinkUpdateSchema.safeParse(updatesInput);
      if (!parsed.success) {
        throw new Error("Invalid payload");
      }
      const u = parsed.data;
      const updates: TablesUpdate<"links"> = {};
      const touchesVerifiedEmailPolicy = [
        u.email_verification,
        u.nda_gate,
        u.collect_email_for_analytics,
        u.dynamic_watermark_email,
      ].some((value) => value !== undefined);
      if (touchesVerifiedEmailPolicy) {
        const { data: currentLink, error: currentLinkError } = await supabase
          .from("links")
          .select(
            "email_verification, nda_gate, collect_email_for_analytics, dynamic_watermark_email",
          )
          .eq("id", id)
          .maybeSingle();
        if (currentLinkError || !currentLink) {
          throw currentLinkError ?? new Error("Link not found");
        }
        const emailVerification =
          u.email_verification ?? currentLink.email_verification;
        const requiresOtp = resolveStoredEmailVerification({
          emailVerification,
          collectEmailForAnalytics:
            u.collect_email_for_analytics ??
            currentLink.collect_email_for_analytics,
          dynamicWatermarkEmail:
            u.dynamic_watermark_email ?? currentLink.dynamic_watermark_email,
        });
        updates.email_verification = requiresOtp;
      }
      if (u.password !== undefined) {
        updates.password_hash = u.password
          ? await bcrypt.hash(u.password, 10)
          : null;
      }
      if (u.email_notify !== undefined) updates.email_notify = u.email_notify;
      if (u.expires_at !== undefined) updates.expires_at = u.expires_at;
      if (u.can_download !== undefined) updates.can_download = u.can_download;
      if (u.screenshot_protection !== undefined)
        updates.screenshot_protection = u.screenshot_protection;
      if (u.apply_watermark !== undefined)
        updates.apply_watermark = u.apply_watermark;
      if (u.watermark_id !== undefined) updates.watermark_id = u.watermark_id;
      if (u.dynamic_watermark_variables !== undefined)
        updates.dynamic_watermark_variables = u.dynamic_watermark_variables;
      if (u.dynamic_watermark_email !== undefined)
        updates.dynamic_watermark_email = u.dynamic_watermark_email;
      if (u.dynamic_watermark_ip !== undefined)
        updates.dynamic_watermark_ip = u.dynamic_watermark_ip;
      if (u.dynamic_watermark_datetime !== undefined)
        updates.dynamic_watermark_datetime = u.dynamic_watermark_datetime;
      if (u.nda_gate !== undefined) updates.nda_gate = u.nda_gate;
      if (u.show_qas !== undefined) updates.show_qas = u.show_qas;
      if (u.curated_qas !== undefined) updates.curated_qas = u.curated_qas;
      if (u.show_feedback !== undefined)
        updates.show_feedback = u.show_feedback;
      if (u.comments_enabled !== undefined)
        updates.comments_enabled = u.comments_enabled;
      if (u.name !== undefined) updates.name = u.name;
      if (u.custom_slug !== undefined) {
        const { data: linkRow, error: linkRowError } = await supabase
          .from("links")
          .select("workspace_id")
          .eq("id", id)
          .maybeSingle();
        if (linkRowError || !linkRow?.workspace_id) {
          throw linkRowError ?? new Error("Link not found");
        }
        const workspaceId = linkRow.workspace_id;

        const rawCustomSlug = u.custom_slug ? u.custom_slug.trim() : "";
        const normalizedCustomSlug = rawCustomSlug
          ? normalizeShareSlug(rawCustomSlug)
          : null;
        if (rawCustomSlug && !normalizedCustomSlug) {
          throw new Error("Custom URL is invalid");
        }
        if (normalizedCustomSlug && !isValidShareSlug(normalizedCustomSlug)) {
          throw new Error("Custom URL is invalid");
        }
        if (normalizedCustomSlug) {
          const { data: existing, error: existingError } = await supabase
            .from("links")
            .select("id")
            .eq("workspace_id", workspaceId)
            .neq("id", id)
            .or(
              `short_code.eq.${normalizedCustomSlug},custom_slug.eq.${normalizedCustomSlug}`,
            )
            .limit(1);
          if (existingError) {
            throw existingError;
          }
          if ((existing ?? []).length > 0) {
            throw new Error("Custom URL is already in use");
          }
        }
        updates.custom_slug = normalizedCustomSlug;
      }
      if (u.collect_email_for_analytics !== undefined)
        updates.collect_email_for_analytics = u.collect_email_for_analytics;
      if (u.public_language_override !== undefined)
        updates.public_language_override = u.public_language_override;

      const { data, error } = await supabase
        .from("links")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
      if (error || !data) {
        const { isCustomConflict } = isUniqueViolation(error);
        if (isCustomConflict) {
          throw new Error("Custom URL is already in use");
        }
        throw error ?? new Error("Update failed");
      }

      const changedFields = Object.entries(u)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);

      trackProductEvent("link_updated", {
        link_id: data.id,
        workspace_id: data.workspace_id,
        document_id: data.document_id ?? undefined,
        data_room_id: data.data_room_id ?? undefined,
        changed_fields: changedFields,
      });

      return data as Tables<"links">;
    },
    [supabase],
  );

  return { createLink, updateLink };
};
