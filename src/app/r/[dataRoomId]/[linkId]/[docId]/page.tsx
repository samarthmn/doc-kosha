import React from "react";
import PublicDocumentViewerClient from "@/components/pages/PublicDocumentViewerClient";
import type { Metadata, ResolvingMetadata } from "next";
import {
  buildPublicMetadata,
  getPublicLinkLanguageForMetadata,
} from "@/modules/public-links/server/metadata";

type Params = {
  dataRoomId: string;
  linkId: string;
  docId: string;
};

type Props = PageProps<"/r/[dataRoomId]/[linkId]/[docId]">;

const DataRoomDocumentPage: React.FC<Props> = async ({ params }) => {
  const p = (await params) as Params;
  return (
    <PublicDocumentViewerClient
      documentId={p.docId}
      linkId={p.linkId}
      dataRoomId={p.dataRoomId}
    />
  );
};

export default DataRoomDocumentPage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as Params;
  const canonical = `/r/${p.dataRoomId}/${p.linkId}/${p.docId}`;
  const language = await getPublicLinkLanguageForMetadata({
    linkId: p.linkId,
    documentId: p.docId,
    dataRoomId: p.dataRoomId,
  });
  return buildPublicMetadata({
    kind: "document",
    language,
    canonical,
  });
}
