import type { Metadata, ResolvingMetadata } from "next";
import DocumentsIndexPageClient from "@/components/pages/DocumentsIndexPageClient";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { redirect } from "next/navigation";

type Props = PageProps<"/documents/[...slug]">;

const DocumentsCatchAllPage: React.FC<Props> = async ({ params }) => {
  const p = (await params) as { slug?: string[] };
  const segs = (p.slug || []).filter(Boolean);

  if (segs.length === 0) {
    return <DocumentsIndexPageClient />;
  }

  const isUuid = (v: string | undefined): boolean =>
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    );

  const isLegacyLinksAnalyticsRoute =
    segs.length >= 4 &&
    segs[segs.length - 1] === "analytics" &&
    segs[segs.length - 3] === "links";
  if (isLegacyLinksAnalyticsRoute) {
    const documentId = segs[segs.length - 4];
    const linkId = segs[segs.length - 2];
    if (!isUuid(documentId) || !isUuid(linkId)) {
      redirect("/documents");
    }
    redirect(`/documents/view/${documentId}/analytics`);
  }

  const isLegacyLinksRoute =
    segs.length >= 2 && segs[segs.length - 1] === "links";
  if (isLegacyLinksRoute) {
    const documentId = segs[segs.length - 2];
    if (!isUuid(documentId)) {
      redirect("/documents");
    }
    redirect(`/documents/view/${documentId}/share`);
  }

  const isLegacyShareRoute = segs.length === 2 && segs[1] === "share";
  if (isLegacyShareRoute) {
    const documentId = segs[0];
    if (!isUuid(documentId)) {
      redirect("/documents");
    }
    redirect(`/documents/view/${documentId}/share`);
  }

  const isLegacyAnalyticsRoute = segs.length === 2 && segs[1] === "analytics";
  if (isLegacyAnalyticsRoute) {
    const documentId = segs[0];
    if (!isUuid(documentId)) {
      redirect("/documents");
    }
    redirect(`/documents/view/${documentId}/analytics`);
  }

  // Keep compatibility for /documents/<uuid> when it points to an actual document.
  if (segs.length === 1 && isUuid(segs[0])) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("documents")
      .select("id")
      .eq("id", segs[0])
      .maybeSingle();
    if (error) {
      console.error("[documents/[...slug]] documents select failed", {
        error,
        documentId: segs[0],
      });
      throw error;
    }
    if (data?.id) {
      redirect(`/documents/view/${data.id}`);
    }
  }

  return <DocumentsIndexPageClient />;
};

export default DocumentsCatchAllPage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as { slug?: string[] };
  const path = (p.slug || []).join("/") || "/";
  return {
    title: path === "/" ? "Documents" : `Documents – ${path}`,
    alternates: { canonical: `/documents/${path === "/" ? "" : path}` },
  };
}
