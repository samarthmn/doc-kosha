import React from "react";
import type { Metadata, ResolvingMetadata } from "next";
import PublicDataRoomViewerClient from "@/components/pages/PublicDataRoomViewerClient";
import {
  buildPublicMetadata,
  getPublicLinkLanguageForMetadata,
} from "@/modules/public-links/server/metadata";

type Props = PageProps<"/r/[dataRoomId]/[linkId]/folders/[[...slug]]">;

const DataRoomFoldersPage: React.FC<Props> = async ({ params }) => {
  const p = (await params) as {
    dataRoomId: string;
    linkId: string;
    slug?: string[];
  };
  return (
    <PublicDataRoomViewerClient
      dataRoomId={p.dataRoomId}
      linkId={p.linkId}
      slug={p.slug}
    />
  );
};

export default DataRoomFoldersPage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as {
    dataRoomId: string;
    linkId: string;
    slug?: string[];
  };
  const suffix = p.slug && p.slug.length ? `/${(p.slug || []).join("/")}` : "";
  const canonical = `/r/${p.dataRoomId}/${p.linkId}/folders${suffix}`;
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
