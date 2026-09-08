import React from "react";
import PublicDocumentViewerClient from "@/components/pages/PublicDocumentViewerClient";
import type { Metadata, ResolvingMetadata } from "next";
import {
  buildPublicMetadata,
  getPublicLinkLanguageForMetadata,
} from "@/modules/public-links/server/metadata";

type Props = PageProps<"/d/[document-id]/[link-id]">;

const PublicLinkPage: React.FC<Props> = async ({ params, searchParams }) => {
  const p = (await params) as { [key: string]: string };
  const sp = (await searchParams) as { [key: string]: string | undefined };
  const documentId = p["document-id"] as string;
  const linkId = p["link-id"] as string;
  const dataRoomId = sp?.dataRoomId;
  return (
    <PublicDocumentViewerClient
      documentId={documentId}
      linkId={linkId}
      dataRoomId={dataRoomId}
    />
  );
};

export default PublicLinkPage;

export async function generateMetadata(
  { params, searchParams }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as { [key: string]: string };
  const sp = (await searchParams) as { [key: string]: string | undefined };
  const documentId = p["document-id"] as string;
  const linkId = p["link-id"] as string;
  const dataRoomId = sp?.dataRoomId;
  const url = dataRoomId
    ? `/d/${documentId}/${linkId}?dataRoomId=${encodeURIComponent(dataRoomId)}`
    : `/d/${documentId}/${linkId}`;
  const language = await getPublicLinkLanguageForMetadata({
    linkId,
    documentId,
  });
  return buildPublicMetadata({
    kind: "document",
    language,
    canonical: url,
  });
}
