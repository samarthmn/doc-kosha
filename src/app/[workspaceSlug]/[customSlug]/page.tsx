import React, { cache } from "react";
import type { Metadata, ResolvingMetadata } from "next";
import { notFound, redirect } from "next/navigation";
import PublicDocumentViewerClient from "@/components/pages/PublicDocumentViewerClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  createWorkspaceSlug,
  isReservedWorkspaceSegment,
  isValidShareSlug,
  normalizeShareSlug,
  resolveEffectiveLinkSlug,
  selectWorkspaceScopedLink,
} from "@/lib/publicLinkPaths";
import { buildPublicMetadata } from "@/modules/public-links/server/metadata";
import { resolveEffectivePublicLanguage } from "@/modules/public-links/server/settings";

export const dynamic = "force-dynamic";

type Props = PageProps<"/[workspaceSlug]/[customSlug]">;

type LinkRow = {
  id: string;
  workspace_id: string;
  document_id: string | null;
  data_room_id: string | null;
  short_code: string | null;
  custom_slug: string | null;
  public_language_override: string | null;
};

const LINK_SELECT =
  "id, workspace_id, document_id, data_room_id, short_code, custom_slug, public_language_override" as const;
const LINK_LOOKUP_PAGE_SIZE = 100;
const LINK_LOOKUP_MAX_PAGES = 10;

type LinkLookupResult =
  | { status: "resolved"; link: LinkRow; workspaceName: string }
  | { status: "absent" }
  | { status: "ambiguous" }
  | { status: "error" };

const resolveWorkspaceScopedLink = cache(
  async (
    workspaceSlug: string,
    linkSlug: string,
  ): Promise<LinkLookupResult> => {
    const supabase = createSupabaseServiceClient();
    const findByColumn = async (
      column: "custom_slug" | "short_code",
    ): Promise<LinkLookupResult> => {
      const links: LinkRow[] = [];
      const workspaces: { id: string; name: string }[] = [];
      let exhausted = false;

      for (let page = 0; page < LINK_LOOKUP_MAX_PAGES; page += 1) {
        const offset = page * LINK_LOOKUP_PAGE_SIZE;
        const { data: pageLinks, error: linksError } = await supabase
          .from("links")
          .select(LINK_SELECT)
          .eq(column, linkSlug)
          .order("id", { ascending: true })
          .range(offset, offset + LINK_LOOKUP_PAGE_SIZE - 1);
        if (linksError || !pageLinks) return { status: "error" };
        if (pageLinks.length === 0) {
          exhausted = true;
          break;
        }

        links.push(...pageLinks);
        const workspaceIds = [
          ...new Set(pageLinks.map((link) => link.workspace_id)),
        ];
        const { data: pageWorkspaces, error: workspacesError } = await supabase
          .from("workspaces")
          .select("id, name")
          .in("id", workspaceIds);
        if (workspacesError || !pageWorkspaces) return { status: "error" };
        workspaces.push(...pageWorkspaces);

        if (pageLinks.length < LINK_LOOKUP_PAGE_SIZE) {
          exhausted = true;
          break;
        }
      }
      if (!exhausted) return { status: "error" };

      return selectWorkspaceScopedLink({
        links,
        workspaces,
        workspaceSlug,
      });
    };

    const customLookup = await findByColumn("custom_slug");
    if (customLookup.status !== "absent") return customLookup;
    return findByColumn("short_code");
  },
);

const PublicShortLinkPage: React.FC<Props> = async ({ params }) => {
  const p = (await params) as { workspaceSlug: string; customSlug: string };
  const workspaceSlug = p.workspaceSlug?.trim().toLowerCase() ?? "";
  const customSlug = p.customSlug?.trim().toLowerCase() ?? "";

  if (
    !workspaceSlug ||
    !customSlug ||
    isReservedWorkspaceSegment(workspaceSlug) ||
    !isValidShareSlug(workspaceSlug) ||
    !isValidShareSlug(customSlug)
  ) {
    notFound();
  }

  // Prefer custom slugs over short codes when both match (cross-column collisions
  // are possible because the DB uniqueness constraints are per-column).
  const resolved = await resolveWorkspaceScopedLink(workspaceSlug, customSlug);
  if (resolved.status === "error") {
    throw new Error("Unable to resolve the public link");
  }
  if (resolved.status !== "resolved") notFound();
  const { link, workspaceName } = resolved;

  const expectedWorkspaceSlug = createWorkspaceSlug(workspaceName);
  const canonicalLinkSlug = resolveEffectiveLinkSlug(link);
  if (!canonicalLinkSlug) {
    notFound();
  }
  if (
    workspaceSlug !== expectedWorkspaceSlug ||
    customSlug !== canonicalLinkSlug
  ) {
    redirect(`/${expectedWorkspaceSlug}/${canonicalLinkSlug}`);
  }

  if (link.document_id) {
    return (
      <PublicDocumentViewerClient
        documentId={link.document_id}
        linkId={link.id}
      />
    );
  }
  if (link.data_room_id) {
    redirect(`/r/${link.data_room_id}/${link.id}/folders`);
  }
  notFound();
};

export default PublicShortLinkPage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as { workspaceSlug: string; customSlug: string };
  const normalizedWorkspaceSlug =
    normalizeShareSlug(p.workspaceSlug ?? "") ||
    (p.workspaceSlug?.trim().toLowerCase() ?? "");
  const normalizedCustomSlug =
    normalizeShareSlug(p.customSlug ?? "") ||
    (p.customSlug?.trim().toLowerCase() ?? "");
  const canonical = `/${normalizedWorkspaceSlug}/${normalizedCustomSlug}`;
  const resolved = await resolveWorkspaceScopedLink(
    normalizedWorkspaceSlug,
    normalizedCustomSlug,
  );
  if (resolved.status === "error") {
    throw new Error("Unable to resolve public link metadata");
  }
  const link = resolved.status === "resolved" ? resolved.link : null;
  const language = link
    ? await resolveEffectivePublicLanguage({
        workspaceId: link.workspace_id,
        linkPublicLanguageOverride: link.public_language_override,
      })
    : "en";
  return buildPublicMetadata({
    kind: "secure_link",
    language,
    canonical,
  });
}
