import React from "react";
import type { Metadata, ResolvingMetadata } from "next";
import PublicDataRoomViewerClient from "@/components/pages/PublicDataRoomViewerClient";
import {
  buildPublicMetadata,
  getPublicLinkLanguageForMetadata,
} from "@/modules/public-links/server/metadata";

type Props = PageProps<"/r/[dataRoomId]/[linkId]">;

const DataRoomPublicLinkPage: React.FC<Props> = async ({ params }) => {
  const p = (await params) as { dataRoomId: string; linkId: string };
  return (
    <PublicDataRoomViewerClient dataRoomId={p.dataRoomId} linkId={p.linkId} />
  );
};

export default DataRoomPublicLinkPage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as { dataRoomId: string; linkId: string };
  const canonical = `/r/${p.dataRoomId}/${p.linkId}/folders`;
  const language = await getPublicLinkLanguageForMetadata({
    linkId: p.linkId,
    dataRoomId: p.dataRoomId,
  });
  return buildPublicMetadata({
    kind: "data_room",
    language,
    canonical,
  });
}
