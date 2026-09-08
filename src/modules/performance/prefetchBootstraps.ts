"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { canUseCustomDomain } from "@/modules/custom-domains/entitlements";
import type { Tables } from "@/types/generated/supabase";
import { runCachedPrefetch } from "@/modules/performance/prefetchCache";
import {
  resolveWatermarkDefinition,
  type BrandingRecord,
} from "@/lib/branding";
import type { WatermarkTemplateRow } from "@/lib/watermarks";
import { createWorkspaceSlug } from "@/lib/publicLinkPaths";

const LINKS_MANAGER_CACHE_TTL_MS = 45_000;

type ResourceType = "document" | "data_room";

export const prefetchLinksManagerBootstrap = async (params: {
  workspaceId: string;
  resourceType: ResourceType;
  resourceId: string;
}): Promise<void> => {
  const { workspaceId, resourceType, resourceId } = params;
  if (!workspaceId || !resourceId) return;

  const supabase = createSupabaseBrowserClient();
  const linksCacheKey = `links-manager:links:${resourceType}:${resourceId}`;
  const brandingCacheKey = `links-manager:branding:${workspaceId}`;
  const customDomainCacheKey = `links-manager:custom-domain:${workspaceId}`;

  await Promise.all([
    runCachedPrefetch(
      linksCacheKey,
      async () => {
        const query =
          resourceType === "document"
            ? supabase
                .from("links")
                .select("*")
                .eq("document_id", resourceId)
                .order("created_at", { ascending: false })
            : supabase
                .from("links")
                .select("*")
                .eq("data_room_id", resourceId)
                .order("created_at", { ascending: false });
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Tables<"links">[];
      },
      LINKS_MANAGER_CACHE_TTL_MS,
    ),
    runCachedPrefetch(
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
        const brandingRecord =
          (brandingRes.data as BrandingRecord | null) ?? null;
        return {
          watermarkDefinition: resolveWatermarkDefinition(brandingRecord),
          watermarkTemplates: (watermarksRes.data ??
            []) as WatermarkTemplateRow[],
        };
      },
      LINKS_MANAGER_CACHE_TTL_MS,
    ),
    // Share-URL read of active_custom_domain_id stays empty until configured.
    runCachedPrefetch(
      customDomainCacheKey,
      async () => {
        const { data: subscriptionRow, error: subscriptionError } =
          await supabase
            .from("workspace_subscriptions")
            .select("*")
            .eq("workspace_id", workspaceId)
            .maybeSingle();
        if (subscriptionError) {
          throw subscriptionError;
        }
        const subscription = mapWorkspaceSubscriptionRow(subscriptionRow);
        const enabled = canUseCustomDomain(subscription);
        if (!enabled) {
          const { data: ws, error: workspaceError } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", workspaceId)
            .maybeSingle();
          if (workspaceError) {
            throw workspaceError;
          }
          if (!ws?.name) {
            throw new Error(
              `[prefetchLinksManagerBootstrap] Workspace not found: ${workspaceId}`,
            );
          }
          return {
            customDomainsEnabled: false,
            activeCustomDomain: null,
            workspaceSlug: createWorkspaceSlug(ws.name),
          };
        }

        const { data: ws, error: workspaceError } = await supabase
          .from("workspaces")
          .select("name, active_custom_domain_id")
          .eq("id", workspaceId)
          .maybeSingle();
        if (workspaceError) {
          throw workspaceError;
        }
        if (!ws?.name) {
          throw new Error(
            `[prefetchLinksManagerBootstrap] Workspace not found: ${workspaceId}`,
          );
        }
        const workspaceSlug = createWorkspaceSlug(
          (
            ws as {
              name: string;
              active_custom_domain_id?: string | null;
            }
          ).name,
        );
        const domainId = (
          ws as {
            name?: string | null;
            active_custom_domain_id?: string | null;
          } | null
        )?.active_custom_domain_id;
        if (!domainId) {
          return {
            customDomainsEnabled: true,
            activeCustomDomain: null,
            workspaceSlug,
          };
        }
        const { data: cd, error: customDomainError } = await supabase
          .from("custom_domains")
          .select("domain,status")
          .eq("id", domainId)
          .maybeSingle();
        if (customDomainError) {
          throw customDomainError;
        }
        const row = cd as { domain?: string | null; status?: string } | null;
        return {
          customDomainsEnabled: true,
          activeCustomDomain:
            row?.status === "verified" && row.domain ? row.domain : null,
          workspaceSlug,
        };
      },
      LINKS_MANAGER_CACHE_TTL_MS,
    ),
  ]);
};
